import React, { useState, useEffect } from 'react';
import axios from 'axios';
import EmailAnalyzer from './components/EmailAnalyzer';
import InsightChat from './components/InsightChat';
import ImportWizard from './components/ImportWizard';
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
    const [showImportWizard, setShowImportWizard] = useState(false);

    // 全局 LLM 设置状态
    const [showSettings, setShowSettings] = useState(false);
    const [llmConfig, setLlmConfig] = useState<{ provider: string; available_providers: string[] }>({ provider: 'azure', available_providers: ['azure'] });
    const [settingsLoading, setSettingsLoading] = useState(false);

    // Standalone View Mode State
    const [viewMode] = useState(() => new URLSearchParams(window.location.search).get('view'));
    const [viewTaskId] = useState(() => new URLSearchParams(window.location.search).get('taskId'));
    const [viewTaskName] = useState(() => new URLSearchParams(window.location.search).get('taskName'));

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 5;

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
    const loadTasks = async (silent = false) => {
        if (!silent) {
            setLoading(true);
        }
        try {
            const response = await axios.get('/api/tasks/');
            setTasks(response.data);
        } catch (error) {
            console.error('Failed to load tasks:', error);
            if (!silent) {
                showToast('加载任务列表失败', 'error');
            }
        } finally {
            if (!silent) {
                setLoading(false);
            }
        }
    };

    // 加载 LLM 配置
    const loadLLMConfig = async () => {
        try {
            const response = await axios.get('/api/config/llm');
            setLlmConfig(response.data);
        } catch (error) {
            console.error('Failed to load LLM config:', error);
        }
    };

    // 更新 LLM 配置
    const updateLLMConfig = async (provider: string) => {
        setSettingsLoading(true);
        try {
            const response = await axios.put('/api/config/llm', { provider });
            setLlmConfig(response.data);
            showToast('AI 模型已设置为 Azure OpenAI', 'success');
        } catch (error) {
            console.error('Failed to update LLM config:', error);
            showToast('修改失败，请重试', 'error');
        } finally {
            setSettingsLoading(false);
        }
    };

    useEffect(() => {
        if (viewMode !== 'analyzer') {
            loadTasks();
            loadLLMConfig();
        }
    }, []);

    // 轮询检查任务状态
    useEffect(() => {
        const hasActiveTasks = tasks.some(t =>
            t.status === 'PENDING' || t.status === 'PROCESSING'
        );

        let intervalId: NodeJS.Timeout;

        if (hasActiveTasks) {
            intervalId = setInterval(() => {
                loadTasks(true); // Silent refresh
            }, 2000);
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [tasks]);

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

    // Standalone Analyzer View
    if (viewMode === 'analyzer' && viewTaskId && viewTaskName) {
        return (
            <EmailAnalyzer
                taskId={viewTaskId}
                taskName={decodeURIComponent(viewTaskName)}
                onClose={() => window.close()}
                isStandalone={true}
            />
        );
    }

    // 计算统计数据
    const stats = {
        totalTasks: tasks.length,
        completedTasks: tasks.filter(t => t.status === 'DONE').length,
        processingTasks: tasks.filter(t => t.status === 'PROCESSING').length,
        pendingTasks: tasks.filter(t => t.status === 'PENDING').length
    };

    return (
        <div className="min-h-screen p-6 lg:p-8" style={{ backgroundColor: 'var(--bg-main)' }}>
            <div className="max-w-7xl mx-auto">
                {/* 页面标题 */}
                <div className="mb-8 flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                            📧 邮件智能分析系统
                        </h1>
                        <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
                            上传邮件数据，利用 AI 进行深度分析和洞察挖掘
                        </p>
                    </div>
                    <button
                        onClick={() => setShowSettings(true)}
                        className="icon-btn primary text-xl"
                        title="全局设置"
                    >
                        ⚙️
                    </button>
                </div>

                {/* 统计卡片区域 */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <div className="stat-card">
                        <div className="stat-icon green">📊</div>
                        <div>
                            <div className="stat-value">{stats.totalTasks}</div>
                            <div className="stat-label">任务总数</div>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon blue">✅</div>
                        <div>
                            <div className="stat-value">{stats.completedTasks}</div>
                            <div className="stat-label">已完成</div>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon yellow">⏳</div>
                        <div>
                            <div className="stat-value">{stats.processingTasks}</div>
                            <div className="stat-label">处理中</div>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon orange">📋</div>
                        <div>
                            <div className="stat-value">{stats.pendingTasks}</div>
                            <div className="stat-label">待处理</div>
                        </div>
                    </div>
                </div>

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

                {/* 上传表单卡片 */}
                <div className="stat-card mb-6" style={{ flexDirection: 'column', alignItems: 'stretch', padding: '1.5rem' }}>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>创建新分析任务</h2>
                        <button
                            type="button"
                            onClick={() => setShowImportWizard(true)}
                            disabled={uploading}
                            className="text-sm flex items-center gap-1 px-3 py-1.5 rounded-lg border transition-colors"
                            style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
                        >
                            🔧 高级导入
                        </button>
                    </div>
                    <form onSubmit={handleUpload} className="flex flex-wrap items-end gap-4">
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                任务名称
                            </label>
                            <input
                                type="text"
                                value={taskName}
                                onChange={(e) => setTaskName(e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                style={{ borderColor: 'var(--border-light)' }}
                                placeholder="例如：2024年Q1邮件分析"
                                disabled={uploading}
                            />
                        </div>
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                选择文件 (CSV)
                            </label>
                            <input
                                type="file"
                                accept=".csv"
                                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                                className="w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                                disabled={uploading}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={uploading || !selectedFile || !taskName}
                            className="btn-gradient flex items-center gap-2"
                        >
                            {uploading && (
                                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            )}
                            <span>⚡ {uploading ? '上传中...' : '开始分析'}</span>
                        </button>
                    </form>
                    {selectedFile && (
                        <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                            已选择: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                        </p>
                    )}
                </div>

                {/* 任务列表表格 */}
                <div className="data-table">
                    {/* 表格头部工具栏 */}
                    <div className="px-6 py-4 flex justify-between items-center" style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>📋 任务列表</h2>
                            <span className="badge info">{tasks.length} 个任务</span>
                        </div>
                        <button
                            onClick={loadTasks}
                            disabled={loading}
                            className="icon-btn primary"
                            title="刷新列表"
                        >
                            {loading ? (
                                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            ) : '🔄'}
                        </button>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <svg className="animate-spin h-8 w-8" style={{ color: 'var(--primary-indigo)' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        </div>
                    ) : tasks.length === 0 ? (
                        <div className="text-center py-16">
                            <div className="text-5xl mb-4">📭</div>
                            <p style={{ color: 'var(--text-secondary)' }}>暂无分析任务</p>
                            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>上传 CSV 文件开始您的第一个邮件分析</p>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead>
                                <tr style={{ background: '#F8FAFC' }}>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>任务名称</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>状态</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>创建时间</th>
                                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tasks.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((task) => (
                                    <tr key={task.id} className="hover:bg-gray-50 transition-colors" style={{ borderBottom: '1px solid var(--border-light)' }}>
                                        <td className="px-6 py-4">
                                            <div className="participant-cell">
                                                <div className="avatar sender">{task.name.charAt(0).toUpperCase()}</div>
                                                <div className="participant-info">
                                                    <span className="participant-name">{task.name}</span>
                                                    {task.file_path && (
                                                        <span className="participant-email">{task.file_path.split('/').pop()}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`badge ${task.status === 'DONE' ? 'success' : task.status === 'PROCESSING' ? 'warning' : task.status === 'FAILED' ? 'bg-red-100 text-red-600' : 'neutral'}`}>
                                                {task.status === 'DONE' && '✓ '}
                                                {task.status === 'PROCESSING' && '⟳ '}
                                                {task.status === 'FAILED' && '✗ '}
                                                {task.status === 'DONE' ? '已完成' : task.status === 'PROCESSING' ? '处理中' : task.status === 'FAILED' ? '失败' : '待处理'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                                            {new Date(task.created_at).toLocaleString('zh-CN')}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex justify-end gap-1">
                                                {/* 如果任务正在处理中，显示查看进度按钮 */}
                                                {task.status === 'PROCESSING' && (
                                                    <button
                                                        onClick={() => {
                                                            const url = `/?view=analyzer&taskId=${task.id}&taskName=${encodeURIComponent(task.name)}`;
                                                            window.open(url, '_blank');
                                                        }}
                                                        className="icon-btn warning"
                                                        title="查看进度"
                                                    >
                                                        ⏳
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => setDashboardState({ isOpen: true, taskId: task.id, taskName: task.name })}
                                                    disabled={task.status !== 'DONE'}
                                                    className="icon-btn primary"
                                                    title="仪表盘"
                                                >
                                                    📊
                                                </button>
                                                <button
                                                    onClick={() => setPeopleState({ isOpen: true, taskId: task.id, taskName: task.name })}
                                                    disabled={task.status !== 'DONE'}
                                                    className="icon-btn primary"
                                                    title="人员名录"
                                                >
                                                    👥
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        const url = `/?view=analyzer&taskId=${task.id}&taskName=${encodeURIComponent(task.name)}`;
                                                        window.open(url, '_blank');
                                                    }}
                                                    disabled={task.status !== 'DONE' && task.status !== 'PROCESSING'}
                                                    className="icon-btn primary"
                                                    title={task.status === 'PROCESSING' ? '查看详情' : '分析详情'}
                                                >
                                                    🔍
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(task.id, task.name)}
                                                    disabled={deleting === task.id}
                                                    className="icon-btn danger"
                                                    title="删除任务"
                                                >
                                                    {deleting === task.id ? (
                                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                        </svg>
                                                    ) : '🗑️'}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {/* Pagination Controls */}
                    {tasks.length > 0 && (
                        <div className="px-6 py-4 flex items-center justify-between border-t border-gray-100">
                            <div className="text-sm text-gray-500">
                                显示 {Math.min((currentPage - 1) * pageSize + 1, tasks.length)} 到 {Math.min(currentPage * pageSize, tasks.length)} 条，共 {tasks.length} 条
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50 transition-colors"
                                >
                                    上一页
                                </button>
                                {Array.from({ length: Math.ceil(tasks.length / pageSize) }, (_, i) => i + 1).map(page => (
                                    <button
                                        key={page}
                                        onClick={() => setCurrentPage(page)}
                                        className={`px-3 py-1 border rounded transition-colors ${currentPage === page
                                            ? 'bg-indigo-600 text-white border-indigo-600'
                                            : 'hover:bg-gray-50'
                                            }`}
                                    >
                                        {page}
                                    </button>
                                ))}
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(Math.ceil(tasks.length / pageSize), p + 1))}
                                    disabled={currentPage >= Math.ceil(tasks.length / pageSize)}
                                    className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50 transition-colors"
                                >
                                    下一页
                                </button>
                            </div>
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

                {/* Import Wizard Modal */}
                {showImportWizard && (
                    <ImportWizard
                        onClose={() => setShowImportWizard(false)}
                        onSuccess={() => {
                            loadTasks();
                            showToast('导入任务创建成功！正在后台处理...', 'success');
                        }}
                    />
                )}

                {/* Global Settings Modal */}
                {showSettings && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 animate-scale-in">
                            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                                <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                                    ⚙️ 全局设置
                                </h3>
                                <button
                                    onClick={() => setShowSettings(false)}
                                    className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
                                >
                                    ×
                                </button>
                            </div>
                            <div className="p-6">
                                <div className="mb-4">
                                    <label className="block text-sm font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>
                                        AI 模型选择
                                    </label>
                                    <div className="space-y-3">
                                        <label className="flex items-center p-4 rounded-lg border-2 border-indigo-500 bg-indigo-50">
                                            <input
                                                type="radio"
                                                name="llm-provider"
                                                value="azure"
                                                checked={true}
                                                readOnly
                                                className="form-radio text-indigo-600 h-4 w-4"
                                            />
                                            <div className="ml-3">
                                                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Azure OpenAI</span>
                                                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>默认 AI 提供商</p>
                                            </div>
                                            <span className="ml-auto text-indigo-600">✓</span>
                                        </label>
                                    </div>
                                </div>
                                <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
                                    此设置将应用于所有 AI 分析和问答功能
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;
