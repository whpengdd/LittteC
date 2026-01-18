"""
测试 Azure OpenAI API 连接
"""
import os
import asyncio
from dotenv import load_dotenv
from services.azure_service import AzureService

async def test_azure():
    # 加载环境变量
    load_dotenv()
    
    print("=" * 60)
    print("Azure OpenAI 配置测试")
    print("=" * 60)
    
    # 打印配置信息
    endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
    deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME")
    api_key = os.getenv("AZURE_OPENAI_API_KEY")
    
    print(f"\n✓ Endpoint: {endpoint}")
    print(f"✓ Deployment Name: {deployment}")
    print(f"✓ API Key: {api_key[:10]}..." if api_key else "✗ API Key: NOT SET")
    
    # 初始化服务
    try:
        print("\n[1/3] 初始化 Azure 服务...")
        service = AzureService()
        print("✓ Azure Service 初始化成功")
    except Exception as e:
        print(f"✗ 初始化失败: {e}")
        return
    
    # 测试摘要功能
    try:
        print("\n[2/3] 测试摘要生成...")
        test_text = """
        主题: 会议邀请
        
        亲爱的团队成员，
        
        我想邀请大家参加下周一上午10点的项目启动会议。我们将讨论新项目的目标、时间表和资源分配。
        请提前准备好您的想法和建议。
        
        期待与大家见面！
        """
        result = await service.summarize(test_text, max_length=100)
        print(f"✓ 摘要生成成功:")
        print(f"  - Summary: {result.summary}")
        print(f"  - Key Points: {result.key_points}")
        
    except Exception as e:
        print(f"✗ 摘要生成失败:")
        print(f"  错误类型: {type(e).__name__}")
        print(f"  错误消息: {str(e)}")
        import traceback
        print(f"  完整堆栈:\n{traceback.format_exc()}")
        return
    
    # 测试情感分析
    try:
        print("\n[3/3] 测试情感分析...")
        sentiment = await service.analyze_sentiment(test_text)
        print(f"✓ 情感分析成功:")
        print(f"  - Label: {sentiment.label}")
        print(f"  - Score: {sentiment.score}")
        print(f"  - Reasoning: {sentiment.reasoning}")
    except Exception as e:
        print(f"✗ 情感分析失败: {e}")
        import traceback
        print(traceback.format_exc())
    
    print("\n" + "=" * 60)
    print("测试完成")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(test_azure())
