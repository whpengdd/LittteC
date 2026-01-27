#!/bin/bash

# 启动后端服务脚本
# 确保在 backend 目录下运行

# 激活虚拟环境
source venv/bin/activate

# 启动服务
uvicorn main:app --reload --host 0.0.0.0 --port 3002
