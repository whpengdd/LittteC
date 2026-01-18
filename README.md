# Student c - 本地化邮件分析系统

一个支持处理大规模数据（1GB+）的本地化邮件记录分析系统，利用双 AI 引擎（Gemini + Azure OpenAI）进行智能分析。

## 架构

- **后端**: FastAPI (Python) + DuckDB
- **前端**: React + Vite + TailwindCSS
- **存储**: 本地文件系统 + DuckDB 数据库
- **AI**: Google Gemini + Azure OpenAI

## 功能特性

✅ **已实现（第一阶段）：基础架构与数据层**

- [x] 流式文件上传（支持 1GB+ 大文件）
- [x] DuckDB 数据库集成
- [x] 任务管理（创建、列表、删除）
- [x] 级联删除（数据库记录 + 磁盘文件）
- [x] 基础前端界面

🚧 **待实现：**

- [ ] AI 引擎集成（Gemini + Azure OpenAI）
- [ ] 仪表盘（数据统计、图表）
- [ ] 人员名录（联系人画像）
- [ ] 智能洞察（Q&A、RAG）

## 快速开始

### 环境要求

- Python 3.9+
- Node.js 18+
- npm 或 yarn

### 1. 后端设置

```bash
# 进入后端目录
cd backend

# 创建虚拟环境
python -m venv venv

# 激活虚拟环境
source venv/bin/activate  # macOS/Linux
# 或
venv\Scripts\activate  # Windows

# 安装依赖
pip install -r requirements.txt

# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，填入你的 API Keys
# GEMINI_API_KEY=your_key_here
# AZURE_OPENAI_API_KEY=your_key_here
# ...

# 启动后端服务
uvicorn main:app --reload
```

后端将运行在 `http://localhost:8000`

### 2. 前端设置

```bash
# 进入前端目录
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

前端将运行在 `http://localhost:5173`

## 测试说明

### 测试文件上传

1. 准备一个 CSV 测试文件，格式如下：

```csv
sender,receiver,subject,content,timestamp
alice@example.com,bob@example.com,Meeting,Let's meet tomorrow,2024-01-01 10:00:00
bob@example.com,alice@example.com,Re: Meeting,Sounds good,2024-01-01 11:00:00
```

2. 打开前端界面 `http://localhost:5173`
3. 填写任务名称
4. 选择 CSV 文件
5. 点击"创建任务"
6. 等待上传和处理完成（状态变为 DONE）
7. 测试删除功能，确认数据和文件都被清除

### 验证级联删除

```bash
# 检查数据库
cd backend
python -c "import duckdb; conn = duckdb.connect('./data/student_c.duckdb'); print(conn.execute('SELECT * FROM tasks').fetchall())"

# 删除任务后再次检查
python -c "import duckdb; conn = duckdb.connect('./data/student_c.duckdb'); print(conn.execute('SELECT * FROM tasks').fetchall())"

# 检查文件是否被删除
ls -la ./data/uploads/
```

## API 文档

启动后端后，访问：
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## 项目结构

```
student c/
├── backend/                 # 后端服务
│   ├── api/                # API 路由
│   │   └── task_api.py    # 任务管理 API
│   ├── services/           # 业务服务
│   │   ├── db_service.py  # 数据库服务
│   │   └── storage_service.py  # 存储服务
│   ├── main.py            # 主入口
│   ├── requirements.txt   # Python 依赖
│   └── .env.example       # 环境变量模板
│
├── frontend/               # 前端应用
│   ├── src/               # 源代码
│   │   ├── App.tsx       # 主组件
│   │   ├── main.tsx      # 入口文件
│   │   └── index.css     # 样式
│   ├── package.json      # npm 依赖
│   └── vite.config.ts    # Vite 配置
│
└── memory-bank/           # 设计文档
    ├── @architecture.md
    ├── @design-document.md
    ├── @implementation-plan.md
    ├── @tech-stack.md
    └── @progress.md
```

## 下一步

根据实施计划，接下来将进行：

1. **第二阶段：AI 引擎集成**
   - 实现 AI 服务抽象层
   - 集成 Google Gemini
   - 集成 Azure OpenAI

2. **第三阶段：功能模块开发**
   - 仪表盘
   - 人员名录
   - 智能洞察聊天

3. **第四阶段：验证与优化**
   - 性能测试（1GB+ 文件）
   - 功能验证
   - 优化

## 许可证

MIT
