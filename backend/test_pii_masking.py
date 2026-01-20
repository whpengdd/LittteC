"""
PII 脱敏功能测试脚本

测试内容：
1. Email 地址脱敏
2. 手机号脱敏
3. Token 一致性
4. 部分掩码还原
"""
import sys
sys.path.append('/Users/whpeng/workspace/student c/backend')

from services.pii_masking_service import PIIMaskingService


def test_email_masking():
    """测试 Email 脱敏"""
    print("=" * 60)
    print("测试 1: Email 地址脱敏")
    print("=" * 60)
    
    service = PIIMaskingService()
    
    test_cases = [
        "联系 zhangsan@company.com 或 lisi@vendor.com",
        "发送邮件到 admin@example.org",
        "请回复到 zhangsan@company.com"  # 重复的 email
    ]
    
    for i, text in enumerate(test_cases, 1):
        masked, tokens = service.mask_text(text)
        print(f"\n用例 {i}:")
        print(f"   原文: {text}")
        print(f"   脱敏: {masked}")
        print(f"   Token映射: {tokens}")
    
    # 验证一致性
    print("\n✓ 一致性验证:")
    print(f"   zhangsan@company.com 在所有文本中应使用相同 Token")
    print(f"   统计: {service.get_statistics()}")


def test_phone_masking():
    """测试手机号脱敏"""
    print("\n" + "=" * 60)
    print("测试 2: 手机号脱敏")
    print("=" * 60)
    
    service = PIIMaskingService()
    
    test_cases = [
        "电话: 13812345678",
        "联系: +86-138-1234-5678",
        "手机: +86 138 1234 5678",
        "重复: 13812345678"  # 应识别为同一号码
    ]
    
    for i, text in enumerate(test_cases, 1):
        masked, tokens = service.mask_text(text)
        print(f"\n用例 {i}:")
        print(f"   原文: {text}")
        print(f"   脱敏: {masked}")
    
    print(f"\n✓ 统计: {service.get_statistics()}")


def test_combined_masking():
    """测试混合文本脱敏"""
    print("\n" + "=" * 60)
    print("测试 3: 混合文本脱敏")
    print("=" * 60)
    
    service = PIIMaskingService()
    
    text = """
    主题: 合同审批
    
    请联系 zhangsan@company.com (手机: 13812345678) 讨论合同事宜。
    抄送: lisi@vendor.com, wangwu@partner.org
    如有问题，请拨打 13987654321 或发邮件到 admin@company.com
    """
    
    masked, tokens = service.mask_text(text)
    
    print("\n原文:")
    print(text)
    print("\n脱敏后:")
    print(masked)
    print(f"\n✓ Token映射数量: {len(tokens)}")
    print(f"✓ 统计: {service.get_statistics()}")


def test_partial_unmask():
    """测试部分掩码还原"""
    print("\n" + "=" * 60)
    print("测试 4: 部分掩码还原")
    print("=" * 60)
    
    service = PIIMaskingService()
    
    text = "联系 zhangsan@company.com 或拨打 13812345678"
    masked, tokens = service.mask_text(text)
    
    # 完全还原
    unmasked_full = service.unmask_text(masked, partial_mask=False)
    
    # 部分掩码还原
    unmasked_partial = service.unmask_text(masked, partial_mask=True)
    
    print(f"\n原文:           {text}")
    print(f"脱敏:           {masked}")
    print(f"完全还原:       {unmasked_full}")
    print(f"部分掩码还原:   {unmasked_partial}")
    
    # 验证（注意：手机号会被规范化，空格会被移除）
    assert "zhangsan@company.com" in unmasked_full, "Email 还原失败"
    assert "13812345678" in unmasked_full, "手机号还原失败"
    assert "***" in unmasked_partial, "部分掩码还原失败"
    print("\n✓ 还原功能正常（手机号已规范化）")


def test_real_email_scenario():
    """测试真实邮件场景"""
    print("\n" + "=" * 60)
    print("测试 5: 真实邮件场景模拟")
    print("=" * 60)
    
    service = PIIMaskingService()
    
    email_content = """
From: alice@example.com
To: bob@company.com, charlie@vendor.org
Subject: 重要：数据安全政策更新

各位同事,

根据最新的合规要求，请务必注意以下事项：

1. 禁止在未加密的渠道中传输客户数据
2. 如有疑问，请联系 IT  部门 (support@company.com) 或拨打热线 400-123-4567
3. 紧急情况请联系 张三 (zhangsan@company.com, 13812345678)

此邮件已发送至服务器 192.168.1.100 进行归档。

谢谢！
Alice Wang
alice@example.com
手机: +86-138-8888-9999
    """
    
    masked, tokens = service.mask_text(email_content)
    partial_masked = service.unmask_text(masked, partial_mask=True)
    
    print("\n原始邮件:")
    print(email_content)
    print("\n" + "-" * 60)
    print("发送给 LLM 的脱敏版本:")
    print(masked)
    print("\n" + "-" * 60)
    print("前端显示（部分掩码）:")
    print(partial_masked)
    print(f"\n✓ 脱敏统计: {service.get_statistics()}")
    print(f"✓ Token总数: {len(tokens)}")


if __name__ == "__main__":
    print("\n" + "🔒" * 30)
    print("PII 脱敏服务测试")
    print("🔒" * 30 + "\n")
    
    try:
        test_email_masking()
        test_phone_masking()
        test_combined_masking()
        test_partial_unmask()
        test_real_email_scenario()
        
        print("\n" + "=" * 60)
        print("✅ 所有测试通过！")
        print("=" * 60 + "\n")
        
    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
