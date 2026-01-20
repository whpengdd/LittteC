"""
数据库服务模块 - 使用 DuckDB 管理结构化数据
"""
import duckdb
from pathlib import Path
from typing import Optional, List, Dict, Any
from datetime import datetime
import os


class DBService:
    """DuckDB 数据库服务"""
    
    def __init__(self, db_path: str = "./data/student_c.duckdb"):
        """初始化数据库连接"""
        self.db_path = db_path
        # 确保数据目录存在
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = duckdb.connect(db_path)
        self._init_schema()
    
    def _init_schema(self):
        """初始化数据库 Schema"""
        # 创建 tasks 表
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id VARCHAR PRIMARY KEY,
                name VARCHAR NOT NULL,
                status VARCHAR NOT NULL,
                created_at TIMESTAMP NOT NULL,
                file_path VARCHAR
            )
        """)
        
        # 创建 emails 表
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS emails (
                id INTEGER PRIMARY KEY,
                task_id VARCHAR NOT NULL,
                sender VARCHAR,
                receiver VARCHAR,
                subject VARCHAR,
                content TEXT,
                timestamp TIMESTAMP,
                FOREIGN KEY (task_id) REFERENCES tasks(id)
            )
        """)
        
        # 创建 email_id 序列（用于自增 ID）
        self.conn.execute("""
            CREATE SEQUENCE IF NOT EXISTS email_id_seq START 1
        """)
        
        # 创建 analysis_results 表（AI 分析结果）
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS analysis_results (
                id VARCHAR PRIMARY KEY,
                task_id VARCHAR NOT NULL,
                email_id INTEGER NOT NULL,
                analysis_type VARCHAR NOT NULL,
                model_provider VARCHAR NOT NULL,
                result JSON NOT NULL,
                created_at TIMESTAMP NOT NULL,
                FOREIGN KEY (task_id) REFERENCES tasks(id),
                FOREIGN KEY (email_id) REFERENCES emails(id)
            )
        """)
        
        # 创建 batch_analysis_jobs 表（批量分析任务）
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS batch_analysis_jobs (
                id VARCHAR PRIMARY KEY,
                task_id VARCHAR NOT NULL,
                status VARCHAR NOT NULL DEFAULT 'PENDING',
                prompt TEXT,
                filter_keywords JSON,
                model_provider VARCHAR NOT NULL DEFAULT 'gemini',
                concurrency INTEGER NOT NULL DEFAULT 5,
                max_retries INTEGER NOT NULL DEFAULT 3,
                total_count INTEGER NOT NULL DEFAULT 0,
                processed_count INTEGER NOT NULL DEFAULT 0,
                success_count INTEGER NOT NULL DEFAULT 0,
                failed_count INTEGER NOT NULL DEFAULT 0,
                skipped_count INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL,
                started_at TIMESTAMP,
                completed_at TIMESTAMP,
                error_message TEXT,
                analysis_type VARCHAR NOT NULL DEFAULT 'email',
                FOREIGN KEY (task_id) REFERENCES tasks(id)
            )
        """)
    
    def create_task(self, task_id: str, name: str, file_path: Optional[str] = None) -> Dict[str, Any]:
        """创建新任务"""
        created_at = datetime.now()
        self.conn.execute(
            "INSERT INTO tasks (id, name, status, created_at, file_path) VALUES (?, ?, ?, ?, ?)",
            [task_id, name, "PENDING", created_at, file_path]
        )
        return {
            "id": task_id,
            "name": name,
            "status": "PENDING",
            "created_at": created_at.isoformat(),
            "file_path": file_path
        }
    
    def get_tasks(self) -> List[Dict[str, Any]]:
        """获取所有任务"""
        result = self.conn.execute("SELECT * FROM tasks ORDER BY created_at DESC").fetchall()
        columns = ["id", "name", "status", "created_at", "file_path"]
        tasks = []
        for row in result:
            task = dict(zip(columns, row))
            # 转换 datetime 为字符串
            if task.get("created_at"):
                task["created_at"] = task["created_at"].isoformat()
            tasks.append(task)
        return tasks
    
    def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        """获取单个任务"""
        result = self.conn.execute("SELECT * FROM tasks WHERE id = ?", [task_id]).fetchone()
        if result:
            columns = ["id", "name", "status", "created_at", "file_path"]
            task = dict(zip(columns, result))
            # 转换 datetime 为字符串
            if task.get("created_at"):
                task["created_at"] = task["created_at"].isoformat()
            return task
        return None
    
    def update_task_status(self, task_id: str, status: str):
        """更新任务状态"""
        self.conn.execute("UPDATE tasks SET status = ? WHERE id = ?", [status, task_id])
    
    def delete_task(self, task_id: str):
        """删除任务及其关联的所有数据（邮件记录 + 分析结果）"""
        # 先删除关联的分析结果
        self.conn.execute("DELETE FROM analysis_results WHERE task_id = ?", [task_id])
        # 再删除关联的邮件记录
        self.conn.execute("DELETE FROM emails WHERE task_id = ?", [task_id])
        # 最后删除任务记录
        self.conn.execute("DELETE FROM tasks WHERE id = ?", [task_id])
    
    def ingest_file(self, task_id: str, file_path: str, file_type: str = "csv"):
        """
        从文件导入数据到 emails 表
        利用 DuckDB 的高效 CSV 导入能力
        """
        # 更新任务状态为处理中
        self.update_task_status(task_id, "PROCESSING")
        
        try:
            if file_type.lower() == "csv":
                # 首先读取 CSV 的列信息
                columns_query = f"SELECT * FROM read_csv_auto('{file_path}') LIMIT 0"
                result = self.conn.execute(columns_query)
                available_columns = [desc[0].lower() for desc in result.description]
                
                # 智能映射列名
                sender_col = None
                receiver_col = None
                subject_col = None
                content_col = None
                timestamp_col = None
                
                # 尝试匹配发件人
                for col in ['sender', 'from', 'from_email', 'from_addr']:
                    if col in available_columns:
                        sender_col = col
                        break
                
                # 尝试匹配收件人        
                for col in ['receiver', 'recipient', 'to', 'to_email', 'to_addr']:
                    if col in available_columns:
                        receiver_col = col
                        break
                
                # 尝试匹配主题
                for col in ['subject', 'title']:
                    if col in available_columns:
                        subject_col = col
                        break
                
                # 尝试匹配内容
                for col in ['content', 'body', 'text', 'message']:
                    if col in available_columns:
                        content_col = col
                        break
                
                # 尝试匹配时间
                for col in ['timestamp', 'date', 'datetime', 'time', 'created_at']:
                    if col in available_columns:
                        timestamp_col = col
                        break
                
                # 构建 SELECT 语句
                self.conn.execute(f"""
                    INSERT INTO emails (id, task_id, sender, receiver, subject, content, timestamp)
                    SELECT 
                        nextval('email_id_seq') as id,
                        '{task_id}' as task_id,
                        {f'"{sender_col}"' if sender_col else 'NULL'} as sender,
                        {f'"{receiver_col}"' if receiver_col else 'NULL'} as receiver,
                        {f'"{subject_col}"' if subject_col else 'NULL'} as subject,
                        {f'"{content_col}"' if content_col else 'NULL'} as content,
                        {f'TRY_CAST("{timestamp_col}" AS TIMESTAMP)' if timestamp_col else 'NULL'} as timestamp
                    FROM read_csv_auto('{file_path}')
                """)
            
            # 更新任务状态为完成
            self.update_task_status(task_id, "DONE")
            
        except Exception as e:
            # 如果导入失败，更新任务状态为失败
            self.update_task_status(task_id, "FAILED")
            # 记录错误信息（在生产环境应该使用 logging）
            print(f"Error importing file for task {task_id}: {e}")
            raise e
    
    def ingest_file_with_config(
        self, 
        task_id: str, 
        file_path: str, 
        file_type: str = "csv",
        mapping: Optional[Dict[str, Any]] = None,
        filter_config: Optional[Dict[str, Any]] = None
    ):
        """
        使用用户配置从文件导入数据到 emails 表
        
        Args:
            task_id: 任务 ID
            file_path: 文件路径
            file_type: 文件类型
            mapping: 字段映射配置，格式 {"sender": "col1", "receiver": "col2", ...}
            filter_config: 过滤配置，格式 {"logic": "AND/OR", "conditions": [...]}
        """
        # 更新任务状态为处理中
        self.update_task_status(task_id, "PROCESSING")
        
        try:
            if file_type.lower() == "csv":
                # 使用用户指定的映射
                sender_col = mapping.get("sender") if mapping else None
                receiver_col = mapping.get("receiver") if mapping else None
                subject_col = mapping.get("subject") if mapping else None
                content_col = mapping.get("content") if mapping else None
                timestamp_col = mapping.get("timestamp") if mapping else None
                
                # 构建 WHERE 子句（过滤条件）
                where_sql = DBService.build_filter_where_clause(filter_config)
                
                # 构建 SELECT 语句
                sql = f"""
                    INSERT INTO emails (id, task_id, sender, receiver, subject, content, timestamp)
                    SELECT 
                        nextval('email_id_seq') as id,
                        '{task_id}' as task_id,
                        {f'"{sender_col}"' if sender_col else 'NULL'} as sender,
                        {f'"{receiver_col}"' if receiver_col else 'NULL'} as receiver,
                        {f'"{subject_col}"' if subject_col else 'NULL'} as subject,
                        {f'"{content_col}"' if content_col else 'NULL'} as content,
                        {f'TRY_CAST("{timestamp_col}" AS TIMESTAMP)' if timestamp_col else 'NULL'} as timestamp
                    FROM read_csv_auto('{file_path}')
                    {where_sql}
                """
                
                self.conn.execute(sql)
            
            # 更新任务状态为完成
            self.update_task_status(task_id, "DONE")
            
        except Exception as e:
            # 如果导入失败，更新任务状态为失败
            self.update_task_status(task_id, "FAILED")
            print(f"Error importing file with config for task {task_id}: {e}")
            raise e
    
    @staticmethod
    def build_filter_where_clause(filter_config: Optional[Dict[str, Any]]) -> str:
        """
        构建过滤条件的 WHERE 子句
        
        Args:
            filter_config: 过滤配置
            
        Returns:
            WHERE 子句字符串（包含 WHERE 关键字），或空字符串
        """
        if not filter_config:
            return ""
        
        conditions = filter_config.get("conditions", [])
        if not conditions:
            return ""
        
        logic = filter_config.get("logic", "AND").upper()
        if logic not in ("AND", "OR"):
            logic = "AND"
        
        where_parts = []
        for cond in conditions:
            field = cond.get("field", "")
            match_type = cond.get("match_type", "exact")
            value = cond.get("value", "")
            
            if not field or not value:
                continue
            
            # 对值进行转义，防止 SQL 注入
            escaped_value = value.replace("'", "''")
            
            if match_type == "exact":
                # 精确匹配：排除等于该值的记录
                where_parts.append(f'("{field}" != \'{escaped_value}\' OR "{field}" IS NULL)')
            elif match_type == "contains":
                # 包含匹配：排除包含该值的记录
                where_parts.append(f'("{field}" NOT LIKE \'%{escaped_value}%\' OR "{field}" IS NULL)')
        
        if not where_parts:
            return ""
        
        # 根据逻辑组合条件
        # 注意：这里的逻辑是 "排除" 符合条件的记录
        # AND 逻辑：所有条件都满足才排除 -> 保留任一条件不满足的记录
        # OR 逻辑：任一条件满足就排除 -> 保留所有条件都不满足的记录
        if logic == "AND":
            # 要排除同时满足所有条件的记录，保留的是至少有一个条件不满足的
            # 在 SQL 中：WHERE (cond1) OR (cond2) OR ...
            combined = f" OR ".join(where_parts)
        else:  # OR
            # 要排除满足任一条件的记录，保留的是所有条件都不满足的
            # 在 SQL 中：WHERE (cond1) AND (cond2) AND ...
            combined = f" AND ".join(where_parts)
        
        return f"WHERE ({combined})"
    
    def get_emails_by_task(self, task_id: str, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        """获取任务的邮件记录，包含批量分析结果"""
        import json
        
        # 使用 LEFT JOIN 获取邮件及其对应的分析结果 (优先 batch_summary，其次 summary)
        query = """
            SELECT e.*, 
                   COALESCE(ar_batch.result, ar_summary.result) as analysis_result
            FROM emails e
            LEFT JOIN analysis_results ar_batch ON e.id = ar_batch.email_id 
                AND ar_batch.analysis_type = 'batch_summary'
            LEFT JOIN analysis_results ar_summary ON e.id = ar_summary.email_id 
                AND ar_summary.analysis_type = 'summary'
            WHERE e.task_id = ? 
            LIMIT ? OFFSET ?
        """
        
        result = self.conn.execute(query, [task_id, limit, offset]).fetchall()
        
        columns = ["id", "task_id", "sender", "receiver", "subject", "content", "timestamp", "batch_analysis_result"]
        emails = []
        for row in result:
            email = dict(zip(columns, row))
            # 转换 timestamp 为字符串
            if email.get("timestamp"):
                email["timestamp"] = email["timestamp"].isoformat()
            
            # 尝试解析 batch_analysis_result
            if email.get("batch_analysis_result"):
                try:
                    email["batch_analysis_result"] = json.loads(email["batch_analysis_result"])
                except:
                    pass
            
            emails.append(email)
            
        return emails
    
    def get_email_by_id(self, email_id: int) -> Optional[Dict[str, Any]]:
        """根据 ID 获取单封邮件"""
        result = self.conn.execute(
            "SELECT * FROM emails WHERE id = ?",
            [email_id]
        ).fetchone()
        
        if result:
            columns = ["id", "task_id", "sender", "receiver", "subject", "content", "timestamp"]
            email = dict(zip(columns, result))
            # 转换 timestamp 为字符串
            if email.get("timestamp"):
                email["timestamp"] = email["timestamp"].isoformat()
            return email
        return None
    
    def save_analysis_result(
        self, 
        result_id: str,
        task_id: str, 
        email_id: int, 
        analysis_type: str, 
        model_provider: str, 
        result: Dict[str, Any]
    ):
        """保存 AI 分析结果"""
        import json
        created_at = datetime.now()
        
        # 检查是否已存在相同的分析结果
        existing = self.conn.execute(
            """SELECT id FROM analysis_results 
               WHERE email_id = ? AND analysis_type = ? AND model_provider = ?""",
            [email_id, analysis_type, model_provider]
        ).fetchone()
        
        if existing:
            # 更新已有结果
            self.conn.execute(
                """UPDATE analysis_results 
                   SET result = ?, created_at = ? 
                   WHERE id = ?""",
                [json.dumps(result), created_at, existing[0]]
            )
        else:
            # 插入新结果
            self.conn.execute(
                """INSERT INTO analysis_results 
                   (id, task_id, email_id, analysis_type, model_provider, result, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                [result_id, task_id, email_id, analysis_type, model_provider, json.dumps(result), created_at]
            )
    
    def get_analysis_results(
        self, 
        email_id: int, 
        analysis_type: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """获取邮件的分析结果"""
        import json
        
        if analysis_type:
            query = """
                SELECT * FROM analysis_results 
                WHERE email_id = ? AND analysis_type = ?
                ORDER BY created_at DESC
            """
            result = self.conn.execute(query, [email_id, analysis_type]).fetchall()
        else:
            query = """
                SELECT * FROM analysis_results 
                WHERE email_id = ?
                ORDER BY created_at DESC
            """
            result = self.conn.execute(query, [email_id]).fetchall()
        
        columns = ["id", "task_id", "email_id", "analysis_type", "model_provider", "result", "created_at"]
        results = []
        for row in result:
            analysis = dict(zip(columns, row))
            # 解析 JSON 结果
            analysis["result"] = json.loads(analysis["result"])
            # 转换 datetime 为字符串
            if analysis.get("created_at"):
                analysis["created_at"] = analysis["created_at"].isoformat()
            results.append(analysis)
        
        return results
    
    # ==================== Dashboard 统计方法 ====================
    
    def get_task_stats(self, task_id: str) -> Dict[str, Any]:
        """获取任务的统计信息"""
        # 邮件总数
        total_result = self.conn.execute(
            "SELECT COUNT(*) FROM emails WHERE task_id = ?",
            [task_id]
        ).fetchone()
        total_emails = total_result[0] if total_result else 0
        
        # 时间范围
        date_range_result = self.conn.execute(
            """SELECT MIN(timestamp), MAX(timestamp) 
               FROM emails 
               WHERE task_id = ? AND timestamp IS NOT NULL""",
            [task_id]
        ).fetchone()
        
        date_range = {
            "start": date_range_result[0].isoformat() if date_range_result and date_range_result[0] else None,
            "end": date_range_result[1].isoformat() if date_range_result and date_range_result[1] else None
        }
        
        return {
            "total_emails": total_emails,
            "date_range": date_range
        }
    
    def get_top_senders(self, task_id: str, limit: int = 10) -> List[Dict[str, Any]]:
        """获取发件人 Top N"""
        result = self.conn.execute(
            """SELECT sender, COUNT(*) as count 
               FROM emails 
               WHERE task_id = ? AND sender IS NOT NULL
               GROUP BY sender 
               ORDER BY count DESC 
               LIMIT ?""",
            [task_id, limit]
        ).fetchall()
        
        return [{"sender": row[0], "count": row[1]} for row in result]
    
    def get_email_trend(self, task_id: str) -> List[Dict[str, Any]]:
        """获取邮件趋势（按日期分组）"""
        result = self.conn.execute(
            """SELECT DATE(timestamp) as date, COUNT(*) as count 
               FROM emails 
               WHERE task_id = ? AND timestamp IS NOT NULL
               GROUP BY DATE(timestamp) 
               ORDER BY date""",
            [task_id]
        ).fetchall()
        
        return [
            {"date": row[0].isoformat() if row[0] else None, "count": row[1]} 
            for row in result
        ]
    
    # ==================== 人员名录方法 ====================
    
    def get_people_by_task(self, task_id: str) -> List[Dict[str, Any]]:
        """获取任务的联系人列表（按发件人聚合）"""
        result = self.conn.execute(
            """SELECT 
                   sender,
                   COUNT(*) as email_count,
                   MAX(timestamp) as last_contact
               FROM emails 
               WHERE task_id = ? AND sender IS NOT NULL
               GROUP BY sender 
               ORDER BY email_count DESC""",
            [task_id]
        ).fetchall()
        
        return [
            {
                "sender": row[0],
                "email_count": row[1],
                "last_contact": row[2].isoformat() if row[2] else None
            }
            for row in result
        ]
    
    def get_emails_by_sender(self, task_id: str, sender: str, limit: int = 50) -> List[Dict[str, Any]]:
        """获取指定发件人的邮件"""
        result = self.conn.execute(
            """SELECT * FROM emails 
               WHERE task_id = ? AND sender = ?
               ORDER BY timestamp DESC
               LIMIT ?""",
            [task_id, sender, limit]
        ).fetchall()
        
        columns = ["id", "task_id", "sender", "receiver", "subject", "content", "timestamp"]
        emails = []
        for row in result:
            email = dict(zip(columns, row))
            if email.get("timestamp"):
                email["timestamp"] = email["timestamp"].isoformat()
            emails.append(email)
        return emails
    
    # ==================== 聚类分析方法 ====================
    
    def get_people_clusters(self, task_id: str, page: int = 1, page_size: int = 20) -> Dict[str, Any]:
        """
        获取往来聚类（按参与者组合聚合）
        使用无序组合：alice↔bob 和 bob↔alice 视为同一群组
        """
        offset = (page - 1) * page_size
        
        # 使用 LEAST 和 GREATEST 实现无序组合
        result = self.conn.execute(
            """SELECT 
                   LEAST(sender, receiver) as participant1,
                   GREATEST(sender, receiver) as participant2,
                   COUNT(*) as email_count,
                   MAX(timestamp) as latest_activity
               FROM emails 
               WHERE task_id = ? AND sender IS NOT NULL AND receiver IS NOT NULL
               GROUP BY LEAST(sender, receiver), GREATEST(sender, receiver)
               ORDER BY email_count DESC
               LIMIT ? OFFSET ?""",
            [task_id, page_size, offset]
        ).fetchall()
        
        # 获取总数
        total_result = self.conn.execute(
            """SELECT COUNT(DISTINCT (LEAST(sender, receiver) || '↔' || GREATEST(sender, receiver)))
               FROM emails 
               WHERE task_id = ? AND sender IS NOT NULL AND receiver IS NOT NULL""",
            [task_id]
        ).fetchone()
        total = total_result[0] if total_result else 0
        
        clusters = []
        for row in result:
            cluster_key = f"{row[0]} ↔ {row[1]}"
            # 尝试获取已保存的 AI 洞察
            insight = self._get_cluster_insight(task_id, "people", cluster_key)
            clusters.append({
                "participants": cluster_key,
                "participant1": row[0],
                "participant2": row[1],
                "email_count": row[2],
                "latest_activity": row[3].isoformat() if row[3] else None,
                "ai_insight": insight
            })
        
        return {
            "clusters": clusters,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size if page_size > 0 else 0
        }
    
    def get_subject_clusters(self, task_id: str, page: int = 1, page_size: int = 20) -> Dict[str, Any]:
        """获取主题聚类（按邮件主题聚合）"""
        offset = (page - 1) * page_size
        
        result = self.conn.execute(
            """SELECT 
                   subject,
                   COUNT(*) as email_count,
                   MAX(timestamp) as latest_activity
               FROM emails 
               WHERE task_id = ? AND subject IS NOT NULL
               GROUP BY subject
               ORDER BY email_count DESC
               LIMIT ? OFFSET ?""",
            [task_id, page_size, offset]
        ).fetchall()
        
        # 获取总数
        total_result = self.conn.execute(
            """SELECT COUNT(DISTINCT subject)
               FROM emails 
               WHERE task_id = ? AND subject IS NOT NULL""",
            [task_id]
        ).fetchone()
        total = total_result[0] if total_result else 0
        
        clusters = []
        for row in result:
            subject = row[0]
            # 尝试获取已保存的 AI 洞察
            insight = self._get_cluster_insight(task_id, "subjects", subject)
            clusters.append({
                "subject": subject,
                "email_count": row[1],
                "latest_activity": row[2].isoformat() if row[2] else None,
                "ai_insight": insight
            })
        
        return {
            "clusters": clusters,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size if page_size > 0 else 0
        }
    
    def get_emails_by_participants(self, task_id: str, participant1: str, participant2: str, limit: int = 50) -> List[Dict[str, Any]]:
        """获取两个参与者之间的往来邮件"""
        result = self.conn.execute(
            """SELECT * FROM emails 
               WHERE task_id = ? 
                 AND ((sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?))
               ORDER BY timestamp DESC
               LIMIT ?""",
            [task_id, participant1, participant2, participant2, participant1, limit]
        ).fetchall()
        
        columns = ["id", "task_id", "sender", "receiver", "subject", "content", "timestamp"]
        emails = []
        for row in result:
            email = dict(zip(columns, row))
            if email.get("timestamp"):
                email["timestamp"] = email["timestamp"].isoformat()
            emails.append(email)
        return emails
    
    def get_emails_by_subject(self, task_id: str, subject: str, limit: int = 50) -> List[Dict[str, Any]]:
        """获取指定主题的邮件"""
        result = self.conn.execute(
            """SELECT * FROM emails 
               WHERE task_id = ? AND subject = ?
               ORDER BY timestamp DESC
               LIMIT ?""",
            [task_id, subject, limit]
        ).fetchall()
        
        columns = ["id", "task_id", "sender", "receiver", "subject", "content", "timestamp"]
        emails = []
        for row in result:
            email = dict(zip(columns, row))
            if email.get("timestamp"):
                email["timestamp"] = email["timestamp"].isoformat()
            emails.append(email)
        return emails
    
    def save_cluster_insight(self, task_id: str, cluster_type: str, cluster_key: str, ai_insight: str, model: str):
        """保存聚类的 AI 洞察结果"""
        import json
        import uuid
        created_at = datetime.now()
        
        # 确保 email_clusters 表存在
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS email_clusters (
                id VARCHAR PRIMARY KEY,
                task_id VARCHAR NOT NULL,
                cluster_type VARCHAR NOT NULL,
                cluster_key VARCHAR NOT NULL,
                ai_insight TEXT,
                model_provider VARCHAR,
                analyzed_at TIMESTAMP,
                FOREIGN KEY (task_id) REFERENCES tasks(id)
            )
        """)
        
        # 检查是否已存在
        existing = self.conn.execute(
            """SELECT id FROM email_clusters 
               WHERE task_id = ? AND cluster_type = ? AND cluster_key = ?""",
            [task_id, cluster_type, cluster_key]
        ).fetchone()
        
        if existing:
            self.conn.execute(
                """UPDATE email_clusters 
                   SET ai_insight = ?, model_provider = ?, analyzed_at = ?
                   WHERE id = ?""",
                [ai_insight, model, created_at, existing[0]]
            )
        else:
            cluster_id = str(uuid.uuid4())
            self.conn.execute(
                """INSERT INTO email_clusters 
                   (id, task_id, cluster_type, cluster_key, ai_insight, model_provider, analyzed_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                [cluster_id, task_id, cluster_type, cluster_key, ai_insight, model, created_at]
            )
    
    def _get_cluster_insight(self, task_id: str, cluster_type: str, cluster_key: str) -> Optional[str]:
        """获取聚类的 AI 洞察（内部方法）"""
        try:
            result = self.conn.execute(
                """SELECT ai_insight FROM email_clusters 
                   WHERE task_id = ? AND cluster_type = ? AND cluster_key = ?""",
                [task_id, cluster_type, cluster_key]
            ).fetchone()
            return result[0] if result else None
        except:
            # 表可能不存在
            return None
    
    def get_all_clusters_for_export(self, task_id: str, cluster_type: str) -> List[Dict[str, Any]]:
        """获取所有聚类数据用于导出"""
        if cluster_type == "people":
            result = self.conn.execute(
                """SELECT 
                       LEAST(sender, receiver) as participant1,
                       GREATEST(sender, receiver) as participant2,
                       COUNT(*) as email_count,
                       MAX(timestamp) as latest_activity
                   FROM emails 
                   WHERE task_id = ? AND sender IS NOT NULL AND receiver IS NOT NULL
                   GROUP BY LEAST(sender, receiver), GREATEST(sender, receiver)
                   ORDER BY email_count DESC""",
                [task_id]
            ).fetchall()
            
            clusters = []
            for row in result:
                cluster_key = f"{row[0]} ↔ {row[1]}"
                insight = self._get_cluster_insight(task_id, "people", cluster_key)
                clusters.append({
                    "participants": cluster_key,
                    "email_count": row[2],
                    "latest_activity": row[3].isoformat() if row[3] else None,
                    "ai_insight": insight or ""
                })
            return clusters
        else:
            result = self.conn.execute(
                """SELECT 
                       subject,
                       COUNT(*) as email_count,
                       MAX(timestamp) as latest_activity
                   FROM emails 
                   WHERE task_id = ? AND subject IS NOT NULL
                   GROUP BY subject
                   ORDER BY email_count DESC""",
                [task_id]
            ).fetchall()
            
            clusters = []
            for row in result:
                insight = self._get_cluster_insight(task_id, "subjects", row[0])
                clusters.append({
                    "subject": row[0],
                    "email_count": row[1],
                    "latest_activity": row[2].isoformat() if row[2] else None,
                    "ai_insight": insight or ""
                })
            return clusters
    
    # ==================== 批量分析任务方法 ====================
    
    def create_batch_job(
        self,
        job_id: str,
        task_id: str,
        prompt: str,
        filter_keywords: List[str],
        model_provider: str,
        concurrency: int = 5,
        max_retries: int = 3,
        analysis_type: str = "email"
    ) -> Dict[str, Any]:
        """创建批量分析任务"""
        import json
        created_at = datetime.now()
        
        # 确保 analysis_type 列存在 (向前兼容)
        try:
            self.conn.execute("ALTER TABLE batch_analysis_jobs ADD COLUMN analysis_type VARCHAR DEFAULT 'email'")
        except:
            pass  # 列已存在
        
        self.conn.execute(
            """INSERT INTO batch_analysis_jobs 
               (id, task_id, status, prompt, filter_keywords, model_provider, 
                concurrency, max_retries, created_at, analysis_type)
               VALUES (?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?)""",
            [job_id, task_id, prompt, json.dumps(filter_keywords), 
             model_provider, concurrency, max_retries, created_at, analysis_type]
        )
        
        return {
            "id": job_id,
            "task_id": task_id,
            "analysis_type": analysis_type,
            "status": "PENDING",
            "prompt": prompt,
            "filter_keywords": filter_keywords,
            "model_provider": model_provider,
            "concurrency": concurrency,
            "max_retries": max_retries,
            "total_count": 0,
            "processed_count": 0,
            "success_count": 0,
            "failed_count": 0,
            "skipped_count": 0,
            "created_at": created_at.isoformat()
        }
    
    def get_batch_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """获取批量分析任务详情"""
        import json
          # 使用明确的列查询，避免列顺序问题
        columns = ["id", "task_id", "status", "prompt", "filter_keywords", 
                  "model_provider", "concurrency", "max_retries", 
                  "total_count", "processed_count", "success_count", 
                  "failed_count", "skipped_count", "created_at", 
                  "started_at", "completed_at", "error_message", "analysis_type"]
        
        query_cols = ", ".join(columns)
        # 兼容旧表结构 (如果缺少 analysis_type 列，查询会失败，所以这里还是有点风险，最好的方式是 migrate)
        # 但考虑到 DuckDB file-based，简单起见我们假设 schema 已经更新 (create_batch_job 会 alter table)
        # 如果是查询旧任务，get_batch_job 应该也能工作 (ALTER ADD COLUMN 之后)
        
        query = f"SELECT {query_cols} FROM batch_analysis_jobs WHERE id = ?"
        
        try:
            result = self.conn.execute(query, [job_id]).fetchone()
        except:
            # 如果查询失败（可能因为旧数据没有 analysis_type），回退到旧查询并补全
            columns_old = columns[:-1]
            query_cols_old = ", ".join(columns_old)
            query = f"SELECT {query_cols_old} FROM batch_analysis_jobs WHERE id = ?"
            result = self.conn.execute(query, [job_id]).fetchone()
            if result:
                job = dict(zip(columns_old, result))
                job["analysis_type"] = "email"
                result = None # 已处理
            else:
                return None

        if result:
            job = dict(zip(columns, result))
            
            # 解析 JSON 字段
            if job.get("filter_keywords"):
                job["filter_keywords"] = json.loads(job["filter_keywords"])
            
            # 转换 datetime 为字符串
            for field in ["created_at", "started_at", "completed_at"]:
                if job.get(field) and hasattr(job[field], 'isoformat'):
                    job[field] = job[field].isoformat()
            
            return job
        return None
    
    def get_batch_jobs_by_task(self, task_id: str) -> List[Dict[str, Any]]:
        """获取指定任务的所有批量分析作业"""
        import json
        columns = ["id", "task_id", "status", "prompt", "filter_keywords", 
                  "model_provider", "concurrency", "max_retries", 
                  "total_count", "processed_count", "success_count", 
                  "failed_count", "skipped_count", "created_at", 
                  "started_at", "completed_at", "error_message", "analysis_type"]
        
        query_cols = ", ".join(columns)
        query = f"SELECT {query_cols} FROM batch_analysis_jobs WHERE task_id = ? ORDER BY created_at DESC"
        
        try:
            result = self.conn.execute(query, [task_id]).fetchall()
            jobs = []
            for row in result:
                job = dict(zip(columns, row))
                # ... (后续处理)
                jobs.append(job)
        except:
            # 回退逻辑
            columns_old = columns[:-1]
            query_cols_old = ", ".join(columns_old)
            query = f"SELECT {query_cols_old} FROM batch_analysis_jobs WHERE task_id = ? ORDER BY created_at DESC"
            result = self.conn.execute(query, [task_id]).fetchall()
            jobs = []
            for row in result:
                job = dict(zip(columns_old, row))
                job["analysis_type"] = "email"
                jobs.append(job)

        # 统一后续处理
        final_jobs = []
        for job in jobs:
            if job.get("filter_keywords"):
                job["filter_keywords"] = json.loads(job["filter_keywords"])
            for field in ["created_at", "started_at", "completed_at"]:
                if job.get(field) and hasattr(job[field], 'isoformat'):
                    job[field] = job[field].isoformat()
        
        return jobs
    
    def update_batch_job_status(
        self, 
        job_id: str, 
        status: str, 
        error_message: Optional[str] = None
    ):
        """更新批量分析任务状态"""
        now = datetime.now()
        
        if status == "RUNNING":
            self.conn.execute(
                "UPDATE batch_analysis_jobs SET status = ?, started_at = ? WHERE id = ?",
                [status, now, job_id]
            )
        elif status in ("COMPLETED", "FAILED", "CANCELLED"):
            self.conn.execute(
                """UPDATE batch_analysis_jobs 
                   SET status = ?, completed_at = ?, error_message = ? 
                   WHERE id = ?""",
                [status, now, error_message, job_id]
            )
        else:
            self.conn.execute(
                "UPDATE batch_analysis_jobs SET status = ? WHERE id = ?",
                [status, job_id]
            )
    
    def update_batch_job_progress(
        self, 
        job_id: str, 
        processed_count: int,
        success_count: int,
        failed_count: int,
        skipped_count: int
    ):
        """更新批量分析任务进度"""
        self.conn.execute(
            """UPDATE batch_analysis_jobs 
               SET processed_count = ?, success_count = ?, 
                   failed_count = ?, skipped_count = ?
               WHERE id = ?""",
            [processed_count, success_count, failed_count, skipped_count, job_id]
        )
    
    def update_batch_job_total_count(self, job_id: str, total_count: int):
        """更新批量分析任务的总数"""
        self.conn.execute(
            "UPDATE batch_analysis_jobs SET total_count = ? WHERE id = ?",
            [total_count, job_id]
        )
    
    def get_emails_for_batch_analysis(
        self, 
        task_id: str, 
        filter_keywords: List[str] = None,
        limit: int = None,
        offset: int = 0
    ) -> tuple:
        """
        获取用于批量分析的邮件
        返回: (邮件列表, 被过滤的数量)
        """
        # 构建过滤条件
        filter_sql = ""
        if filter_keywords:
            conditions = []
            for keyword in filter_keywords:
                escaped = keyword.replace("'", "''")
                conditions.append(f"subject NOT LIKE '%{escaped}%'")
            filter_sql = " AND " + " AND ".join(conditions)
        
        # 查询符合条件的邮件
        query = f"""
            SELECT * FROM emails 
            WHERE task_id = ? {filter_sql}
            ORDER BY id
        """
        if limit:
            query += f" LIMIT {limit} OFFSET {offset}"
        
        result = self.conn.execute(query, [task_id]).fetchall()
        columns = ["id", "task_id", "sender", "receiver", "subject", "content", "timestamp"]
        emails = [dict(zip(columns, row)) for row in result]
        
        # 计算被过滤的数量
        total_query = "SELECT COUNT(*) FROM emails WHERE task_id = ?"
        total_result = self.conn.execute(total_query, [task_id]).fetchone()
        total_count = total_result[0] if total_result else 0
        
        filtered_query = f"SELECT COUNT(*) FROM emails WHERE task_id = ? {filter_sql}"
        filtered_result = self.conn.execute(filtered_query, [task_id]).fetchone()
        filtered_count = filtered_result[0] if filtered_result else 0
        
        skipped_count = total_count - filtered_count
        
        return emails, skipped_count
    
    def get_clusters_for_batch_analysis(self, task_id: str, cluster_type: str) -> List[Dict[str, Any]]:
        """获取用于批量分析的聚类列表"""
        if cluster_type == "people":
            result = self.conn.execute(
                """SELECT 
                       LEAST(sender, receiver) as participant1,
                       GREATEST(sender, receiver) as participant2,
                       COUNT(*) as email_count
                   FROM emails 
                   WHERE task_id = ? AND sender IS NOT NULL AND receiver IS NOT NULL
                   GROUP BY LEAST(sender, receiver), GREATEST(sender, receiver)
                   ORDER BY email_count DESC""",
                [task_id]
            ).fetchall()
            
            return [{"id": f"{row[0]} ↔ {row[1]}", "key": f"{row[0]} ↔ {row[1]}", "count": row[2]} for row in result]
        else:
            result = self.conn.execute(
                """SELECT 
                       subject,
                       COUNT(*) as email_count
                   FROM emails 
                   WHERE task_id = ? AND subject IS NOT NULL
                   GROUP BY subject
                   ORDER BY email_count DESC""",
                [task_id]
            ).fetchall()
            
            return [{"id": row[0], "key": row[0], "count": row[1]} for row in result]
    
    def has_email_analysis(self, email_id: int, analysis_type: str = "batch_summary") -> bool:
        """检查邮件是否已有指定类型的分析结果"""
        result = self.conn.execute(
            """SELECT COUNT(*) FROM analysis_results 
               WHERE email_id = ? AND analysis_type = ?""",
            [email_id, analysis_type]
        ).fetchone()
        return result[0] > 0 if result else False
    
    def close(self):
        """关闭数据库连接"""
        self.conn.close()


# 全局数据库服务实例
_db_service: Optional[DBService] = None


def get_db_service() -> DBService:
    """获取数据库服务实例（单例模式）"""
    global _db_service
    if _db_service is None:
        db_path = os.getenv("DB_PATH", "./data/student_c.duckdb")
        _db_service = DBService(db_path)
    return _db_service
