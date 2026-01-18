"""
Student c - 后端主入口
FastAPI 应用配置
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

from api.task_api import router as task_router
from api.analysis_api import router as analysis_router
from api.stats_api import router as stats_router
from api.people_api import router as people_router
from api.chat_api import router as chat_router
from api.clusters_api import router as clusters_router
from api.preview_api import router as preview_router

# 加载环境变量
load_dotenv()

# 创建 FastAPI 应用
app = FastAPI(
    title="Student c API",
    description="本地化邮件分析系统 API",
    version="1.0.0"
)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应该设置具体的域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(task_router)
app.include_router(analysis_router)
app.include_router(stats_router)
app.include_router(people_router)
app.include_router(chat_router)
app.include_router(clusters_router)
app.include_router(preview_router)


@app.get("/")
async def root():
    """根路径"""
    return {
        "message": "Welcome to Student c API",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
