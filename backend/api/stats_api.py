"""
统计 API - 提供 Dashboard 所需的数据统计接口
"""
from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any

from services.db_service import get_db_service


router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("/{task_id}")
async def get_task_stats(task_id: str):
    """
    获取任务的统计数据
    
    返回:
    - total_emails: 邮件总数
    - date_range: 时间范围 {start, end}
    - top_senders: 发件人 Top 10
    - email_trend: 按日期分组的邮件数量趋势
    """
    db_service = get_db_service()
    
    # 检查任务是否存在
    task = db_service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # 获取基础统计信息
    stats = db_service.get_task_stats(task_id)
    
    # 获取发件人 Top 10
    top_senders = db_service.get_top_senders(task_id, limit=10)
    
    # 获取邮件趋势
    email_trend = db_service.get_email_trend(task_id)
    
    return {
        **stats,
        "top_senders": top_senders,
        "email_trend": email_trend
    }
