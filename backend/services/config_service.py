"""
全局配置服务 - 管理系统级别设置

提供运行时可修改的全局配置，如 LLM 提供商选择。
"""
import os
from typing import Literal


class ConfigService:
    """
    全局配置服务（单例模式）
    
    管理系统级别的配置项，支持从环境变量读取默认值，
    并允许运行时修改。
    """
    _instance = None
    _llm_provider: str = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            # 从环境变量读取默认 LLM 提供商，默认为 azure
            cls._instance._llm_provider = os.getenv("DEFAULT_LLM_PROVIDER", "azure").lower()
            # 验证配置值
            if cls._instance._llm_provider not in ("gemini", "azure"):
                cls._instance._llm_provider = "azure"
        return cls._instance
    
    def get_llm_provider(self) -> str:
        """获取当前 LLM 提供商"""
        return self._llm_provider
    
    def set_llm_provider(self, provider: Literal["gemini", "azure"]) -> None:
        """
        设置 LLM 提供商
        
        Args:
            provider: 提供商名称，必须是 'gemini' 或 'azure'
        
        Raises:
            ValueError: 如果提供商名称无效
        """
        provider = provider.lower()
        if provider not in ("gemini", "azure"):
            raise ValueError(f"无效的 LLM 提供商: {provider}，仅支持 'gemini' 或 'azure'")
        self._llm_provider = provider
    
    def get_all_config(self) -> dict:
        """获取所有配置项"""
        return {
            "llm_provider": self._llm_provider,
            "available_providers": ["gemini", "azure"]
        }


# 全局单例获取函数
_config_service: ConfigService = None

def get_config_service() -> ConfigService:
    """获取全局配置服务实例"""
    global _config_service
    if _config_service is None:
        _config_service = ConfigService()
    return _config_service
