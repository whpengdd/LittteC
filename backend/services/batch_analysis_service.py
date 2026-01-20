"""
批量分析服务 - 后台批量 LLM 分析核心逻辑

提供并行处理、失败重试和进度跟踪功能。
"""
import asyncio
import uuid
from typing import Dict, List, Optional, Any
from datetime import datetime
import json

from services.db_service import get_db_service
from services.config_service import get_config_service


# 默认分析 Prompt 模板（涉密/合规分析 + 标签提取）
DEFAULT_ANALYSIS_PROMPT = """基于以下邮件往来，以 JSON 格式返回分析结果：
{
    "risk_level": "低/中/高",
    "summary": "100字以内的核心内容简述",
    "tags": ["标签1", "标签2", "标签3"],
    "key_findings": "如有敏感或合规相关内容，请说明；否则留空"
}

邮件内容：
{content}

请只输出 JSON，不要有任何前缀或解释。所有字段值必须使用**简体中文**。risk_level 必须是 "高"、"中"、"低" 之一。"""

# 默认过滤关键词
DEFAULT_FILTER_KEYWORDS = [
    "Systems bounce",
    "Verify",
    "Auto-Reply",
    "Out of Office",
    "Delivery Status",
    "Undeliverable"
]

# 正在运行的任务存储
_running_jobs: Dict[str, asyncio.Task] = {}


