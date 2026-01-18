"""
预览 API 模块
提供 CSV 文件列名预览和样本数据获取接口
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from services.preview_service import get_preview_service


router = APIRouter(prefix="/api/preview", tags=["preview"])


class ColumnPreviewResponse(BaseModel):
    """列名预览响应模型"""
    columns: List[str]
    sample_rows: List[Dict[str, Any]]
    file_info: Dict[str, Any]


class ValidationResponse(BaseModel):
    """文件验证响应模型"""
    is_valid: bool
    columns: Optional[List[str]] = None
    column_count: Optional[int] = None
    error_message: Optional[str] = None


@router.get("/columns", response_model=ColumnPreviewResponse)
async def preview_columns(
    file_path: str = Query(..., description="CSV 文件的完整路径"),
    sample_limit: int = Query(5, description="预览行数", ge=1, le=20)
):
    """
    预览 CSV 文件的列名和样本数据
    
    Args:
        file_path: CSV 文件的完整路径
        sample_limit: 预览的行数（1-20）
        
    Returns:
        包含列名列表、样本数据和文件信息的响应
    """
    preview_service = get_preview_service()
    
    try:
        # 获取列名
        columns = preview_service.get_csv_columns(file_path)
        
        # 获取样本数据
        sample_rows = preview_service.get_sample_rows(file_path, sample_limit)
        
        # 获取文件信息
        file_info = preview_service.get_file_info(file_path)
        
        return ColumnPreviewResponse(
            columns=columns,
            sample_rows=sample_rows,
            file_info=file_info
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="文件不存在")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"文件解析失败: {str(e)}")


@router.get("/validate", response_model=ValidationResponse)
async def validate_file(
    file_path: str = Query(..., description="待验证的文件路径")
):
    """
    验证文件是否可以被正确解析
    
    Args:
        file_path: 待验证的文件路径
        
    Returns:
        验证结果
    """
    preview_service = get_preview_service()
    
    try:
        result = preview_service.validate_file(file_path)
        return ValidationResponse(**result)
    except FileNotFoundError:
        return ValidationResponse(
            is_valid=False,
            error_message="文件不存在"
        )
    except Exception as e:
        return ValidationResponse(
            is_valid=False,
            error_message=f"验证失败: {str(e)}"
        )
