import React, { useState, useEffect } from 'react';
import axios from 'axios';
import EmailAnalyzer from './components/EmailAnalyzer';
import InsightChat from './components/InsightChat';
import Dashboard from './pages/Dashboard';
import PeopleDirectory from './pages/PeopleDirectory';

interface Task {
    id: string;
    name: string;
    status: string;
    created_at: string;
    file_path?: string;
}

interface Toast {
    id: number;
    type: 'success' | 'error' | 'info';
    message: string;
}

interface ConfirmDialogState {
    isOpen: boolean;
    title: string;
    message: string;
    taskId: string;
    taskName: string;
}

function App() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [taskName, setTaskName] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [toastId, setToastId] = useState(0);
    const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
        isOpen: false,
        title: '',
        message: '',
        taskId: '',
        taskName: ''
    });
    const [analyzerState, setAnalyzerState] = useState<{ isOpen: boolean; taskId: string; taskName: string } | null>(null);
    const [dashboardState, setDashboardState] = useState<{ isOpen: boolean; taskId: string; taskName: string } | null>(null);
    const [peopleState, setPeopleState] = useState<{ isOpen: boolean; taskId: string; taskName: string } | null>(null);
    const [chatState, setChatState] = useState<{ isOpen: boolean; taskId: string; taskName: string } | null>(null);

    // Toast 通知功能
    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
        const id = toastId;
        setToastId(id + 1);
        setToasts(prev => [...prev, { id, type, message }]);

        // 3秒后自动移除
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 3000);
    };

    // 加载任务列表
    const loadTasks = async () => {
        setLoading(true);
        try {
            const response = await axios.get('/api/tasks/');
            setTasks(response.data);
        } catch (error) {
            console.error('Failed to load tasks:', error);
            showToast('加载任务列表失败', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadTasks();
    }, []);

    // 上传文件并创建任务
    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!selectedFile || !taskName) {
            showToast('请填写任务名称并选择文件', 'error');
            return;
        }

        setUploading(true);
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('name', taskName);

        try {
            await axios.post('/api/tasks/', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            showToast('任务创建成功！正在后台处理...', 'success');
            setTaskName('');
            setSelectedFile(null);

            // 重置文件输入
            const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
            if (fileInput) fileInput.value = '';

            // 延迟加载任务列表，让用户看到成功提示
            setTimeout(() => {
                loadTasks();
            }, 500);
        } catch (error) {
            console.error('Upload failed:', error);
            showToast('上传失败，请重试', 'error');
        } finally {
            setUploading(false);
        }
    };

    // 删除任务 - 打开确认对话框
    const handleDelete = (taskId: string, taskName: string) => {
        setConfirmDialog({
            isOpen: true,
            title: '确认删除',
            message: `确定要删除任务"${taskName}"吗？这将删除所有相关数据和文件，此操作无法撤销。`,
            taskId,
            taskName
        });
    };

    // 确认删除
    const confirmDelete = async () => {
        const { taskId } = confirmDialog;
        setConfirmDialog({ ...confirmDialog, isOpen: false });
        setDeleting(taskId);

        try {
            await axios.delete(`/api/tasks/${taskId}`);
            showToast('任务删除成功', 'success');
            loadTasks();
        } catch (error) {
            console.error('Delete failed:', error);
            showToast('删除失败，请重试', 'error');
        } finally {
            setDeleting(null);
        }
    };

    // 取消删除
    const cancelDelete = () => {
        setConfirmDialog({ ...confirmDialog, isOpen: false });
    };

    return (
        <div className="min-h-screen bg-gray-100 p-8">
            <div className="max-w-6xl mx-auto">
                <h1 className="text-4xl font-bold text-gray-800 mb-8">
                    Student c - 邮件分析系统
                </h1>

                {/* Toast 通知区域 */}
                <div className="fixed top-4 right-4 z-50 space-y-2">
                    {toasts.map(toast => (
                        <div
                            key={toast.id}
                            className={`px-6 py-4 rounded-lg shadow-lg text-white font-medium flex items-center space-x-2 animate-slide-in ${toast.type === 'success' ? 'bg-green-500' :
                                toast.type === 'error' ? 'bg-red-500' :
                                    'bg-blue-500'
                                }`}
                        >
                            <span>
                                {toast.type === 'success' && '✓'}
                                {toast.type === 'error' && '✗'}
                                {toast.type === 'info' && 'ℹ'}
                            </span>
                            <span>{toast.message}</span>
                        </div>
                    ))}
                </div>

                {/* 确认对话框 */}
                {confirmDialog.isOpen && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in">
                        <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4 animate-scale-in">
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                {confirmDialog.title}
                            </h3>
                            <p className="text-gray-600 mb-6">
                                {confirmDialog.message}
                            </p>
                            <div className="flex justify-end space-x-3">
                                <button
                                    onClick={cancelDelete}
                                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={confirmDelete}
                                    className="px-4 py-2 text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
                                >
                                    确认删除
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* 上传表单 */}
                <div className="bg-white rounded-lg shadow p-6 mb-8">
                    <h2 className="text-2xl font-semibold mb-4">创建新任务</h2>
                    <form onSubmit={handleUpload} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                任务名称
                            </label>
                            <input
                                type="text"
                                value={taskName}
                                onChange={(e) => setTaskName(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="例如：2024年第一季度邮件"
                                disabled={uploading}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                选择文件 (CSV)
                            </label>
                            <input
                                type="file"
                                accept=".csv"
                                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                                className="w-full"
                                disabled={uploading}
                            />
                            {selectedFile && (
                                <p className="mt-2 text-sm text-gray-600">
                                    已选择: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                                </p>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={uploading}
                            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                        >
                            {uploading && (
                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            )}
                            <span>{uploading ? '上传中，请稍候...' : '创建任务'}</span>
                        </button>
                    </form>
                </div>

                {/* 任务列表 */}
                <div className="bg-white rounded-lg shadow p-6">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-2xl font-semibold">任务列表</h2>
                        <button
                            onClick={loadTasks}
                            disabled={loading}
                            className="text-sm text-blue-600 hover:text-blue-700 disabled:text-gray-400"
                        >
                            {loading ? '刷新中...' : '🔄 刷新'}
                        </button>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        </div>
                    ) : tasks.length === 0 ? (
                        <p className="text-gray-600 text-center py-8">暂无任务，请创建新任务</p>
                    ) : (
                        <div className="space-y-4">
                            {tasks.map((task) => (
                                <div
                                    key={task.id}
                                    className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                                >
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                            <h3 className="text-lg font-semibold text-gray-800">
                                                {task.name}
                                            </h3>
                                            <p className="text-sm text-gray-600 mt-1">
                                                状态: <span className={`font-medium inline-flex items-center px-2 py-1 rounded text-xs ${task.status === 'DONE' ? 'bg-green-100 text-green-800' :
                                                    task.status === 'PROCESSING' ? 'bg-yellow-100 text-yellow-800' :
                                                        task.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                                                            'bg-gray-100 text-gray-800'
                                                    }`}>
                                                    {task.status === 'DONE' && '✓ '}
                                                    {task.status === 'PROCESSING' && '⟳ '}
                                                    {task.status === 'FAILED' && '✗ '}
                                                    {task.status}
                                                </span>
                                            </p>
                                            <p className="text-sm text-gray-500 mt-1">
                                                创建时间: {new Date(task.created_at).toLocaleString('zh-CN')}
                                            </p>
                                            {task.file_path && (
                                                <p className="text-xs text-gray-400 mt-1">
                                                    文件: {task.file_path.split('/').pop()}
                                                </p>
                                            )}
                                        </div>

                                        <div className="ml-4 flex flex-wrap gap-2">
                                            <button
                                                onClick={() => setDashboardState({ isOpen: true, taskId: task.id, taskName: task.name })}
                                                disabled={task.status !== 'DONE'}
                                                className="bg-indigo-600 text-white px-3 py-2 rounded-md hover:bg-indigo-700 text-sm transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                                                title="仪表盘"
                                            >
                                                📊 仪表盘
                                            </button>
                                            <button
                                                onClick={() => setPeopleState({ isOpen: true, taskId: task.id, taskName: task.name })}
                                                disabled={task.status !== 'DONE'}
                                                className="bg-teal-600 text-white px-3 py-2 rounded-md hover:bg-teal-700 text-sm transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                                                title="人员名录"
                                            >
                                                👥 名录
                                            </button>
                                            <button
                                                onClick={() => setAnalyzerState({ isOpen: true, taskId: task.id, taskName: task.name })}
                                                disabled={task.status !== 'DONE'}
                                                className="bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 text-sm transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                                                title="邮件分析"
                                            >
                                                🔍 分析
                                            </button>
                                            <button
                                                onClick={() => setChatState({ isOpen: true, taskId: task.id, taskName: task.name })}
                                                disabled={task.status !== 'DONE'}
                                                className="bg-amber-500 text-white px-3 py-2 rounded-md hover:bg-amber-600 text-sm transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                                                title="智能问答"
                                            >
                                                💡 问答
                                            </button>
                                            <button
                                                onClick={() => handleDelete(task.id, task.name)}
                                                disabled={deleting === task.id}
                                                className="bg-red-600 text-white px-3 py-2 rounded-md hover:bg-red-700 text-sm transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center space-x-1"
                                                title="删除任务"
                                            >
                                                {deleting === task.id && (
                                                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                )}
                                                <span>{deleting === task.id ? '删除中...' : '🗑️ 删除'}</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Email Analyzer Modal */}
                {analyzerState?.isOpen && (
                    <EmailAnalyzer
                        taskId={analyzerState.taskId}
                        taskName={analyzerState.taskName}
                        onClose={() => setAnalyzerState(null)}
                    />
                )}

                {/* Dashboard Modal */}
                {dashboardState?.isOpen && (
                    <Dashboard
                        taskId={dashboardState.taskId}
                        taskName={dashboardState.taskName}
                        onClose={() => setDashboardState(null)}
                    />
                )}

                {/* People Directory Modal */}
                {peopleState?.isOpen && (
                    <PeopleDirectory
                        taskId={peopleState.taskId}
                        taskName={peopleState.taskName}
                        onClose={() => setPeopleState(null)}
                    />
                )}

                {/* Insight Chat Modal */}
                {chatState?.isOpen && (
                    <InsightChat
                        taskId={chatState.taskId}
                        taskName={chatState.taskName}
                        onClose={() => setChatState(null)}
                    />
                )}
            </div>
        </div>
    );
}

export default App;
