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

from services.db_service import get_db_service

router = APIRouter(prefix="/api/clusters", tags=["clusters"])


class ClusterAnalyzeRequest(BaseModel):
    """批量分析请求"""
    task_id: str
    cluster_type: str  # "people" or "subjects"
    cluster_keys: List[str]  # 要分析的聚类键列表
    model: str = "gemini"  # "gemini" or "azure"


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
    
    # 选择 AI 服务
    if request.model == "azure":
        from services.azure_service import AzureService
        ai_service = AzureService()
    else:
        from services.gemini_service import GeminiService
        ai_service = GeminiService()
    
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
            
            # 生成洞察
            prompt = f"""基于以下邮件往来，生成一个简洁的中文洞察摘要（50字以内），包括：
1. 主要话题/主题
2. 交流特点或关系
3. 关键信息点

邮件内容：
{context}

请直接输出摘要，不要有多余的前缀或解释。"""
            
            # 使用摘要功能生成洞察 (异步调用)
            insight_result = await ai_service.summarize(prompt)
            ai_insight = insight_result.summary if hasattr(insight_result, 'summary') else str(insight_result)
            
            # 保存洞察结果
            db.save_cluster_insight(
                request.task_id,
                request.cluster_type,
                cluster_key,
                ai_insight,
                request.model
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
    """导出聚类数据为 CSV"""
    db = get_db_service()
    
    # 验证任务存在
    task = db.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    clusters = db.get_all_clusters_for_export(task_id, cluster_type)
    
    # 创建 CSV 内容
    output = io.StringIO()
    
    if cluster_type == "people":
        fieldnames = ["participants", "email_count", "latest_activity", "ai_insight"]
    else:
        fieldnames = ["subject", "email_count", "latest_activity", "ai_insight"]
    
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(clusters)
    
    # 返回文件流
    output.seek(0)
    filename = f"{task['name']}_{cluster_type}_clusters.csv"
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=\"{filename}\""
        }
    )
