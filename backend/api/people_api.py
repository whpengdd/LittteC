"""
人员名录 API - 提供联系人相关接口
"""
from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict, Any, Optional

from services.db_service import get_db_service


router = APIRouter(prefix="/api/people", tags=["people"])


@router.get("/{task_id}")
async def get_people(task_id: str):
    """
    获取任务的联系人列表
    
    返回按发件人聚合的联系人信息，包括邮件数量和最后联系时间
    """
    db_service = get_db_service()
    
    # 检查任务是否存在
    task = db_service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # 获取联系人列表
    people = db_service.get_people_by_task(task_id)
    
    return {"people": people}


@router.get("/{task_id}/emails")
async def get_emails_by_sender(
    task_id: str,
    sender: str = Query(..., description="发件人邮箱"),
    limit: int = Query(50, description="返回数量限制")
):
    """
    获取指定发件人的邮件列表
    """
    db_service = get_db_service()
    
    # 检查任务是否存在
    task = db_service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # 获取邮件
    emails = db_service.get_emails_by_sender(task_id, sender, limit)
    
    return {"emails": emails, "sender": sender, "count": len(emails)}
