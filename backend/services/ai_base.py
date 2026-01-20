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


class EmailAnalysisResult(BaseModel):
    """邮件综合分析结果"""
    summary: str
    risk_level: str  # "Low", "Medium", "High" or localized
    tags: list[str]
    key_findings: Optional[str] = ""
    key_points: Optional[list[str]] = []

class AIServiceBase(ABC):
    """
    AI 服务抽象基类
    所有 AI 引擎（Gemini, Azure）必须继承此类并实现所有抽象方法
    """
    
    def __init__(self, model_name: str):
        self.model_name = model_name
    
    @staticmethod
    def parse_json_response(text: str) -> Dict[str, Any]:
        """
        通用 JSON 解析帮助函数
        处理 markdown 代码块、前后空白等问题
        """
        import json
        import re
        
        try:
            text = text.strip()
            # 移除 markdown 代码块标记
            if text.startswith("```"):
                # 找到第一个换行符
                first_newline = text.find("\n")
                if first_newline != -1:
                    # 检查是否有语言标记 (如 ```json)
                    first_line = text[:first_newline].strip()
                    if first_line.startswith("```"):
                        text = text[first_newline+1:]
                
                # 移除结尾的 ```
                if text.endswith("```"):
                    text = text[:-3]
            
            # 再次清理可能的前后空白
            text = text.strip()
            
            return json.loads(text)
        except json.JSONDecodeError:
            # 尝试使用正则提取 JSON 对象
            json_match = re.search(r'\{[\s\S]*\}', text)
            if json_match:
                try:
                    return json.loads(json_match.group())
                except:
                    pass
            # 如果都失败了，抛出异常或返回空字典，视具体需求而定
            # 这里抛出异常以便上层处理
            raise
    
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

    @abstractmethod
    async def analyze_email(self, content: str, prompt_template: str = None) -> EmailAnalysisResult:
        """
        综合分析邮件（摘要、风险、标签、关键发现）

        Args:
            content: 邮件内容
            prompt_template: 可选的自定义 prompt 模板

        Returns:
            EmailAnalysisResult: 综合分析结果
        """
        pass
    
    @abstractmethod
    async def generate_raw_content(self, prompt: str) -> str:
        """
        生成原始内容（直接使用 Prompt，不套用模板）
        
        Args:
            prompt: 完整的 Prompt
            
        Returns:
            str: 生成的文本内容
        """
        pass
    
    def get_model_info(self) -> Dict[str, Any]:
        """获取模型信息"""
        return {
            "provider": self.__class__.__name__.replace("Service", ""),
            "model_name": self.model_name
        }
