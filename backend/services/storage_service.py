"""
存储服务模块 - 负责文件的流式上传和管理
"""
import shutil
from pathlib import Path
from typing import BinaryIO
import os


class StorageService:
    """文件存储服务"""
    
    def __init__(self, upload_dir: str = "./data/uploads"):
        """初始化存储服务"""
        self.upload_dir = Path(upload_dir)
        self.upload_dir.mkdir(parents=True, exist_ok=True)
    
    async def save_upload_file(self, file: BinaryIO, task_id: str, filename: str) -> str:
        """
        流式保存上传的文件
        使用 shutil.copyfileobj 处理大文件，避免内存溢出
        
        Args:
            file: 文件对象（FastAPI 的 UploadFile.file）
            task_id: 任务 ID
            filename: 文件名
            
        Returns:
            str: 保存的文件路径
        """
        # 为每个任务创建独立目录
        task_dir = self.upload_dir / task_id
        task_dir.mkdir(parents=True, exist_ok=True)
        
        file_path = task_dir / filename
        
        # 使用流式写入，分块处理
        with open(file_path, "wb") as f:
            shutil.copyfileobj(file, f, length=1024 * 1024)  # 1MB 块大小
        
        return str(file_path)
    
    def delete_task_files(self, task_id: str):
        """
        删除任务的所有文件
        
        Args:
            task_id: 任务 ID
        """
        task_dir = self.upload_dir / task_id
        if task_dir.exists():
            shutil.rmtree(task_dir)
    
    def get_file_path(self, task_id: str, filename: str) -> str:
        """获取文件路径"""
        return str(self.upload_dir / task_id / filename)
    
    def file_exists(self, task_id: str, filename: str) -> bool:
        """检查文件是否存在"""
        file_path = self.upload_dir / task_id / filename
        return file_path.exists()
    
    def move_temp_file(self, source_path: str, temp_task_id: str, new_task_id: str) -> str:
        """
        将临时文件移动到正式任务目录
        
        Args:
            source_path: 源文件完整路径
            temp_task_id: 临时任务 ID（用于定位和清理临时目录）
            new_task_id: 新任务 ID
            
        Returns:
            str: 新文件路径
        """
        source = Path(source_path)
        if not source.exists():
            raise FileNotFoundError(f"临时文件不存在: {source_path}")
        
        # 创建新任务目录
        new_task_dir = self.upload_dir / new_task_id
        new_task_dir.mkdir(parents=True, exist_ok=True)
        
        # 移动文件
        new_path = new_task_dir / source.name
        shutil.move(str(source), str(new_path))
        
        # 清理临时目录（如果为空）
        temp_dir = self.upload_dir / temp_task_id
        if temp_dir.exists() and not any(temp_dir.iterdir()):
            temp_dir.rmdir()
        
        return str(new_path)


# 全局存储服务实例
_storage_service = None


def get_storage_service() -> StorageService:
    """获取存储服务实例（单例模式）"""
    global _storage_service
    if _storage_service is None:
        data_dir = os.getenv("DATA_DIR", "./data")
        upload_dir = os.path.join(data_dir, "uploads")
        _storage_service = StorageService(upload_dir)
    return _storage_service
