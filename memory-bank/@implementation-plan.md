# 实施计划 - Student c (Full Scope)

本计划基于 "Student c" 的技术要求（本地存储、1GB+ 支持、双 AI）并融合了原有的功能需求（仪表盘、人员名录）。

## 用户审查需知 (User Review Required)
> [!IMPORTANT]
> 这是一个全栈本地应用。后端：FastAPI (Python)，存储：DuckDB，前端：React。
> 请确保已准备好 Google Gemini API Key 和 Azure OpenAI Endpoint/Key。

## 拟定变更 (Proposed Changes)

---

### 第一阶段：基础架构与数据层 (Foundation)

#### [NEW] [Project Structure](file:///Users/whpeng/workspace/student c/)
-   **后端**: `backend/` (FastAPI, Uvicorn, DuckDB, AI SDKs)。
-   **前端**: `frontend/` (Vite, React, TailwindCSS, Axios)。

#### [NEW] `backend/services/storage_service.py` & `db_service.py`
-   **流式上传**: 实现 `shutil.copyfileobj` 处理 1GB+ 文件流。
-   **DuckDB 集成**:
    -   Schema 设计：`tasks` (id, name, status), `emails` (id, task_id, sender, receiver, subject, content, timestamp)。
    -   实现 `ingest_file(path)`：利用 DuckDB 高效导入 CSV/JSON/TXT。

#### [NEW] `backend/api/task_api.py`
-   **级联删除**: `DELETE /tasks/{id}` 必须同时删除：
    1.  磁盘上的原始文件。
    2.  DuckDB 中的相关行 (`DELETE FROM emails WHERE task_id = ...`).

---

### 第二阶段：AI 引擎集成 (AI Engine)

#### [NEW] `backend/services/ai_service.py`
-   **Provider 抽象**: 接口 `generate_content(prompt, model_config)`.
-   **Gemini 实现**: 集成 `google.generativeai`.
-   **Azure 实现**: 集成 `openai.AzureOpenAI`.
-   **配置**: 在后端统一管理 Keys (建议使用 `.env` 文件)。

---

### 第三阶段：功能模块开发 (Feature Implementation)

#### [NEW] `frontend/pages/Dashboard.tsx`
-   **API**: `GET /api/stats/{task_id}` (返回邮件数、时间范围等)。
-   **UI**: 使用卡片展示核心指标，图表展示邮件趋势。

#### [NEW] `frontend/pages/PeopleDirectory.tsx`
-   **API**: `GET /api/people/{task_id}` (通过 SQL `GROUP BY sender` 聚合数据)。
-   **UI**: 联系人列表，点击可查看该人的邮件往来记录。

#### [NEW] `frontend/components/InsightChat.tsx`
-   **功能**: 用户输入问题 -> 后端检索 DuckDB (可选 Vector Search) -> 提交给选定的 AI 模型 -> 返回答案。

---

### 第四阶段：验证与优化 (Verification)

#### [TEST] 性能测试
-   上传 1.5GB CSV 文件，确认内存占用 < 500MB。
-   在 100万行数据量级下测试 DuckDB 查询响应时间 (目标 < 200ms)。

#### [TEST] 功能验证
-   **双 AI 切换**: 确认在界面切换模型后，后端实际调用了对应的 SDK。
-   **彻底删除**: 删除任务后，手动在该任务文件夹找文件，确认已清空。

## 详细验证步骤 (Verification Steps)

1.  **环境准备**:
    -   `cd backend && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt`
    -   `cd frontend && npm install`

2.  **启动服务**:
    -   后端: `uvicorn main:app --reload`
    -   前端: `npm run dev`

3.  **核心流程走查**:
    -   打开 `http://localhost:5173`。
    -   上传 `large_dataset.csv` (1GB+)。
    -   等待处理完成，进入 **Dashboard** 查看数据统计。
    -   进入 **Settings** 切换 AI 模型为 Azure。
    -   提问 "Summarize the emails from Alice"，确认生成结果。
    -   点击 **Delete Task**，验证数据彻底清除。
