"""
Google Gemini AI 服务实现
使用 google-generativeai SDK 调用 Gemini API
"""
import os
import json
import asyncio
from typing import Optional
import google.generativeai as genai
from .ai_base import (
    AIServiceBase, 
    SummaryResult, 
    SentimentResult, 
    EntityResult
)


class GeminiService(AIServiceBase):
    """
    Google Gemini AI 服务
    依赖: google-generativeai (官方 SDK)
    """
    
    def __init__(self, api_key: Optional[str] = None, model_name: str = "gemini-2.0-flash"):
        super().__init__(model_name)
        
        # 配置 API Key
        api_key = api_key or os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("Gemini API Key 未配置，请设置环境变量 GEMINI_API_KEY")
        
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(model_name)
    
    async def summarize(self, text: str, max_length: int = 150) -> SummaryResult:
        """
        使用 Gemini 生成邮件摘要
        """
        prompt = f"""请用简洁的语言总结以下邮件内容，要求：
1. 摘要长度不超过 {max_length} 个字符
2. 提炼 3-5 个关键点
3. 以 JSON 格式返回，包含 "summary" 和 "key_points" 字段

邮件内容：
{text[:2000]}  # 限制输入长度避免超出 token 限制

请直接返回 JSON，不要添加任何解释：
"""
        
        try:
            # 调用官方 SDK 生成内容
            response = await asyncio.to_thread(
                self.model.generate_content,
                prompt,
                generation_config={
                    "temperature": 0.3,  # 较低的温度保证结果稳定
                    "max_output_tokens": 500
                }
            )
            
            # 解析 JSON 响应
            result_text = response.text.strip()
            # 移除可能的 markdown 代码块标记
            if result_text.startswith("```"):
                result_text = result_text.split("```")[1]
                if result_text.startswith("json"):
                    result_text = result_text[4:]
            
            result = json.loads(result_text.strip())
            
            return SummaryResult(
                summary=result.get("summary", ""),
                key_points=result.get("key_points", [])
            )
        
        except json.JSONDecodeError:
            # 如果 JSON 解析失败，直接使用原始文本
            return SummaryResult(
                summary=response.text[:max_length],
                key_points=None
            )
        except Exception as e:
            raise RuntimeError(f"Gemini API 调用失败: {str(e)}")
    
    async def analyze_sentiment(self, text: str) -> SentimentResult:
        """
        使用 Gemini 进行情感分析
        """
        prompt = f"""分析以下邮件的情感倾向：

邮件内容：
{text[:2000]}

请以 JSON 格式返回分析结果，包含：
- label: "positive" (积极) / "negative" (消极) / "neutral" (中性)
- score: 0-1 之间的置信度
- reasoning: 简短的分析理由（1-2 句话）

直接返回 JSON，不要添加解释：
"""
        
        try:
            response = await asyncio.to_thread(
                self.model.generate_content,
                prompt,
                generation_config={"temperature": 0.2}
            )
            
            result_text = response.text.strip()
            # 清理 markdown 格式
            if result_text.startswith("```"):
                result_text = result_text.split("```")[1]
                if result_text.startswith("json"):
                    result_text = result_text[4:]
            
            result = json.loads(result_text.strip())
            
            return SentimentResult(
                label=result.get("label", "neutral"),
                score=float(result.get("score", 0.5)),
                reasoning=result.get("reasoning")
            )
        
        except Exception as e:
            # 默认返回中性结果
            return SentimentResult(
                label="neutral",
                score=0.5,
                reasoning=f"分析失败: {str(e)}"
            )
    
    async def extract_entities(self, text: str) -> EntityResult:
        """
        使用 Gemini 提取实体（人名、组织、地点等）
        """
        prompt = f"""从以下邮件中提取关键实体（人名、组织、地点、日期等）：

邮件内容：
{text[:2000]}

以 JSON 格式返回，格式为：
{{
  "entities": [
    {{"type": "PERSON", "value": "张三"}},
    {{"type": "ORGANIZATION", "value": "ABC公司"}},
    {{"type": "DATE", "value": "2024-01-15"}}
  ]
}}

直接返回 JSON：
"""
        
        try:
            response = await asyncio.to_thread(
                self.model.generate_content,
                prompt,
                generation_config={"temperature": 0.1}
            )
            
            result_text = response.text.strip()
            if result_text.startswith("```"):
                result_text = result_text.split("```")[1]
                if result_text.startswith("json"):
                    result_text = result_text[4:]
            
            result = json.loads(result_text.strip())
            
            return EntityResult(entities=result.get("entities", []))
        
        except Exception as e:
            return EntityResult(entities=[])
