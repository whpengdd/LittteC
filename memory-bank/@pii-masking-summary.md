# PII 数据脱敏方案 Summary Document

## 核心目标
为邮件分析系统实施 PII（个人身份信息）脱敏机制，防止 email 地址、手机号等敏感信息泄露给 LLM。

## 技术方案

### Token 映射策略
将敏感信息替换为可逆的 Token，保留语义同时保护隐私：

| 原始内容 | 脱敏后 Token | 部分掩码显示 |
|---------|-------------|-------------|
| zhangsan@company.com | `<EMAIL_001>` | z***n@company.com |
| 13812345678 | `<PHONE_001>` | 138****5678 |
| 192.168.1.100 | `<IP_001>` | 192.168.*.** |

### 实施架构

```mermaid
graph TD
    A[原始邮件] --> B[PIIMaskingService]
    B --> C{脱敏处理}
    C --> D[<EMAIL_001> <PHONE_001>]
    D --> E[LLM 分析]
    E --> F[分析结果]
    F --> G{显示模式}
    G -->|Token| H[<EMAIL_001>]
    G -->|部分掩码| I[z***n@company.com]
    G -->|完全还原| J[zhangsan@company.com]
```

## 关键文件

| 文件 | 说明 |
|------|------|
| [`pii_masking_service.py`](file:///Users/whpeng/workspace/student%20c/backend/services/pii_masking_service.py) | 核心脱敏服务 |
| [`batch_analysis_service.py`](file:///Users/whpeng/workspace/student%20c/backend/services/batch_analysis_service.py) | 集成点（已修改） |
| [`test_pii_masking.py`](file:///Users/whpeng/workspace/student%20c/backend/test_pii_masking.py) | 测试脚本 |

## 技术亮点

1. **任务级别一致性**: 同一任务中相同敏感信息使用相同 Token
2. **正则优化**: 支持多种手机号格式（`13812345678`, `+86-138-1234-5678`, `+86 138 1234 5678`）
3. **零性能影响**: 正则处理 < 1ms/邮件
4. **语义保留**: LLM 仍能理解"邮箱"、"电话"概念

## 测试结果

✅ **所有测试通过**
- Email 脱敏: 6个地址 ✓
- 手机号脱敏: 2个号码（多格式）✓
- IP 脱敏: 1个地址 ✓
- Token 一致性: ✓
- 部分掩码还原: ✓

## 使用示例

```python
from services.pii_masking_service import PIIMaskingService

# 创建服务
service = PIIMaskingService()

# 脱敏
raw = "联系 zhangsan@company.com 或拨打 13812345678"
masked, tokens = service.mask_text(raw)
# 结果: "联系 <EMAIL_001> 或拨打 <PHONE_001>"

# 部分掩码显示
display = service.unmask_text(masked, partial_mask=True)
# 结果: "联系 z***n@company.com 或拨打 138****5678"
```

## 状态: ✅ 已完成

**实施日期**: 2026-01-19  
**详细报告**: [walkthrough.md](file:///Users/whpeng/.gemini/antigravity/brain/2e25445b-4a9b-47db-94cf-17ff4b8a5e9f/walkthrough.md)
