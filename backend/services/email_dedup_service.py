"""
邮件去重服务
- 使用 email-reply-parser 去除引用和签名
- 提供智能上下文构建
"""
from typing import List, Dict, Any, Set
from email_reply_parser import EmailReplyParser

class EmailDedupService:
    @staticmethod
    def clean_content(content: str) -> str:
        """
        提取邮件的核心内容（去除引用和签名）
        """
        if not content:
            return ""
        
        try:
            # parse_reply 返回去除引用和签名的最新回复内容
            clean_text = EmailReplyParser.parse_reply(content)
            
            # 如果解析结果为空但原始内容不为空（极端情况），回退到原始内容
            # 但通常 parse_reply 会正确处理
            return clean_text if clean_text.strip() else content
        except Exception as e:
            # 如果解析失败，返回原始内容
            print(f"Error parsing email content: {e}")
            return content
    
    @staticmethod
    def build_deduped_context(
        emails: List[Dict[str, Any]], 
        max_chars: int = 15000  # 约 5k-8k tokens，足够 Gemini/GPT-4 分析
    ) -> str:
        """
        构建去重后的上下文
        
        策略：
        1. 对每封邮件进行内容清洗（去引用/签名）
        2. 去除完全重复的内容
        3. 拼接邮件直到达到长度限制
        """
        if not emails:
            return "没有相关邮件内容。"
            
        context_parts = []
        current_length = 0
        seen_contents: Set[str] = set()
        
        # 遍历所有提供的邮件（建议调用方传入尽量多的邮件，例如 20+ 封）
        for i, email in enumerate(emails, 1):
            raw_content = email.get('content', '') or ''
            
            # 清洗内容
            clean_text = EmailDedupService.clean_content(raw_content)
            clean_text = clean_text.strip()
            
            # 跳过空内容
            if not clean_text:
                continue
            
            # 跳过重复内容 (简单哈希去重)
            # 有时候不同只有标点符号，这里做严格去重，避免为了去重丢失细微差别
            if clean_text in seen_contents:
                continue
            seen_contents.add(clean_text)
            
            # 构建邮件块
            email_block = f"""
[邮件 {i}]
Subject: {email.get('subject', '(No Subject)')}
From: {email.get('sender', 'Unknown')}
To: {email.get('receiver', 'Unknown')}
Date: {email.get('timestamp', 'Unknown')}
Content:
{clean_text}
---"""
            
            # 检查长度限制
            if current_length + len(email_block) > max_chars:
                # 如果这是第一封邮件就超长了，还是要保留前面的一部分
                if current_length == 0:
                     return email_block[:max_chars] + "\n...(truncated)"
                break
                
            context_parts.append(email_block)
            current_length += len(email_block)
            
        if not context_parts:
             return "没有提取到有效邮件内容。"
             
        # 返回结果
        return "\n".join(context_parts)
