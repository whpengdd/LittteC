"""
任务管理 API
提供任务的创建、查询、删除等接口
支持分阶段导入：上传 -> 预览 -> 配置 -> 导入
"""
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import uuid
from pathlib import Path

from services.db_service import get_db_service
from services.storage_service import get_storage_service
from services.preview_service import get_preview_service


router = APIRouter(prefix="/api/tasks", tags=["tasks"])


class TaskResponse(BaseModel):
    """任务响应模型"""
    id: str
    name: str
    status: str
    created_at: str
    file_path: Optional[str] = None


class TaskCreate(BaseModel):
    """创建任务请求模型"""
    name: str


class FieldMapping(BaseModel):
    """字段映射配置"""
    sender: Optional[str] = None       # CSV 中对应发件人的列名
    receiver: Optional[str] = None     # CSV 中对应收件人的列名
    subject: Optional[str] = None      # CSV 中对应主题的列名
    content: Optional[str] = None      # CSV 中对应正文的列名
    timestamp: Optional[str] = None    # CSV 中对应时间戳的列名


class FilterCondition(BaseModel):
    """单个过滤条件"""
    field: str                         # 过滤的字段（CSV 列名）
    match_type: str                    # "exact"（精确匹配）或 "contains"（包含）
    value: str                         # 匹配值


class FilterConfig(BaseModel):
    """过滤配置"""
    logic: str = "AND"                 # "AND" 或 "OR"
    conditions: List[FilterCondition] = []


class ImportConfig(BaseModel):
    """导入配置"""
    task_name: str                     # 任务名称
    temp_file_id: str                  # 临时文件标识（上传时返回的 ID）
    mapping: FieldMapping              # 字段映射
    filter: Optional[FilterConfig] = None  # 过滤配置（可选）


class UploadResponse(BaseModel):
    """文件上传响应"""
    temp_file_id: str                  # 临时文件标识
    file_path: str                     # 文件路径
    columns: List[str]                 # CSV 列名列表
    sample_rows: List[Dict[str, Any]]  # 样本数据
    file_info: Dict[str, Any]          # 文件信息


@router.post("/", response_model=TaskResponse)
async def create_task(
    name: str = Form(...),
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None
):
    """
    创建新任务并上传文件
    
    Args:
        name: 任务名称
        file: 上传的文件
        background_tasks: 后台任务
    """
    # 生成任务 ID
    task_id = str(uuid.uuid4())
    
    # 获取服务实例
    db_service = get_db_service()
    storage_service = get_storage_service()
    
    # 保存上传的文件
    file_path = await storage_service.save_upload_file(
        file.file, 
        task_id, 
        file.filename
    )
    
    # 创建任务记录
    task = db_service.create_task(task_id, name, file_path)
    
    # 在后台处理文件导入
    if background_tasks:
        background_tasks.add_task(
            process_file_import,
            task_id,
            file_path,
            file.filename
        )
    
    return TaskResponse(**task)


@router.get("/", response_model=List[TaskResponse])
async def list_tasks():
    """获取所有任务列表"""
    db_service = get_db_service()
    tasks = db_service.get_tasks()
    return [TaskResponse(**task) for task in tasks]


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(task_id: str):
    """获取单个任务详情"""
    db_service = get_db_service()
    task = db_service.get_task(task_id)
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return TaskResponse(**task)


@router.delete("/{task_id}")
async def delete_task(task_id: str):
    """
    删除任务（级联删除）
    1. 删除数据库中的邮件记录
    2. 删除数据库中的任务记录
    3. 删除磁盘上的文件
    """
    db_service = get_db_service()
    storage_service = get_storage_service()
    
    # 检查任务是否存在
    task = db_service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # 删除数据库记录（包括关联的邮件）
    db_service.delete_task(task_id)
    
    # 删除磁盘文件
    storage_service.delete_task_files(task_id)
    
    return {"message": f"Task {task_id} deleted successfully"}


@router.get("/{task_id}/emails")
async def get_task_emails(task_id: str, limit: int = 100, offset: int = 0):
    """获取任务的邮件记录"""
    db_service = get_db_service()
    
    # 检查任务是否存在
    task = db_service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    emails = db_service.get_emails_by_task(task_id, limit, offset)
    return {"emails": emails, "limit": limit, "offset": offset}


def process_file_import(task_id: str, file_path: str, filename: str):
    """
    后台任务：处理文件导入（旧版，兼容自动映射导入）
    
    Args:
        task_id: 任务 ID
        file_path: 文件路径
        filename: 文件名
    """
    db_service = get_db_service()
    
    try:
        # 根据文件扩展名确定文件类型
        file_ext = Path(filename).suffix.lower().lstrip(".")
        
        # 导入文件到数据库
        db_service.ingest_file(task_id, file_path, file_ext)
        
    except Exception as e:
        print(f"Error processing file import for task {task_id}: {e}")
        db_service.update_task_status(task_id, "FAILED")


# ==================== 分阶段导入 API ====================

