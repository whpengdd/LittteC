"""
聚类分析 API - 提供主题聚类和往来聚类功能
"""
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
import os
import io
import csv
import json
from urllib.parse import quote

from services.db_service import get_db_service

router = APIRouter(prefix="/api/clusters", tags=["clusters"])


class ClusterAnalyzeRequest(BaseModel):
    """批量分析请求"""
    task_id: str
    cluster_type: str  # "people" or "subjects"
    cluster_keys: List[str]  # 要分析的聚类键列表
    model: str = "azure"  # 仅支持 "azure"


@router.get("/people/{task_id}")
async def get_people_clusters(
    task_id: str, 
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100)
):
    """获取往来聚类列表"""
    db = get_db_service()
    
    # 验证任务存在
    task = db.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    return db.get_people_clusters(task_id, page, page_size)


@router.get("/subjects/{task_id}")
async def get_subject_clusters(
    task_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100)
):
    """获取主题聚类列表"""
    db = get_db_service()
    
    # 验证任务存在
    task = db.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    return db.get_subject_clusters(task_id, page, page_size)


@router.get("/people/{task_id}/emails")
async def get_people_cluster_emails(
    task_id: str,
    participant1: str = Query(..., description="参与者1"),
    participant2: str = Query(..., description="参与者2"),
    limit: int = Query(50, ge=1, le=200)
):
    """获取两个参与者之间的往来邮件"""
    db = get_db_service()
    
    # 验证任务存在
    task = db.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    emails = db.get_emails_by_participants(task_id, participant1, participant2, limit)
    return {"emails": emails}


@router.get("/subjects/{task_id}/emails")
async def get_subject_cluster_emails(
    task_id: str,
    subject: str = Query(..., description="邮件主题"),
    limit: int = Query(50, ge=1, le=200)
):
    """获取指定主题的邮件"""
    db = get_db_service()
    
    # 验证任务存在
    task = db.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    emails = db.get_emails_by_subject(task_id, subject, limit)
    return {"emails": emails}


@router.post("/analyze")
async def analyze_clusters(request: ClusterAnalyzeRequest):
    """批量分析聚类（生成 AI 洞察）"""
    db = get_db_service()
    
    # 验证任务存在
    task = db.get_task(request.task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    # 仅使用 Azure 服务
    from services.azure_service import AzureService
    ai_service = AzureService()
    
    results = []
    
    for cluster_key in request.cluster_keys:
        try:
            # 获取聚类的邮件用于分析
            if request.cluster_type == "people":
                # 解析参与者
                parts = cluster_key.split(" ↔ ")
                if len(parts) == 2:
                    emails = db.get_emails_by_participants(
                        request.task_id, parts[0].strip(), parts[1].strip(), limit=20
                    )
                else:
                    emails = []
            else:
                emails = db.get_emails_by_subject(request.task_id, cluster_key, limit=20)
            
            if not emails:
                results.append({
                    "cluster_key": cluster_key,
                    "success": False,
                    "error": "没有找到相关邮件"
                })
                continue
            
            # 构建分析上下文 (使用去重服务)
            from services.email_dedup_service import EmailDedupService
            context = EmailDedupService.build_deduped_context(emails)
            
            # 生成洞察 - 返回 JSON 格式的结构化数据
            prompt = f"""基于以下邮件往来，以 JSON 格式返回分析结果：
{{
    "risk_level": "低/中/高",
    "summary": "100字以内的核心内容简述",
    "tags": ["标签1", "标签2", "标签3"],
    "key_findings": "如有敏感或合规相关内容，请说明；否则留空"
}}

邮件内容：
{context}

请只输出 JSON，不要有任何前缀或解释。"""
            
            # 使用 generate_raw_content 直接发送 Prompt，避免被 summarize 的模板包裹
            raw_insight = await ai_service.generate_raw_content(prompt)
            
            # 尝试解析 JSON，如果失败则保持原始格式
            try:
                # 清理可能的 markdown 代码块
                cleaned = raw_insight.strip()
                if cleaned.startswith("```json"):
                    cleaned = cleaned[7:]
                if cleaned.startswith("```"):
                    cleaned = cleaned[3:]
                if cleaned.endswith("```"):
                    cleaned = cleaned[:-3]
                parsed = json.loads(cleaned.strip())
                ai_insight = json.dumps(parsed, ensure_ascii=False)
            except json.JSONDecodeError:
                # JSON 解析失败，使用纯文本格式
                ai_insight = json.dumps({
                    "risk_level": "低",
                    "summary": raw_insight[:100] if len(raw_insight) > 100 else raw_insight,
                    "tags": [],
                    "key_findings": ""
                }, ensure_ascii=False)
            
            # 保存洞察结果
            db.save_cluster_insight(
                request.task_id,
                request.cluster_type,
                cluster_key,
                ai_insight,
                "azure"  # 固定使用 Azure
            )
            
            results.append({
                "cluster_key": cluster_key,
                "success": True,
                "ai_insight": ai_insight
            })
            
        except Exception as e:
            results.append({
                "cluster_key": cluster_key,
                "success": False,
                "error": str(e)
            })
    
    return {
        "analyzed": len([r for r in results if r.get("success")]),
        "failed": len([r for r in results if not r.get("success")]),
        "results": results
    }


@router.get("/export/{task_id}")
async def export_clusters(
    task_id: str,
    cluster_type: str = Query("people", description="聚类类型: people 或 subjects")
):
    """导出聚类数据为 CSV (解析 AI 洞察字段)"""
    db = get_db_service()
    
    # 验证任务存在
    task = db.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    clusters = db.get_all_clusters_for_export(task_id, cluster_type)
    
    # 处理数据，解析 ai_insight
    processed_clusters = []
    for cluster in clusters:
        # 复制原有数据
        row = cluster.copy()
        
        # 解析 AI 洞察
        ai_insight_str = row.pop("ai_insight", "")
        risk_level = ""
        summary = ""
        tags = ""
        key_findings = ""
        
        if ai_insight_str:
            try:
                insight_data = json.loads(ai_insight_str)
                risk_level = insight_data.get("risk_level", "")
                summary = insight_data.get("summary", "")
                
                # 处理标签列表
                tags_list = insight_data.get("tags", [])
                if isinstance(tags_list, list):
                    tags = ", ".join(str(t) for t in tags_list)
                else:
                    tags = str(tags_list)
                    
                key_findings = insight_data.get("key_findings", "")
            except json.JSONDecodeError:
                # 解析失败，将原始字符串放入 summary 或保持为空
                summary = ai_insight_str
        
        # 添加新字段
        row["risk_level"] = risk_level
        row["summary"] = summary
        row["tags"] = tags
        row["key_findings"] = key_findings
        
        processed_clusters.append(row)
    
    # 创建 CSV 内容
    output = io.StringIO()
    
    # 定义新的表头
    base_fields = ["participants", "email_count", "latest_activity"] if cluster_type == "people" else ["subject", "email_count", "latest_activity"]
    insight_fields = ["risk_level", "summary", "tags", "key_findings"]
    fieldnames = base_fields + insight_fields
    
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(processed_clusters)
    
    # 返回文件流
    output.seek(0)
    filename = f"{task['name']}_{cluster_type}_clusters.csv"
    
    # 处理文件名编码
    encoded_filename = quote(filename)
    
    return StreamingResponse(
        iter(['\ufeff' + output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=\"{encoded_filename}\"; filename*=utf-8''{encoded_filename}"
        }
    )
