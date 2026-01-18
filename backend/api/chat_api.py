"""
智能洞察 Chat API - 提供基于邮件数据的问答功能
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os
import asyncio
import google.generativeai as genai

from services.db_service import get_db_service


router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    """聊天请求模型"""
    task_id: str
    question: str
    model: str = "gemini"  # gemini or azure


class ChatResponse(BaseModel):
    """聊天响应模型"""
    answer: str
    context_emails: List[Dict[str, Any]]
    model_used: str


@router.post("/", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    基于任务邮件数据的智能问答
    
    流程：
    1. 解析用户问题
    2. 从 DuckDB 中检索相关邮件
    3. 构建上下文并调用 AI 生成答案
    """
    db_service = get_db_service()
    
    # 检查任务是否存在
    task = db_service.get_task(request.task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # 获取相关邮件（使用简单的关键词搜索）
    context_emails = await search_relevant_emails(
        db_service, 
        request.task_id, 
        request.question
    )
    
    # 构建上下文
    context_text = build_context(context_emails)
    
    # 调用 AI 生成答案
    if request.model == "gemini":
        answer = await generate_answer_gemini(request.question, context_text)
    else:
        answer = await generate_answer_azure(request.question, context_text)
    
    return ChatResponse(
        answer=answer,
        context_emails=context_emails[:5],  # 只返回前5封相关邮件
        model_used=request.model
    )


async def search_relevant_emails(
    db_service, 
    task_id: str, 
    question: str,
    limit: int = 50
) -> List[Dict[str, Any]]:
    """
    获取任务的邮件作为问答上下文
    简化版本：直接返回最近的邮件
    """
    try:
        return db_service.get_emails_by_task(task_id, limit=limit)
    except Exception as e:
        print(f"Error getting emails: {e}")
        return []


def build_context(emails: List[Dict[str, Any]], max_length: int = 3000) -> str:
    """
    构建 AI 上下文文本
    """
    """
    构建 AI 上下文文本
    """
    from services.email_dedup_service import EmailDedupService
    return EmailDedupService.build_deduped_context(emails, max_chars=max_length)


async def generate_answer_gemini(question: str, context: str) -> str:
    """
    使用 Gemini 生成答案
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Gemini API Key 未配置")
    
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-2.0-flash")
    
    prompt = f"""你是一个邮件分析助手。请基于以下邮件内容回答用户的问题。

## 相关邮件内容：
{context}

## 用户问题：
{question}

## 请用中文回答，要求：
1. 直接回答问题，不要添加不必要的解释
2. 如果问题涉及具体邮件，请引用相关内容
3. 如果找不到相关信息，请诚实说明

回答："""
    
    try:
        response = await asyncio.to_thread(
            model.generate_content,
            prompt,
            generation_config={
                "temperature": 0.3,
                "max_output_tokens": 1000
            }
        )
        return response.text.strip()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini 调用失败: {str(e)}")


async def generate_answer_azure(question: str, context: str) -> str:
    """
    使用 Azure OpenAI 生成答案
    """
    from openai import AzureOpenAI
    
    api_key = os.getenv("AZURE_OPENAI_API_KEY")
    endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
    deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-4o")
    
    if not api_key or not endpoint:
        raise HTTPException(status_code=500, detail="Azure OpenAI 配置缺失，请设置 AZURE_OPENAI_API_KEY 和 AZURE_OPENAI_ENDPOINT")
    
    client = AzureOpenAI(
        api_key=api_key,
        api_version="2024-02-15-preview",
        azure_endpoint=endpoint
    )
    
    prompt = f"""你是一个邮件分析助手。请基于以下邮件内容回答用户的问题。

## 相关邮件内容：
{context}

## 用户问题：
{question}

## 请用中文回答，要求：
1. 直接回答问题，不要添加不必要的解释
2. 如果问题涉及具体邮件，请引用相关内容
3. 如果找不到相关信息，请诚实说明"""
    
    try:
        response = await asyncio.to_thread(
            client.chat.completions.create,
            model=deployment,
            messages=[
                {"role": "system", "content": "你是一个专业的邮件分析助手。"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=1000
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Azure OpenAI 调用失败: {str(e)}")
