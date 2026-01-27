# Student C - 部署指南

本文档说明如何将打包好的 `student_c_deploy_YYYYMMDD.tar.gz` 部署到 Linux 服务器。

## 1. 环境要求 (Prerequisites)

- **OS**: Ubuntu 20.04/22.04, CentOS 7+ 或 macOS
- **Python**: 3.10 或更高版本
- **Nginx** (可选): 用于反向代理前端静态文件

## 2. 部署步骤

### 第一步：上传并解压
将打包文件上传到服务器目录（例如 `/opt/student_c`）：

```bash
# 解压
mkdir -p student_c
tar -xzf student_c_deploy_*.tar.gz -C student_c
cd student_c
```

### 第二步：安装后端依赖
运行自带的安装脚本，它会创建 Python 虚拟环境并安装依赖：

```bash
chmod +x install.sh
./install.sh
```

### 第三步：配置 API Key
**重要**: 修改 `backend/.env` 文件，填入你的 LLM API Key。

```bash
nano backend/.env
```
填写 `OPENAI_API_KEY` 或 `GEMINI_API_KEY`。

### 第四步：启动服务 (测试)
使用启动脚本测试运行：
```bash
./run_server.sh
```
如果看到 `Uvicorn running on http://0.0.0.0:3002` 说明后端启动成功。按 `Ctrl+C` 停止。

## 3. 生产环境运行 (Systemd)

建议使用 `systemd` 让服务后台常驻并在开机时启动。

1. 创建服务文件 `/etc/systemd/system/student_c.service`:

```ini
[Unit]
Description=Student C Backend Service
After=network.target

[Service]
User=root
WorkingDirectory=/opt/student_c/backend
# 注意修改下面的路径为实际路径
ExecStart=/opt/student_c/backend/venv/bin/uvicorn main:app --host 0.0.0.0 --port 3002
Restart=always

[Install]
WantedBy=multi-user.target
```

2. 启动服务:

```bash
sudo systemctl daemon-reload
sudo systemctl enable student_c
sudo systemctl start student_c
sudo systemctl status student_c
```

## 4. 前端部署 (Nginx)

后端只提供 API，前端静态文件建议通过 Nginx 托管。

Nginx 配置示例 (`/etc/nginx/sites-available/student_c`):

```nginx
server {
    listen 80;
    server_name your_domain_or_ip;

    # 前端静态文件
    location / {
        root /opt/student_c/frontend_dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # 后端 API 转发
    location /api/ {
        proxy_pass http://127.0.0.1:3002;  # 注意后端没有 /api 前缀需要对应
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # Swagger 文档转发 (可选)
    location /docs {
        proxy_pass http://127.0.0.1:3002/docs;
    }
    
    location /openapi.json {
        proxy_pass http://127.0.0.1:3002/openapi.json;
    }
}
```
配置完成后重启 Nginx: `sudo systemctl restart nginx`.
