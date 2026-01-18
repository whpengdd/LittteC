"""
分析 API 模块 - AI 驱动的邮件分析端点
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Literal
import uuid
import os

from services.db_service import get_db_service
from services.gemini_service import GeminiService
from services.azure_service import AzureService
from services.ai_base import AIServiceBase

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


# ===== 请求/响应模型 =====

class AnalysisRequest(BaseModel):
    """分析请求"""
    task_id: str
    email_id: int
    model: Literal["gemini", "azure"] = "gemini"  # 默认使用 Gemini


class AnalysisResponse(BaseModel):
    """分析响应"""
    analysis_id: str
    email_id: int
    analysis_type: str
    model_provider: str
    result: dict


class ModelInfo(BaseModel):
    """模型信息"""
    provider: str
    name: str
    available: bool
    error: Optional[str] = None


# ===== AI 服务工厂 =====

def get_ai_service(model: str) -> AIServiceBase:
    """
    根据模型名称获取 AI 服务实例
    这是唯一的 AI 服务创建入口，确保统一管理
    """
    if model == "gemini":
        try:
            return GeminiService()
        except ValueError as e:
            raise HTTPException(
                status_code=500,
                detail=f"Gemini 服务初始化失败: {str(e)}"
            )
    elif model == "azure":
        try:
            return AzureService()
        except ValueError as e:
            raise HTTPException(
                status_code=500,
                detail=f"Azure OpenAI 服务初始化失败: {str(e)}"
            )
    else:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的模型: {model}，仅支持 'gemini' 或 'azure'"
        )


# ===== API 端点 =====

@router.post("/summarize", response_model=AnalysisResponse)
async def summarize_email(request: AnalysisRequest):
    """
    生成邮件摘要
    """
    db = get_db_service()
    
    # 1. 获取邮件内容
    email = db.get_email_by_id(request.email_id)
    if not email:
        raise HTTPException(status_code=404, detail="邮件不存在")
    
    # 验证邮件属于指定任务
    if email.get("task_id") != request.task_id:
        raise HTTPException(status_code=403, detail="邮件不属于该任务")
    
    # 2. 构建完整文本（主题 + 内容）
    text_to_analyze = f"主题: {email.get('subject', '无主题')}\n\n{email.get('content', '')}"
    
    # 3. 调用 AI 服务生成摘要
    ai_service = get_ai_service(request.model)
    summary_result = await ai_service.summarize(text_to_analyze)
    
    # 4. 保存分析结果到数据库
    analysis_id = str(uuid.uuid4())
    db.save_analysis_result(
        result_id=analysis_id,
        task_id=request.task_id,
        email_id=request.email_id,
        analysis_type="summary",
        model_provider=request.model,
        result=summary_result.model_dump()
    )
    
    # 5. 返回结果
    return AnalysisResponse(
        analysis_id=analysis_id,
        email_id=request.email_id,
        analysis_type="summary",
        model_provider=request.model,
        result=summary_result.model_dump()
    )


@router.post("/sentiment", response_model=AnalysisResponse)
async def analyze_sentiment(request: AnalysisRequest):
    """
    情感分析
    """
    db = get_db_service()
    
    # 1. 获取邮件内容
    email = db.get_email_by_id(request.email_id)
    if not email:
        raise HTTPException(status_code=404, detail="邮件不存在")
    
    if email.get("task_id") != request.task_id:
        raise HTTPException(status_code=403, detail="邮件不属于该任务")
    
    # 2. 构建文本
    text_to_analyze = f"主题: {email.get('subject', '无主题')}\n\n{email.get('content', '')}"
    
    # 3. 调用 AI 服务
    ai_service = get_ai_service(request.model)
    sentiment_result = await ai_service.analyze_sentiment(text_to_analyze)
    
    # 4. 保存结果
    analysis_id = str(uuid.uuid4())
    db.save_analysis_result(
        result_id=analysis_id,
        task_id=request.task_id,
        email_id=request.email_id,
        analysis_type="sentiment",
        model_provider=request.model,
        result=sentiment_result.model_dump()
    )
    
    # 5. 返回结果
    return AnalysisResponse(
        analysis_id=analysis_id,
        email_id=request.email_id,
        analysis_type="sentiment",
        model_provider=request.model,
        result=sentiment_result.model_dump()
    )


@router.post("/entities", response_model=AnalysisResponse)
async def extract_entities(request: AnalysisRequest):
    """
    实体提取
    """
    db = get_db_service()
    
    # 1. 获取邮件内容
    email = db.get_email_by_id(request.email_id)
    if not email:
        raise HTTPException(status_code=404, detail="邮件不存在")
    
    if email.get("task_id") != request.task_id:
        raise HTTPException(status_code=403, detail="邮件不属于该任务")
    
    # 2. 构建文本
    text_to_analyze = f"主题: {email.get('subject', '无主题')}\n\n{email.get('content', '')}"
    
    # 3. 调用 AI 服务
    ai_service = get_ai_service(request.model)
    entity_result = await ai_service.extract_entities(text_to_analyze)
    
    # 4. 保存结果
    analysis_id = str(uuid.uuid4())
    db.save_analysis_result(
        result_id=analysis_id,
        task_id=request.task_id,
        email_id=request.email_id,
        analysis_type="entities",
        model_provider=request.model,
        result=entity_result.model_dump()
    )
    
    # 5. 返回结果
    return AnalysisResponse(
        analysis_id=analysis_id,
        email_id=request.email_id,
        analysis_type="entities",
        model_provider=request.model,
        result=entity_result.model_dump()
    )


@router.get("/results/{email_id}")
async def get_analysis_results(email_id: int, analysis_type: Optional[str] = None):
    """
    获取邮件的分析结果历史
    
    Args:
        email_id: 邮件 ID
        analysis_type: 可选，筛选特定类型的分析结果 (summary/sentiment/entities)
    """
    db = get_db_service()
    
    # 检查邮件是否存在
    email = db.get_email_by_id(email_id)
    if not email:
        raise HTTPException(status_code=404, detail="邮件不存在")
    
    # 获取分析结果
    results = db.get_analysis_results(email_id, analysis_type)
    
    return {
        "email_id": email_id,
        "total": len(results),
        "results": results
    }


@router.get("/models", response_model=list[ModelInfo])
async def get_available_models():
    """
    获取可用的 AI 模型列表及其状态
    """
    models = []
    
    # 检查 Gemini
    try:
        gemini = GeminiService()
        models.append(ModelInfo(
            provider="gemini",
            name=gemini.model_name,
            available=True
        ))
    except Exception as e:
        models.append(ModelInfo(
            provider="gemini",
            name="gemini-2.0-flash",
            available=False,
            error=str(e)
        ))
    
    # 检查 Azure OpenAI
    try:
        azure = AzureService()
        models.append(ModelInfo(
            provider="azure",
            name=azure.model_name,
            available=True
        ))
    except Exception as e:
        models.append(ModelInfo(
            provider="azure",
            name="gpt-35-turbo",
            available=False,
            error=str(e)
        ))
    
    return models