class BatchAnalysisService:
    """批量分析服务"""
    
    def __init__(self):
        self.db = get_db_service()
        # 任务级别的脱敏服务实例管理（确保同一任务中 Token 一致）
        self.task_masking_services = {}  # task_id -> PIIMaskingService
        # 服务启动时清理僵尸任务
        self._cleanup_zombie_jobs()
    
    async def create_and_start_job(
        self,
        task_id: str,
        prompt: str = None,
        filter_keywords: List[str] = None,
        model: str = None,
        concurrency: int = 5,
        max_retries: int = 3,
        analysis_type: str = "email"
    ) -> Dict[str, Any]:
        """
        创建并启动批量分析任务
        
        Args:
            task_id: 邮件任务 ID
            prompt: 分析 Prompt，为空则使用默认模板
            filter_keywords: 过滤关键词列表
            model: AI 模型 (gemini/azure)
            concurrency: 并行度
            max_retries: 最大重试次数
            analysis_type: 分析类型 ("email", "people_cluster", "subject_cluster")
        
        Returns:
            任务详情
        """
        job_id = str(uuid.uuid4())
        
        # 使用默认值
        if prompt is None:
            prompt = DEFAULT_ANALYSIS_PROMPT
        if filter_keywords is None:
            filter_keywords = DEFAULT_FILTER_KEYWORDS
        if model is None:
            model = get_config_service().get_llm_provider()
        
        # 创建任务记录
        job = self.db.create_batch_job(
            job_id=job_id,
            task_id=task_id,
            prompt=prompt,
            filter_keywords=filter_keywords,
            model_provider=model,
            concurrency=concurrency,
            max_retries=max_retries,
            analysis_type=analysis_type
        )
        
        # 在后台启动任务
        task = asyncio.create_task(self._run_job(job_id))
        _running_jobs[job_id] = task
        
        return job
    
    async def resume_job(self, old_job_id: str) -> Dict[str, Any]:
        """
        恢复已中断或取消的任务
        本质是创建一个新任务，但使用旧任务的配置
        由于 analyze process 会检查是否已分析，所以会自动跳过已完成的
        """
        old_job = self.db.get_batch_job(old_job_id)
        if not old_job:
            raise ValueError("Job not found")
            
        # 使用旧配置创建新任务
        return await self.create_and_start_job(
            task_id=old_job["task_id"],
            prompt=old_job["prompt"],
            filter_keywords=old_job["filter_keywords"],
            model=old_job["model_provider"],
            concurrency=old_job["concurrency"],
            max_retries=old_job["max_retries"],
            analysis_type=old_job.get("analysis_type", "email")
        )
    
    async def _run_job(self, job_id: str):
        """执行批量分析任务（后台运行）"""
        db = get_db_service()
        
        try:
            # 获取任务详情
            job = db.get_batch_job(job_id)
            if not job:
                print(f"[BatchAnalysis] Job {job_id} not found")
                return
            
            print(f"[BatchAnalysis] Starting job {job_id} with concurrency {job['concurrency']}")
            
            # 更新状态为运行中
            db.update_batch_job_status(job_id, "RUNNING")
            
            analysis_type = job.get("analysis_type", "email")
            
            if analysis_type == "email":
                # === 邮件分析逻辑 ===
                emails, skipped_count = db.get_emails_for_batch_analysis(
                    job["task_id"],
                    job.get("filter_keywords", [])
                )
                items_to_process = emails
            else:
                # === 聚类分析逻辑 ===
                # 解析 cluster_type: "people_cluster" -> "people", "subject_cluster" -> "subjects"
                cluster_type = "people" if analysis_type == "people_cluster" else "subjects"
                clusters = db.get_clusters_for_batch_analysis(job["task_id"], cluster_type)
                items_to_process = clusters
                skipped_count = 0 # 聚类分析暂无过滤逻辑

            total_count = len(items_to_process) + skipped_count
            db.update_batch_job_total_count(job_id, total_count)
            
            print(f"[BatchAnalysis] Job {job_id} ({analysis_type}): {len(items_to_process)} items to process")
            
            # 初始化计数器
            processed = 0
            success = 0
            failed = 0
            
            # 获取 AI 服务
            ai_service = self._get_ai_service(job["model_provider"])
            
            # 并发控制
            semaphore = asyncio.Semaphore(job["concurrency"])
            
            async def process_item(item):
                async with semaphore:
                    try:
                        if analysis_type == "email":
                            # === 邮件处理 ===
                            email = item
                            # 检查是否已有分析结果
                            if db.has_email_analysis(email["id"], "batch_summary"):
                                print(f"[BatchAnalysis] Email {email['id']}: Already analyzed, skipping")
                                return "EXISTING"
                            
                            print(f"[BatchAnalysis] Processing email {email['id']}")
                            
                            # 执行分析（带重试）
                            result = await self._analyze_with_retry(
                                ai_service,
                                email,
                                job["prompt"],
                                job["max_retries"],
                                task_id=job["task_id"]  # 传递 task_id 确保脱敏 Token 一致性
                            )
                            
                            # 保存结果
                            if result:
                                analysis_id = str(uuid.uuid4())
                                db.save_analysis_result(
                                    result_id=analysis_id,
                                    task_id=job["task_id"],
                                    email_id=email["id"],
                                    analysis_type="batch_summary",
                                    model_provider=job["model_provider"],
                                    result=result
                                )
                                print(f"[BatchAnalysis] Email {email['id']}: Success")
                                return "SUCCESS"
                            else:
                                print(f"[BatchAnalysis] Email {email['id']}: Failed (no result)")
                                return "FAILED"

                        else:
                            # === 聚类处理 ===
                            cluster = item
                            cluster_key = cluster["key"]
                            
                            # 检查是否已有分析结果 (可选，目前聚类分析总是允许覆盖更新，或者我们可以检查 updated_at)
                            # 这里暂不跳过，因为聚类内容可能变化
                            
                            print(f"[BatchAnalysis] Processing cluster {cluster_key}")
                            
                            # 执行分析
                            cluster_type_short = "people" if analysis_type == "people_cluster" else "subjects"
                            
                             # 获取聚类邮件 (limit 20)
                            if cluster_type_short == "people":
                                parts = cluster_key.split(" ↔ ")
                                if len(parts) == 2:
                                    emails = db.get_emails_by_participants(job["task_id"], parts[0], parts[1], limit=20)
                                else:
                                    emails = []
                            else:
                                emails = db.get_emails_by_subject(job["task_id"], cluster_key, limit=20)
                            
                            if not emails:
                                return "FAILED"

                            # 执行分析（带重试）
                            result = await self._analyze_cluster_with_retry(
                                ai_service,
                                emails,
                                job["prompt"],  # 可以在这里根据 analysis_type 调整默认 prompt
                                job["max_retries"],
                                task_id=job["task_id"]  # 传递 task_id 确保脱敏 Token 一致性
                            )
                            
                            if result:
                                db.save_cluster_insight(
                                    task_id=job["task_id"],
                                    cluster_type=cluster_type_short,
                                    cluster_key=cluster_key,
                                    ai_insight=result,
                                    model=job["model_provider"]
                                )
                                print(f"[BatchAnalysis] Cluster {cluster_key}: Success")
                                return "SUCCESS"
                            else:
                                return "FAILED"

                    except Exception as e:
                        print(f"[BatchAnalysis] Error processing item: {e}")
                        return "FAILED"

            # 创建并执行所有任务
            tasks = [process_item(item) for item in items_to_process]
            
            if tasks:
                for future in asyncio.as_completed(tasks):
                    status = await future
                    
                    if status == "SUCCESS":
                        success += 1
                    elif status == "FAILED":
                        failed += 1
                    elif status == "EXISTING":
                        success += 1
                        
                    processed += 1
                    
                    # 实时更新进度
                    db.update_batch_job_progress(
                        job_id, processed, success, failed, skipped_count
                    )
            
            # 更新状态为完成
            db.update_batch_job_status(job_id, "COMPLETED")
            print(f"[BatchAnalysis] Job {job_id} completed: {success} success, {failed} failed")
            
        except asyncio.CancelledError:
             print(f"[BatchAnalysis] Job {job_id} cancelled")
             db.update_batch_job_status(job_id, "CANCELLED")
             # 不需要 re-raise，否则外层会报错，这里已经处理了状态
             
        except Exception as e:
            print(f"[BatchAnalysis] Job {job_id} failed: {e}")
            db.update_batch_job_status(job_id, "FAILED", str(e))
        
        finally:
            # 清理任务引用
            if job_id in _running_jobs:
                del _running_jobs[job_id]
    
    async def _analyze_with_retry(
        self,
        ai_service,
        email: Dict[str, Any],
        prompt_template: str,
        max_retries: int,
        task_id: str = None
    ) -> Optional[Dict[str, Any]]:
        """带重试的单封邮件分析"""
        from services.pii_masking_service import PIIMaskingService
        
        # 获取或创建任务级别的脱敏服务实例
        if task_id and task_id not in self.task_masking_services:
            self.task_masking_services[task_id] = PIIMaskingService()
        masking_service = self.task_masking_services.get(task_id) if task_id else PIIMaskingService()
        
        # 构建分析文本
        raw_text = f"主题: {email.get('subject', '无主题')}\n\n{email.get('content', '')}"
        
        # 🔒 脱敏处理：将敏感信息替换为 Token
        masked_text, token_map = masking_service.mask_text(raw_text)
        
        # 记录脱敏统计（调试用）
        if token_map:
            stats = masking_service.get_statistics()
            print(f"[PII] Email {email.get('id')}: 脱敏统计 {stats}")
        
        for attempt in range(max_retries):
            try:
                print(f"[BatchAnalysis] Email {email['id']}: Analysis attempt {attempt + 1}/{max_retries} start")
                
                # 调用 AI 服务（增加 60秒 超时保护）
                # 使用 asyncio.wait_for 防止 API 调用无限挂起
                # ⚠️ 关键：使用脱敏后的文本，确保敏感信息不泄露给 LLM
                result_model = await asyncio.wait_for(
                    ai_service.analyze_email(masked_text, prompt_template),
                    timeout=60.0
                )
                
                print(f"[BatchAnalysis] Email {email['id']}: API call success (PII masked)")

                # 转换为字典
                return result_model.model_dump()
                
            except asyncio.TimeoutError:
                print(f"[BatchAnalysis] Email {email['id']}: Attempt {attempt + 1} TIMEOUT (60s)")
                if attempt < max_retries - 1:
                    await asyncio.sleep(1) # 短暂等待后重试
                
            except Exception as e:
                print(f"[BatchAnalysis] Attempt {attempt + 1}/{max_retries} failed: {e}")
                
                if attempt < max_retries - 1:
                    # 指数退避
                    wait_time = (2 ** attempt) + (0.1 * attempt)
                    await asyncio.sleep(wait_time)
                else:
                    return None
        
        return None
    
    def _get_ai_service(self, model: str):
        """获取 AI 服务实例"""
        if model == "azure":
            from services.azure_service import AzureService
            return AzureService()
        else:
            from services.gemini_service import GeminiService
            return GeminiService()
    
    def get_job_status(self, job_id: str) -> Optional[Dict[str, Any]]:
        """获取任务状态"""
        return self.db.get_batch_job(job_id)
    
    def get_jobs_by_task(self, task_id: str) -> List[Dict[str, Any]]:
        """获取指定任务的所有分析作业"""
        return self.db.get_batch_jobs_by_task(task_id)
    
    async def cancel_job(self, job_id: str) -> bool:
        """取消任务"""
        # 更新数据库状态
        self.db.update_batch_job_status(job_id, "CANCELLED")
        
        # 尝试取消正在运行的任务
        if job_id in _running_jobs:
            task = _running_jobs[job_id]
            task.cancel()
            del _running_jobs[job_id]
            return True
        
        return False
    
    def _cleanup_zombie_jobs(self):
        """
        清理僵尸任务：将数据库中状态为 RUNNING/PENDING 但内存中不存在的任务标记为 INTERRUPTED
        这通常发生在服务重启后
        """
        try:
            # 获取所有任务
            all_tasks = self.db.get_tasks()
            
            for task in all_tasks:
                jobs = self.db.get_batch_jobs_by_task(task["id"])
                for job in jobs:
                    if job["status"] in ("RUNNING", "PENDING") and job["id"] not in _running_jobs:
                        print(f"[BatchAnalysis] 清理僵尸任务: {job['id']} (原状态: {job['status']})")
                        self.db.update_batch_job_status(job["id"], "INTERRUPTED", "服务重启后任务被中断")
        except Exception as e:
            print(f"[BatchAnalysis] 清理僵尸任务时出错: {e}")
    
    async def _analyze_cluster_with_retry(
        self,
        ai_service,
        emails: List[Dict[str, Any]],
        prompt_template: str,
        max_retries: int,
        task_id: str = None
    ) -> Optional[str]:
        """带重试的聚类分析"""
        import json as json_lib
        from services.email_dedup_service import EmailDedupService
        from services.pii_masking_service import PIIMaskingService
        
        # 获取或创建任务级别的脱敏服务实例
        if task_id and task_id not in self.task_masking_services:
            self.task_masking_services[task_id] = PIIMaskingService()
        masking_service = self.task_masking_services.get(task_id) if task_id else PIIMaskingService()
        
        # 构建分析上下文
        raw_context = EmailDedupService.build_deduped_context(emails)
        
        # 🔒 脱敏处理：将敏感信息替换为 Token
        masked_context, token_map = masking_service.mask_text(raw_context)
        
        # 记录脱敏统计（调试用）
        if token_map:
            stats = masking_service.get_statistics()
            print(f"[PII] Cluster: 脱敏统计 {stats}")
        
        for attempt in range(max_retries):
            try:
                # 调用 AI 服务
                # ⚠️ 关键：使用脱敏后的上下文，确保敏感信息不泄露给 LLM
                result_model = await asyncio.wait_for(
                    ai_service.analyze_email(masked_context, prompt_template),
                    timeout=90.0  # 聚类文本较长，给予更多时间
                )
                
                # 聚类分析目前期望返回 JSON 字符串
                return json_lib.dumps(result_model.model_dump(), ensure_ascii=False)
                
            except asyncio.TimeoutError:
                if attempt < max_retries - 1:
                    await asyncio.sleep(2)
            except Exception as e:
                # print(f"Cluster analysis failed: {e}") # Debug log
                if attempt < max_retries - 1:
                    await asyncio.sleep((2 ** attempt))
                else:
                    return None
        
        return None


