"""
Azure OpenAI 服务实现
使用 openai SDK 调用 Azure OpenAI API
"""
import os
import json
import asyncio
from typing import Optional
from openai import AzureOpenAI
from .ai_base import (
    AIServiceBase,
    SummaryResult,
    SentimentResult,
    EntityResult,
    EmailAnalysisResult
)


class AzureService(AIServiceBase):
    """
    Azure OpenAI 服务
    依赖: openai (官方 SDK)
    """
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        endpoint: Optional[str] = None,
        deployment_name: Optional[str] = None,
        api_version: str = "2024-02-01"
    ):
        super().__init__(deployment_name or "gpt-35-turbo")
        
        # 从环境变量读取配置
        self.api_key = api_key or os.getenv("AZURE_OPENAI_API_KEY")
        self.endpoint = endpoint or os.getenv("AZURE_OPENAI_ENDPOINT")
        self.deployment_name = deployment_name or os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME")
        
        if not all([self.api_key, self.endpoint, self.deployment_name]):
            raise ValueError(
                "Azure OpenAI 配置不完整，请设置环境变量：\n"
                "- AZURE_OPENAI_API_KEY\n"
                "- AZURE_OPENAI_ENDPOINT\n"
                "- AZURE_OPENAI_DEPLOYMENT_NAME"
            )
        
        # 初始化 Azure OpenAI 客户端
        self.client = AzureOpenAI(
            api_key=self.api_key,
            api_version=api_version,
            azure_endpoint=self.endpoint
        )
    
    async def summarize(self, text: str, max_length: int = 150) -> SummaryResult:
        """
        使用 Azure OpenAI 生成邮件摘要
        """
        try:
            response = await asyncio.to_thread(
                self.client.chat.completions.create,
                model=self.deployment_name,
                messages=[
                    {
                        "role": "system",
                        "content": "你是一个专业的邮件分析助手，擅长生成简洁准确的摘要。"
                    },
                    {
                        "role": "user",
                        "content": f"""请用简洁的语言总结以下邮件内容，要求：
1. 摘要长度不超过 {max_length} 个字符
2. 提炼 3-5 个关键点
3. 以 JSON 格式返回，包含 "summary" 和 "key_points" 字段

邮件内容：
{text[:2000]}

请直接返回 JSON，不要添加任何解释：
"""
                    }
                ],
                temperature=0.3,
                max_tokens=500,
                response_format={"type": "json_object"}  # 强制 JSON 输出
            )
            
            result_text = response.choices[0].message.content
            result = self.parse_json_response(result_text)
            
            return SummaryResult(
                summary=result.get("summary", ""),
                key_points=result.get("key_points", [])
            )
        
        except json.JSONDecodeError:
            # 如果解析失败，回退到由于 JSONDecodeError 捕获前的逻辑，但实际上 parse_json_response 已经处理了一部分
            # 这里如果不使用 response_format={"type": "json_object"}，可能需要更复杂的 fallback
            # 但既然用了 json_object，理应拿到 JSON。如果拿到的是空或乱码...
             return SummaryResult(
                summary=response.choices[0].message.content[:max_length] if 'response' in locals() else "",
                key_points=None
            )
        except Exception as e:
            raise RuntimeError(f"Azure OpenAI API 调用失败: {str(e)}")
    
    async def analyze_sentiment(self, text: str) -> SentimentResult:
        """
        使用 Azure OpenAI 进行情感分析
        """
        try:
            response = await asyncio.to_thread(
                self.client.chat.completions.create,
                model=self.deployment_name,
                messages=[
                    {
                        "role": "system",
                        "content": "你是一个情感分析专家。"
                    },
                    {
                        "role": "user",
                        "content": f"""分析以下邮件的情感倾向：

邮件内容：
{text[:2000]}

请以 JSON 格式返回分析结果，包含：
- label: "positive" (积极) / "negative" (消极) / "neutral" (中性)
- score: 0-1 之间的置信度
- reasoning: 简短的分析理由（1-2 句话）

直接返回 JSON：
"""
                    }
                ],
                temperature=0.2,
                response_format={"type": "json_object"}
            )
            
            result = self.parse_json_response(response.choices[0].message.content)
            
            return SentimentResult(
                label=result.get("label", "neutral"),
                score=float(result.get("score", 0.5)),
                reasoning=result.get("reasoning")
            )
        
        except Exception as e:
            return SentimentResult(
                label="neutral",
                score=0.5,
                reasoning=f"分析失败: {str(e)}"
            )
    
    async def extract_entities(self, text: str) -> EntityResult:
        """
        使用 Azure OpenAI 提取实体
        """
        try:
            response = await asyncio.to_thread(
                self.client.chat.completions.create,
                model=self.deployment_name,
                messages=[
                    {
                        "role": "system",
                        "content": "你是一个实体抽取专家。"
                    },
                    {
                        "role": "user",
                        "content": f"""从以下邮件中提取关键实体（人名、组织、地点、日期等）：

邮件内容：
{text[:2000]}

以 JSON 格式返回，格式为：
{{
  "entities": [
    {{"type": "PERSON", "value": "张三"}},
    {{"type": "ORGANIZATION", "value": "ABC公司"}}
  ]
}}

直接返回 JSON：
"""
                    }
                ],
                temperature=0.1,
                response_format={"type": "json_object"}
            )
            
            result = self.parse_json_response(response.choices[0].message.content)
            return EntityResult(entities=result.get("entities", []))
        
        except Exception as e:
            return EntityResult(entities=[])

    async def analyze_email(self, content: str, prompt_template: str = None) -> EmailAnalysisResult:
        """
        综合分析邮件
        """
        # 如果未提供模板，使用默认的（这里暂时硬编码一个默认值，或者也可以从 batch_analysis_service 导入常量，
        # 但为了解耦，最好在这里或 base 里定义）
        if not prompt_template:
            prompt_template = """请分析以下邮件内容，重点关注：
1. 是否涉及敏感信息（如密码、账号、财务数据、个人隐私等）
2. 是否存在合规风险（如未授权数据传输、违规操作等）
3. 主要话题和关键信息点
4. 提取 3-5 个核心标签关键词（用于快速概览）

请以 JSON 格式返回分析结果：
{
    "risk_level": "低/中/高",
    "summary": "100字以内的核心内容简述",
    "tags": ["标签1", "标签2", "标签3"],
    "key_findings": "如有敏感或合规相关内容"
}

邮件内容：
{content}

请直接返回 JSON，不要添加任何解释。所有内容（包括摘要、标签、关键发现）必须使用**简体中文**。"""

        # 替换内容
        prompt = prompt_template.replace("{content}", content[:3000])

        try:
            response = await asyncio.to_thread(
                self.client.chat.completions.create,
                model=self.deployment_name,
                messages=[
                    {"role": "system", "content": "你是一个专业的邮件分析助手。"},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=1000,
                response_format={"type": "json_object"}
            )
            
            result = self.parse_json_response(response.choices[0].message.content)
            
            return EmailAnalysisResult(
                summary=result.get("summary", ""),
                risk_level=result.get("risk_level", "Low"),
                tags=result.get("tags", []),
                key_findings=result.get("key_findings", ""),
                key_points=result.get("key_points", [])
            )
        except Exception as e:
            # 发生错误时返回一个安全的默认结果
            print(f"Azure analyze_email failed: {e}")
            return EmailAnalysisResult(
                summary="分析失败",
                risk_level="Unknown",
                tags=[],
                key_findings=f"Error: {str(e)}"
            )

    async def generate_raw_content(self, prompt: str) -> str:
        """
        生成原始内容（直接使用 Prompt）
        """
        try:
            response = await asyncio.to_thread(
                self.client.chat.completions.create,
                model=self.deployment_name,
                messages=[
                    {"role": "system", "content": "You are a helpful assistant."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=1000
            )
            return response.choices[0].message.content
        except Exception as e:
            raise RuntimeError(f"Azure OpenAI API 调用失败: {str(e)}")
