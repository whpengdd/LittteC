"""
AI 服务抽象层
定义统一的 AI 接口规范，所有 AI 引擎必须遵循此接口
"""
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from pydantic import BaseModel
from enum import Enum


class AnalysisType(str, Enum):
    """分析类型枚举"""
    SUMMARY = "summary"
    SENTIMENT = "sentiment"
    ENTITIES = "entities"


class SentimentResult(BaseModel):
    """情感分析结果"""
    label: str  # positive, negative, neutral
    score: float  # 0-1 之间的置信度
    reasoning: Optional[str] = None


class SummaryResult(BaseModel):
    """摘要结果"""
    summary: str
    key_points: Optional[list[str]] = None


class EntityResult(BaseModel):
    """实体提取结果"""
    entities: list[Dict[str, str]]  # [{"type": "PERSON", "value": "张三"}, ...]


class AIServiceBase(ABC):
    """
    AI 服务抽象基类
    所有 AI 引擎（Gemini, Azure）必须继承此类并实现所有抽象方法
    """
    
    def __init__(self, model_name: str):
        self.model_name = model_name
    
    @abstractmethod
    async def summarize(self, text: str, max_length: int = 150) -> SummaryResult:
        """
        生成文本摘要
        
        Args:
            text: 要总结的文本
            max_length: 摘要最大长度（字符数）
            
        Returns:
            SummaryResult: 包含摘要内容和关键点
        """
        pass
    
    @abstractmethod
    async def analyze_sentiment(self, text: str) -> SentimentResult:
        """
        情感分析
        
        Args:
            text: 要分析的文本
            
        Returns:
            SentimentResult: 包含情感标签、置信度和推理过程
        """
        pass
    
    @abstractmethod
    async def extract_entities(self, text: str) -> EntityResult:
        """
        实体提取（人名、地名、组织等）
        
        Args:
            text: 要提取的文本
            
        Returns:
            EntityResult: 包含提取到的实体列表
        """
        pass
    
    def get_model_info(self) -> Dict[str, Any]:
        """获取模型信息"""
        return {
            "provider": self.__class__.__name__.replace("Service", ""),
            "model_name": self.model_name
        }