# 单条邮件分析
async def analyze_single_email(
    task_id: str,
    email_id: int,
    prompt: str = None,
    model: str = None
) -> Dict[str, Any]:
    """
    分析单条邮件
    
    Args:
        task_id: 任务 ID
        email_id: 邮件 ID
        prompt: 分析 Prompt
        model: AI 模型
    
    Returns:
        分析结果
    """
    import json as json_lib
    
    db = get_db_service()
    
    # 获取邮件
    email = db.get_email_by_id(email_id)
    if not email:
        raise ValueError("邮件不存在")
    
    if email.get("task_id") != task_id:
        raise ValueError("邮件不属于该任务")
    
    # 使用默认值或从最近的批量任务中获取 Prompt
    if prompt is None:
        # 尝试获取最近的批量分析任务配置
        jobs = db.get_batch_jobs_by_task(task_id)
        # 过滤出邮件分析类型的任务
        latest_email_job = next((job for job in jobs if job.get("analysis_type", "email") == "email"), None)
        
        if latest_email_job and latest_email_job.get("prompt"):
            prompt = latest_email_job["prompt"]
        else:
            prompt = DEFAULT_ANALYSIS_PROMPT
            
    if model is None:
        model = get_config_service().get_llm_provider()
    
    # 获取 AI 服务
    if model == "azure":
        from services.azure_service import AzureService
        ai_service = AzureService()
    else:
        from services.gemini_service import GeminiService
        ai_service = GeminiService()
    
    # 构建分析文本
    raw_text = f"主题: {email.get('subject', '无主题')}\n\n{email.get('content', '')}"
    
    # 🔒 脱敏处理：防止敏感信息泄露给 LLM
    from services.pii_masking_service import PIIMaskingService
    masking_service = PIIMaskingService()
    masked_text, token_map = masking_service.mask_text(raw_text)
    
    # 记录脱敏统计（调试用）
    if token_map:
        stats = masking_service.get_statistics()
        print(f"[PII] Single Email {email_id}: 脱敏统计 {stats}")
    
    # 调用 AI
    # 使用 unified analyze_email
    try:
        result_model = await ai_service.analyze_email(masked_text, prompt)
        analysis_result = result_model.model_dump()
        analysis_result["analyzed_at"] = datetime.now().isoformat()
    except Exception as e:
        # Fallback for failure
        analysis_result = {
            "summary": "分析失败",
            "risk_level": "低",
            "tags": [],
            "key_findings": f"Error: {str(e)}",
            "key_points": [],
            "analyzed_at": datetime.now().isoformat()
        }
    
    # 保存结果
    analysis_id = str(uuid.uuid4())
    db.save_analysis_result(
        result_id=analysis_id,
        task_id=task_id,
        email_id=email_id,
        analysis_type="batch_summary",
        model_provider=model,
        result=analysis_result
    )
    
    return {
        "analysis_id": analysis_id,
        "email_id": email_id,
        "model_provider": model,
        "result": analysis_result
    }


# 全局服务实例
_batch_analysis_service: Optional[BatchAnalysisService] = None


def get_batch_analysis_service() -> BatchAnalysisService:
    """获取批量分析服务实例（单例模式）"""
    global _batch_analysis_service
    if _batch_analysis_service is None:
        _batch_analysis_service = BatchAnalysisService()
    return _batch_analysis_service
