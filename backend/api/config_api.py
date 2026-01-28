"""
配置管理 API - 提供全局配置的读写接口
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Literal

from services.config_service import get_config_service


router = APIRouter(prefix="/api/config", tags=["config"])


class LLMConfigResponse(BaseModel):
    """LLM 配置响应"""
    provider: str
    available_providers: list[str]


class LLMConfigRequest(BaseModel):
    """LLM 配置更新请求"""
    provider: Literal["azure"]  # 仅支持 Azure


@router.get("/llm", response_model=LLMConfigResponse)
async def get_llm_config():
    """
    获取当前 LLM 配置
    
    返回当前使用的 LLM 提供商和可用的提供商列表。
    """
    config = get_config_service()
    return LLMConfigResponse(
        provider=config.get_llm_provider(),
        available_providers=["azure"]
    )


@router.put("/llm", response_model=LLMConfigResponse)
async def update_llm_config(request: LLMConfigRequest):
    """
    更新 LLM 配置
    
    设置全局使用的 LLM 提供商。此设置会影响所有后续的 AI 分析和聊天请求。
    """
    config = get_config_service()
    try:
        config.set_llm_provider(request.provider)
        return LLMConfigResponse(
            provider=config.get_llm_provider(),
            available_providers=["azure"]
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/")
async def get_all_config():
    """
    获取所有配置项
    """
    config = get_config_service()
    return config.get_all_config()
