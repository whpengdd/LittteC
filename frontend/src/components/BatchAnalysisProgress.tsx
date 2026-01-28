import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

interface BatchAnalysisProgressProps {
    jobId: string;
    taskId: string;
    onComplete?: () => void;
    onCancel?: () => void;
    onProgress?: (processed: number, success: number) => void;
    onResume?: (jobId: string) => void;
}

interface JobStatus {
    job_id: string;
    task_id: string;
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    progress: {
        total: number;
        processed: number;
        success: number;
        failed: number;
        skipped: number;
        percent: number;
    };
    config: {
        model: string;
        concurrency: number;
        max_retries: number;
    };
    timestamps: {
        created_at: string | null;
        started_at: string | null;
        completed_at: string | null;
    };
    error_message: string | null;
}

const BatchAnalysisProgress: React.FC<BatchAnalysisProgressProps> = ({
    jobId,
    taskId,
    onComplete,
    onCancel,
    onProgress,
    onResume
}) => {
    const [status, setStatus] = useState<JobStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [cancelling, setCancelling] = useState(false);
    const [lastProcessed, setLastProcessed] = useState(0);
    const [completedCalled, setCompletedCalled] = useState(false); // 标记onComplete是否已调用

    // 获取状态
    const fetchStatus = useCallback(async () => {
        try {
            const response = await axios.get<JobStatus>(`/api/batch-analysis/${jobId}/status`);
            const newStatus = response.data;
            setStatus(newStatus);

            // 检测处理数量变化，触发进度回调
            if (onProgress && newStatus.progress.processed > lastProcessed) {
                setLastProcessed(newStatus.progress.processed);
                onProgress(newStatus.progress.processed, newStatus.progress.success);
            }

            // 任务完成时调用回调（只调用一次）
            if (newStatus.status === 'COMPLETED' && onComplete && !completedCalled) {
                setCompletedCalled(true);
                onComplete();
            }
        } catch (error) {
            console.error('Failed to fetch job status:', error);
        } finally {
            setLoading(false);
        }
    }, [jobId, onComplete, onProgress, lastProcessed, completedCalled]);

    // 轮询状态
    useEffect(() => {
        fetchStatus();

        // 如果任务还在运行，每 2 秒刷新一次
        const interval = setInterval(() => {
            if (status?.status === 'RUNNING' || status?.status === 'PENDING') {
                fetchStatus();
            }
        }, 2000);

        return () => clearInterval(interval);
    }, [fetchStatus, status?.status]);

    // 取消任务
    const handleCancel = async () => {
        setCancelling(true);
        try {
            await axios.post(`/api/batch-analysis/${jobId}/cancel`);
            fetchStatus();
            if (onCancel) {
                onCancel();
            }
        } catch (error: any) {
            console.error('Failed to cancel job:', error);
            alert(error.response?.data?.detail || '取消失败');
        } finally {
            setCancelling(false);
        }
    };

    // 获取状态颜色
    const getStatusColor = (s: string) => {
        switch (s) {
            case 'RUNNING':
                return 'bg-blue-100 text-blue-800';
            case 'COMPLETED':
                return 'bg-green-100 text-green-800';
            case 'FAILED':
                return 'bg-red-100 text-red-800';
            case 'CANCELLED':
                return 'bg-gray-100 text-gray-800';
            default:
                return 'bg-yellow-100 text-yellow-800';
        }
    };

    // 获取状态图标
    const getStatusIcon = (s: string) => {
        switch (s) {
            case 'RUNNING':
                return '⏳';
            case 'COMPLETED':
                return '✅';
            case 'FAILED':
                return '❌';
            case 'CANCELLED':
                return '🚫';
            default:
                return '⏸️';
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
                <span className="ml-3 text-gray-600">加载中...</span>
            </div>
        );
    }

    if (!status) {
        return (
            <div className="p-4 bg-red-50 text-red-700 rounded-lg">
                无法获取任务状态
            </div>
        );
    }

    const isActive = status.status === 'RUNNING' || status.status === 'PENDING';
    const isResumable = status.status === 'FAILED' || status.status === 'CANCELLED' || status.status === 'INTERRUPTED';

    return (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
            {/* 头部 */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">{getStatusIcon(status.status)}</span>
                    <div>
                        <h4 className="font-semibold text-gray-900">批量分析任务</h4>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${getStatusColor(status.status)}`}>
                            {status.status === 'RUNNING' ? '运行中' :
                                status.status === 'COMPLETED' ? '已完成' :
                                    status.status === 'FAILED' ? '失败' :
                                        status.status === 'CANCELLED' ? '已取消' :
                                            status.status === 'INTERRUPTED' ? '已中断' : '等待中'}
                        </span>
                    </div>
                </div>

                {isActive && (
                    <button
                        onClick={handleCancel}
                        disabled={cancelling}
                        className="px-3 py-1 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                    >
                        {cancelling ? '取消中...' : '取消任务'}
                    </button>
                )}

                {isResumable && onResume && (
                    <button
                        onClick={() => onResume(jobId)}
                        className="px-3 py-1 text-sm text-green-600 hover:text-green-800 hover:bg-green-50 rounded transition-colors flex items-center gap-1"
                    >
                        <span>▶</span> 继续执行
                    </button>
                )}
            </div>

            {/* 进度条 */}
            <div className="mb-4">
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>进度</span>
                    <span>{status.progress.percent}%</span>
                </div>
                <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div
                        className={`h-full transition-all duration-300 ${status.status === 'FAILED' ? 'bg-red-500' :
                            status.status === 'COMPLETED' ? 'bg-green-500' :
                                'bg-purple-500'
                            }`}
                        style={{ width: `${status.progress.percent}%` }}
                    />
                </div>
            </div>

            {/* 统计数据 */}
            <div className="grid grid-cols-4 gap-2 mb-4">
                <div className="text-center p-2 bg-gray-50 rounded">
                    <div className="text-lg font-bold text-gray-900">{status.progress.total}</div>
                    <div className="text-xs text-gray-500">总数</div>
                </div>
                <div className="text-center p-2 bg-green-50 rounded">
                    <div className="text-lg font-bold text-green-600">{status.progress.success}</div>
                    <div className="text-xs text-gray-500">成功</div>
                </div>
                <div className="text-center p-2 bg-red-50 rounded">
                    <div className="text-lg font-bold text-red-600">{status.progress.failed}</div>
                    <div className="text-xs text-gray-500">失败</div>
                </div>
                <div className="text-center p-2 bg-yellow-50 rounded">
                    <div className="text-lg font-bold text-yellow-600">{status.progress.skipped}</div>
                    <div className="text-xs text-gray-500">跳过</div>
                </div>
            </div>

            {/* 配置信息 */}
            <div className="text-xs text-gray-500 flex flex-wrap gap-3">
                <span>模型: {status.config.model}</span>
                <span>并行度: {status.config.concurrency}</span>
                {status.timestamps.started_at && (
                    <span>开始于: {new Date(status.timestamps.started_at).toLocaleTimeString('zh-CN')}</span>
                )}
            </div>

            {/* 错误信息 */}
            {status.error_message && (
                <div className="mt-3 p-2 bg-red-50 text-red-700 text-sm rounded">
                    错误: {status.error_message}
                </div>
            )}

            {/* 运行中动画 */}
            {isActive && (
                <div className="mt-3 flex items-center text-sm text-purple-600">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-purple-600 border-t-transparent mr-2"></div>
                    正在分析邮件...
                </div>
            )}
        </div>
    );
};

export default BatchAnalysisProgress;
