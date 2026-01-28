"""
批量分析 API - 提供批量 LLM 分析能力

端点:
- POST /api/batch-analysis/start - 启动批量分析
- GET /api/batch-analysis/{job_id}/status - 获取任务状态
- POST /api/batch-analysis/{job_id}/cancel - 取消任务
- GET /api/batch-analysis/jobs/{task_id} - 获取任务的所有分析作业
- POST /api/batch-analysis/single - 单条邮件分析
- GET /api/batch-analysis/defaults - 获取默认配置
"""
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Optional, List

from services.batch_analysis_service import (
    get_batch_analysis_service,
    analyze_single_email,
    DEFAULT_ANALYSIS_PROMPT,
    DEFAULT_FILTER_KEYWORDS
)
from services.db_service import get_db_service


router = APIRouter(prefix="/api/batch-analysis", tags=["batch-analysis"])


# ===== 请求/响应模型 =====

class BatchAnalysisStartRequest(BaseModel):
    """启动批量分析请求"""
    task_id: str
    prompt: Optional[str] = None  # 为空使用默认 Prompt
    filter_keywords: Optional[List[str]] = None  # 为空使用默认关键词
    model: Optional[str] = None  # 仅支持 azure，为空使用全局配置
    concurrency: int = Field(default=5, ge=1, le=20)  # 并行度 1-20
    max_retries: int = Field(default=3, ge=1, le=10)  # 重试次数 1-10
    analysis_type: str = "email"  # email, people_cluster, subject_cluster


class SingleAnalysisRequest(BaseModel):
    """单条邮件分析请求"""
    task_id: str
    email_id: int
    prompt: Optional[str] = None
    model: Optional[str] = None


class BatchAnalysisResponse(BaseModel):
    """批量分析响应"""
    job_id: str
    task_id: str
    status: str
    message: str


# ===== API 端点 =====

@router.post("/start", response_model=BatchAnalysisResponse)
async def start_batch_analysis(request: BatchAnalysisStartRequest):
    """
    启动批量分析任务
    
    任务在后台异步执行，关闭页面不影响进度。
    可通过 /status 端点查询进度。
    """
    db = get_db_service()
    
    # 验证任务存在
    task = db.get_task(request.task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    # 检查是否有正在运行的分析任务
    existing_jobs = db.get_batch_jobs_by_task(request.task_id)
    running_jobs = [j for j in existing_jobs if j["status"] == "RUNNING"]
    if running_jobs:
        raise HTTPException(
            status_code=409, 
            detail=f"任务 {request.task_id} 已有正在运行的分析作业: {running_jobs[0]['id']}"
        )
    
    # 启动批量分析
    service = get_batch_analysis_service()
    job = await service.create_and_start_job(
        task_id=request.task_id,
        prompt=request.prompt,
        filter_keywords=request.filter_keywords,
        model=request.model,
        concurrency=request.concurrency,
        max_retries=request.max_retries,
        analysis_type=request.analysis_type
    )
    
    return BatchAnalysisResponse(
        job_id=job["id"],
        task_id=request.task_id,
        status="RUNNING",
        message="批量分析任务已启动，请通过 /status 端点查询进度"
    )


@router.get("/{job_id}/status")
async def get_batch_analysis_status(job_id: str):
    """
    获取批量分析任务的状态和进度
    """
    service = get_batch_analysis_service()
    job = service.get_job_status(job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail="分析任务不存在")
    
    # 计算进度百分比
    progress_percent = 0
    if job["total_count"] > 0:
        progress_percent = round(
            (job["processed_count"] + job["skipped_count"]) / job["total_count"] * 100, 1
        )
    
    return {
        "job_id": job["id"],
        "task_id": job["task_id"],
        "status": job["status"],
        "progress": {
            "total": job["total_count"],
            "processed": job["processed_count"],
            "success": job["success_count"],
            "failed": job["failed_count"],
            "skipped": job["skipped_count"],
            "percent": progress_percent
        },
        "config": {
            "model": job["model_provider"],
            "concurrency": job["concurrency"],
            "max_retries": job["max_retries"],
            "analysis_type": job.get("analysis_type", "email")
        },
        "timestamps": {
            "created_at": job["created_at"],
            "started_at": job["started_at"],
            "completed_at": job["completed_at"]
        },
        "error_message": job["error_message"]
    }


@router.post("/{job_id}/cancel")
async def cancel_batch_analysis(job_id: str):
    """
    取消批量分析任务
    """
    service = get_batch_analysis_service()
    job = service.get_job_status(job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail="分析任务不存在")
    
    if job["status"] not in ("PENDING", "RUNNING"):
        raise HTTPException(
            status_code=400, 
            detail=f"无法取消状态为 {job['status']} 的任务"
        )
    
    await service.cancel_job(job_id)
    
    return {
        "job_id": job_id,
        "status": "CANCELLED",
        "message": "任务已取消"
    }


@router.post("/{job_id}/resume", response_model=BatchAnalysisResponse)
async def resume_batch_analysis(job_id: str):
    """
    恢复/重新启动批量分析任务
    创建一个新任务继续从未完成的地方开始执行
    """
    service = get_batch_analysis_service()
    
    try:
        job = await service.resume_job(job_id)
        return BatchAnalysisResponse(
            job_id=job["id"],
            task_id=job["task_id"],
            status="RUNNING",
            message="任务已恢复执行"
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"恢复失败: {str(e)}")


@router.get("/jobs/{task_id}")
async def get_batch_analysis_jobs(task_id: str):
    """
    获取指定任务的所有批量分析作业
    """
    db = get_db_service()
    
    # 验证任务存在
    task = db.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    service = get_batch_analysis_service()
    jobs = service.get_jobs_by_task(task_id)
    
    return {
        "task_id": task_id,
        "total": len(jobs),
        "jobs": jobs
    }


@router.post("/single")
async def analyze_single(request: SingleAnalysisRequest):
    """
    分析单条邮件
    """
    try:
        result = await analyze_single_email(
            task_id=request.task_id,
            email_id=request.email_id,
            prompt=request.prompt,
            model=request.model
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"分析失败: {str(e)}")


@router.get("/defaults")
async def get_default_config():
    """
    获取默认配置（Prompt 和过滤关键词）
    
    用于前端显示默认值。
    """
    return {
        "default_prompt": DEFAULT_ANALYSIS_PROMPT,
        "default_filter_keywords": DEFAULT_FILTER_KEYWORDS,
        "default_concurrency": 5,
        "default_max_retries": 3
    }
