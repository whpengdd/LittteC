"""
个人身份信息(PII)脱敏服务

功能：
- 将敏感信息（Email、手机号等）替换为可逆的 Token
- 支持 Token 映射管理（双向映射）
- 支持部分掩码还原（如 z***n@company.com）
- 确保同一任务中相同值使用相同 Token

使用场景：
- 邮件内容发送给 LLM 前进行脱敏
- 防止敏感信息泄露到外部 AI 服务
"""
import re
from typing import Dict, Tuple, Optional


class PIIMaskingService:
    """PII 脱敏服务"""
    
    def __init__(self):
        """初始化脱敏服务"""
        # Token 映射表：原始值 -> Token
        self.token_map: Dict[str, str] = {}
        # 反向映射表：Token -> 原始值
        self.reverse_map: Dict[str, str] = {}
        # 计数器
        self.counters = {
            "email": 0,
            "phone": 0,
            "id_card": 0,
            "ip": 0
        }
    
    def mask_text(self, text: str) -> Tuple[str, Dict[str, str]]:
        """
        脱敏文本
        
        Args:
            text: 原始文本
            
        Returns:
            (脱敏后文本, token映射表)
            
        示例:
            原文: "联系 zhangsan@company.com 或拨打 13812345678"
            返回: ("联系 <EMAIL_001> 或拨打 <PHONE_001>", {...})
        """
        if not text:
            return text, {}
        
        masked_text = text
        
        # 1. 脱敏 Email 地址
        masked_text = self._mask_emails(masked_text)
        
        # 2. 脱敏手机号
        masked_text = self._mask_phones(masked_text)
        
        # 3. 脱敏 IP 地址（可选）
        masked_text = self._mask_ips(masked_text)
        
        return masked_text, self.token_map.copy()
    
    def _mask_emails(self, text: str) -> str:
        """
        脱敏 Email 地址
        
        正则说明：
        - \\b: 单词边界
        - [A-Za-z0-9._%+-]+: 用户名部分（允许字母、数字、点、下划线等）
        - @: @ 符号
        - [A-Za-z0-9.-]+: 域名部分
        - \\.[A-Z|a-z]{2,}: 顶级域名（至少2个字母）
        """
        pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        
        def replacer(match):
            email = match.group(0)
            if email not in self.token_map:
                self.counters["email"] += 1
                token = f"<EMAIL_{self.counters['email']:03d}>"
                self.token_map[email] = token
                self.reverse_map[token] = email
            return self.token_map[email]
        
        return re.sub(pattern, replacer, text)
    
    def _mask_phones(self, text: str) -> str:
        """
        脱敏手机号
        
        支持格式：
        - 中国手机号: 13812345678, +86-138-1234-5678, +86 138 1234 5678
        - 国际通用: +1-234-567-8900, 001-234-567-8900
        
        正则策略：
        1. 优先匹配中国手机号（更精确）
        2. 再匹配国际格式（更宽泛）
        """
        # 改进的中国手机号正则（支持多种分隔符格式）
        # 匹配: 13812345678, +86-138-1234-5678, +86 138 1234 5678, +8613812345678
        china_pattern = r'(?:\+?86)?[\s\-]?1[3-9]\d[\s\-]?\d{4}[\s\-]?\d{4}\b'
        
        def replacer(match):
            phone = match.group(0)
            # 规范化：移除所有空格和短横线，只保留数字和可能的+号
            normalized = re.sub(r'[\s\-]', '', phone)
            
            if normalized not in self.token_map:
                self.counters["phone"] += 1
                token = f"<PHONE_{self.counters['phone']:03d}>"
                self.token_map[normalized] = token
                self.reverse_map[token] = normalized
            
            return self.token_map[normalized]
        
        # 处理中国手机号
        text = re.sub(china_pattern, replacer, text)
        
        # 可选：处理国际格式（更宽泛，可能误匹配，暂不启用）
        # international_pattern = r'\+?\d{1,4}[-\s]?\d{6,14}\b'
        # text = re.sub(international_pattern, replacer, text)
        
        return text
    
    def _mask_ips(self, text: str) -> str:
        """
        脱敏 IP 地址（可选）
        
        正则说明：
        - \\b: 单词边界
        - (?:\\d{1,3}\\.){3}: 三组"数字."
        - \\d{1,3}: 最后一组数字
        """
        pattern = r'\b(?:\d{1,3}\.){3}\d{1,3}\b'
        
        def replacer(match):
            ip = match.group(0)
            # 简单验证是否为合法 IP（每段0-255）
            parts = ip.split('.')
            if all(0 <= int(part) <= 255 for part in parts):
                if ip not in self.token_map:
                    self.counters["ip"] += 1
                    token = f"<IP_{self.counters['ip']:03d}>"
                    self.token_map[ip] = token
                    self.reverse_map[token] = ip
                return self.token_map[ip]
            return ip  # 不是合法 IP，保持原样
        
        return re.sub(pattern, replacer, text)
    
    def unmask_text(self, text: str, partial_mask: bool = True) -> str:
        """
        还原文本（可选部分掩码）
        
        Args:
            text: 包含 Token 的文本
            partial_mask: 是否部分掩码显示
            
        Returns:
            还原后的文本
            
        示例:
            输入: "联系 <EMAIL_001>"
            partial_mask=True: "联系 z***n@company.com"
            partial_mask=False: "联系 zhangsan@company.com"
        """
        if not text:
            return text
        
        result = text
        for token, original in self.reverse_map.items():
            if token in result:
                if partial_mask:
                    masked_value = self._partial_mask(original, token)
                    result = result.replace(token, masked_value)
                else:
                    result = result.replace(token, original)
        
        return result
    
    def _partial_mask(self, value: str, token: str) -> str:
        """
        部分掩码显示
        
        Args:
            value: 原始值
            token: Token 类型（用于判断处理方式）
            
        Returns:
            部分掩码后的值
            
        策略:
            - Email: z***n@company.com (保留首尾字符 + 域名)
            - Phone: 138****5678 (保留前3位和后4位)
            - IP: 192.168.***.*** (保留前两段)
        """
        if token.startswith("<EMAIL_"):
            return self._mask_email_partial(value)
        elif token.startswith("<PHONE_"):
            return self._mask_phone_partial(value)
        elif token.startswith("<IP_"):
            return self._mask_ip_partial(value)
        else:
            return value
    
    def _mask_email_partial(self, email: str) -> str:
        """Email 部分掩码: z***n@company.com"""
        try:
            username, domain = email.split('@')
            if len(username) <= 2:
                masked_username = username[0] + '***'
            else:
                masked_username = username[0] + '***' + username[-1]
            return f"{masked_username}@{domain}"
        except:
            return email
    
    def _mask_phone_partial(self, phone: str) -> str:
        """手机号部分掩码: 138****5678"""
        # 移除所有非数字字符
        digits = re.sub(r'\D', '', phone)
        if len(digits) >= 11:
            return f"{digits[:3]}****{digits[-4:]}"
        elif len(digits) >= 7:
            return f"{digits[:3]}****{digits[-4:]}"
        else:
            return phone
    
    def _mask_ip_partial(self, ip: str) -> str:
        """IP 部分掩码: 192.168.***.***"""
        parts = ip.split('.')
        if len(parts) == 4:
            return f"{parts[0]}.{parts[1]}.***.***"
        return ip
    
    def get_statistics(self) -> Dict[str, int]:
        """
        获取脱敏统计信息
        
        Returns:
            各类型脱敏数量统计
        """
        return self.counters.copy()
    
    def reset(self):
        """重置所有映射和计数器"""
        self.token_map.clear()
        self.reverse_map.clear()
        for key in self.counters:
            self.counters[key] = 0


# 全局单例（可选，也可以每次创建新实例）
_global_masking_service: Optional[PIIMaskingService] = None


def get_global_masking_service() -> PIIMaskingService:
    """获取全局脱敏服务实例（单例模式）"""
    global _global_masking_service
    if _global_masking_service is None:
        _global_masking_service = PIIMaskingService()
    return _global_masking_service