# 临时文件存储（用于存储上传后待确认导入的文件信息）
_temp_files: Dict[str, Dict[str, Any]] = {}


@router.post("/upload", response_model=UploadResponse)
async def upload_file(file: UploadFile = File(...)):
    """
    分阶段导入 - 第一步：上传文件并返回预览信息
    
    上传文件后不立即导入，而是返回列名和样本数据供用户配置映射和过滤规则
    
    Args:
        file: 上传的 CSV 文件
        
    Returns:
        包含临时文件 ID、列名、样本数据的响应
    """
    # 生成临时文件 ID
    temp_file_id = str(uuid.uuid4())
    
    # 获取服务实例
    storage_service = get_storage_service()
    preview_service = get_preview_service()
    
    # 保存上传的文件（使用临时 ID 作为任务 ID）
    file_path = await storage_service.save_upload_file(
        file.file, 
        f"temp_{temp_file_id}", 
        file.filename
    )
    
    try:
        # 获取列名
        columns = preview_service.get_csv_columns(file_path)
        
        # 获取样本数据
        sample_rows = preview_service.get_sample_rows(file_path, 5)
        
        # 获取文件信息
        file_info = preview_service.get_file_info(file_path)
        
        # 存储临时文件信息
        _temp_files[temp_file_id] = {
            "file_path": file_path,
            "filename": file.filename,
            "columns": columns
        }
        
        return UploadResponse(
            temp_file_id=temp_file_id,
            file_path=file_path,
            columns=columns,
            sample_rows=sample_rows,
            file_info=file_info
        )
    except Exception as e:
        # 解析失败时删除临时文件
        storage_service.delete_task_files(f"temp_{temp_file_id}")
        raise HTTPException(status_code=400, detail=f"文件解析失败: {str(e)}")


@router.post("/import", response_model=TaskResponse)
async def import_with_config(
    config: ImportConfig,
    background_tasks: BackgroundTasks = None
):
    """
    分阶段导入 - 第二步：使用用户配置执行导入
    
    接收字段映射和过滤规则，创建任务并执行导入
    
    Args:
        config: 导入配置（包含任务名称、字段映射、过滤规则）
        background_tasks: 后台任务
        
    Returns:
        创建的任务信息
    """
    # 检查临时文件是否存在
    if config.temp_file_id not in _temp_files:
        raise HTTPException(
            status_code=404, 
            detail="临时文件不存在或已过期，请重新上传"
        )
    
    temp_file_info = _temp_files[config.temp_file_id]
    file_path = temp_file_info["file_path"]
    filename = temp_file_info["filename"]
    
    # 验证必选字段映射
    mapping = config.mapping
    missing_fields = []
    if not mapping.sender:
        missing_fields.append("发件人 (sender)")
    if not mapping.receiver:
        missing_fields.append("收件人 (receiver)")
    if not mapping.subject:
        missing_fields.append("主题 (subject)")
    if not mapping.content:
        missing_fields.append("正文 (content)")
    
    if missing_fields:
        raise HTTPException(
            status_code=400,
            detail=f"以下必选字段未配置映射: {', '.join(missing_fields)}"
        )
    
    # 生成正式任务 ID
    task_id = str(uuid.uuid4())
    
    # 获取服务实例
    db_service = get_db_service()
    storage_service = get_storage_service()
    
    # 将临时文件移动到正式目录
    new_file_path = storage_service.move_temp_file(
        file_path, 
        f"temp_{config.temp_file_id}", 
        task_id
    )
    
    # 创建任务记录
    task = db_service.create_task(task_id, config.task_name, new_file_path)
    
    # 准备映射和过滤配置
    mapping_dict = mapping.model_dump()
    filter_dict = config.filter.model_dump() if config.filter else None
    
    # 在后台处理文件导入
    if background_tasks:
        background_tasks.add_task(
            process_file_import_with_config,
            task_id,
            new_file_path,
            filename,
            mapping_dict,
            filter_dict
        )
    
    # 清理临时文件记录
    del _temp_files[config.temp_file_id]
    
    return TaskResponse(**task)


def process_file_import_with_config(
    task_id: str, 
    file_path: str, 
    filename: str,
    mapping: Dict[str, Any],
    filter_config: Optional[Dict[str, Any]] = None
):
    """
    后台任务：使用用户配置处理文件导入
    
    Args:
        task_id: 任务 ID
        file_path: 文件路径
        filename: 文件名
        mapping: 字段映射配置
        filter_config: 过滤配置
    """
    db_service = get_db_service()
    
    try:
        # 根据文件扩展名确定文件类型
        file_ext = Path(filename).suffix.lower().lstrip(".")
        
        # 使用用户配置导入文件到数据库
        db_service.ingest_file_with_config(
            task_id, 
            file_path, 
            file_ext,
            mapping,
            filter_config
        )
        
    except Exception as e:
        print(f"Error processing file import for task {task_id}: {e}")
        db_service.update_task_status(task_id, "FAILED")

