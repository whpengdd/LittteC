# 技术栈 (Tech Stack)

## 前端 (Frontend)
- **框架**: React + Vite
- **UI 组件**: TailwindCSS
- **HTTP Client**: Axios (用于处理大文件上传)

## 后端 (Backend) & 运行时
- **语言**: Python (利用其强大的数据处理生态)
- **Web 框架**: FastAPI (高性能，支持异步流式上传)
- **依赖管理**: pip / venv
- **数据处理**: `email-reply-parser` (邮件去重/清洗)

## 数据存储 (Storage)
- **结构化数据**: DuckDB (首选) 或 SQLite
  - *理由*: DuckDB 对 CSV/Parquet 的 OLAP 分析性能极佳，非常适合处理 1GB+ 的本地数据文件。
- **文件存储**: 本地文件系统 (Local Filesystem)

## AI 模型 (AI Models)
- **Google**: Google Generative AI SDK (Gemini)
- **Microsoft**: Azure OpenAI SDK (GPT)
