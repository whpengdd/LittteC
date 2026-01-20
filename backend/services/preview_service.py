"""
CSV 预览服务模块 - 提供文件列名预览和样本数据获取功能
"""
import duckdb
from typing import List, Dict, Any, Optional
from pathlib import Path


class PreviewService:
    """CSV 文件预览服务"""
    
    @staticmethod
    def get_csv_columns(file_path: str) -> List[str]:
        """
        获取 CSV 文件的所有列名
        
        Args:
            file_path: CSV 文件的绝对路径
            
        Returns:
            列名列表
        """
        conn = duckdb.connect(":memory:")
        try:
            # 使用 DuckDB 的 read_csv_auto 读取 schema
            result = conn.execute(
                f"SELECT * FROM read_csv_auto('{file_path}') LIMIT 0"
            )
            columns = [desc[0] for desc in result.description]
            return columns
        finally:
            conn.close()
    
    @staticmethod
    def get_sample_rows(file_path: str, limit: int = 5) -> List[Dict[str, Any]]:
        """
        获取 CSV 文件的前 N 行数据作为预览
        
        Args:
            file_path: CSV 文件的绝对路径
            limit: 返回的行数，默认 5 行
            
        Returns:
            样本数据列表，每行为一个字典
        """
        conn = duckdb.connect(":memory:")
        try:
            result = conn.execute(
                f"SELECT * FROM read_csv_auto('{file_path}') LIMIT {limit}"
            )
            columns = [desc[0] for desc in result.description]
            rows = result.fetchall()
            
            sample_data = []
            for row in rows:
                row_dict = {}
                for i, col in enumerate(columns):
                    value = row[i]
                    # 处理特殊类型的序列化
                    if hasattr(value, 'isoformat'):
                        value = value.isoformat()
                    elif value is not None and not isinstance(value, (str, int, float, bool)):
                        value = str(value)
                    row_dict[col] = value
                sample_data.append(row_dict)
            
            return sample_data
        finally:
            conn.close()
    
    @staticmethod
    def get_file_info(file_path: str) -> Dict[str, Any]:
        """
        获取文件的基本信息
        
        Args:
            file_path: 文件路径
            
        Returns:
            包含文件名、大小等信息的字典
        """
        path = Path(file_path)
        conn = duckdb.connect(":memory:")
        try:
            # 获取总行数（不含表头）
            result = conn.execute(
                f"SELECT COUNT(*) FROM read_csv_auto('{file_path}')"
            )
            row_count = result.fetchone()[0]
            
            return {
                "filename": path.name,
                "size_bytes": path.stat().st_size,
                "row_count": row_count,
                "extension": path.suffix.lower()
            }
        finally:
            conn.close()
    
    @staticmethod
    def validate_file(file_path: str) -> Dict[str, Any]:
        """
        验证文件是否可以被正确解析
        
        Args:
            file_path: 文件路径
            
        Returns:
            验证结果，包含 is_valid 和可能的 error_message
        """
        try:
            columns = PreviewService.get_csv_columns(file_path)
            if not columns:
                return {
                    "is_valid": False,
                    "error_message": "无法识别文件列名，请检查文件格式"
                }
            return {
                "is_valid": True,
                "columns": columns,
                "column_count": len(columns)
            }
        except Exception as e:
            return {
                "is_valid": False,
                "error_message": f"文件解析失败: {str(e)}"
            }


    @staticmethod
    def get_filtered_row_count(file_path: str, filter_config: Dict[str, Any]) -> int:
        """
        获取过滤后的数据行数
        
        Args:
            file_path: 文件路径
            filter_config: 过滤配置
            
        Returns:
            满足条件（未被过滤）的行数
        """
        from services.db_service import DBService
        
        conn = duckdb.connect(":memory:")
        try:
            # 构建过滤 WHERE 子句
            where_sql = DBService.build_filter_where_clause(filter_config)
            
            # 计算行数
            # 注意：build_filter_where_clause 返回的 logic 是过滤排除的逻辑
            # 但我们需要的是 *剩余* 的行数，也就是 *不* 满足过滤条件的行数吗？
            # 仔细看 build_filter_where_clause 的注释：
            # "构建过滤条件的 WHERE 子句... 排除符合条件的记录"
            # 
            # 让我们复查一下 db_service.py:
            # where_parts.append(f'("{field}" != \'{escaped_value}\')')  --> 这是保留不等于的
            # 
            # 再次检查 db_service 逻辑：
            # if match_type == "exact": where_parts.append(f'("{field}" != \'{escaped_value}\' OR "{field}" IS NULL)')
            # 这里的语义是：保留那些（字段 != 值 或者 字段为空）的记录。即排除（字段 == 值）的记录。
            # 
            # 所以 build_filter_where_clause 返回的 SQL 是用来 SELECT 那些 **应该被保留** 的记录的。
            # 直接使用这个 WHERE 子句即可统计剩余行数。
            
            result = conn.execute(
                f"SELECT COUNT(*) FROM read_csv_auto('{file_path}') {where_sql}"
            )
            return result.fetchone()[0]
        finally:
            conn.close()


# 全局预览服务实例
_preview_service: Optional[PreviewService] = None


def get_preview_service() -> PreviewService:
    """获取预览服务实例（单例模式）"""
    global _preview_service
    if _preview_service is None:
        _preview_service = PreviewService()
    return _preview_service
