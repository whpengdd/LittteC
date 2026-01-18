import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface Email {
    id: number;
    task_id: string;
    sender: string;
    receiver: string;
    subject: string;
    content: string;
    timestamp: string;
}

interface PeopleCluster {
    participants: string;
    participant1: string;
    participant2: string;
    email_count: number;
    latest_activity: string | null;
    ai_insight: string | null;
}

interface SubjectCluster {
    subject: string;
    email_count: number;
    latest_activity: string | null;
    ai_insight: string | null;
}

interface AnalysisResult {
    analysis_id: string;
    email_id: number;
    analysis_type: string;
    model_provider: string;
    result: any;
}

interface EmailAnalyzerProps {
    taskId: string;
    taskName: string;
    onClose: () => void;
}

type TabType = 'raw' | 'subjects' | 'people';

const EmailAnalyzer: React.FC<EmailAnalyzerProps> = ({ taskId, taskName, onClose }) => {
    // 当前活动标签页
    const [activeTab, setActiveTab] = useState<TabType>('people');

    // Raw 视图状态
    const [emails, setEmails] = useState<Email[]>([]);
    const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
    const [loading, setLoading] = useState(false);
    const [analyzing, setAnalyzing] = useState<string | null>(null);
    const [analysisResults, setAnalysisResults] = useState<Record<string, any>>({});
    const [selectedModel, setSelectedModel] = useState<'gemini' | 'azure'>('gemini');

    // 聚类视图状态
    const [peopleClusters, setPeopleClusters] = useState<PeopleCluster[]>([]);
    const [subjectClusters, setSubjectClusters] = useState<SubjectCluster[]>([]);
    const [clusterPage, setClusterPage] = useState(1);
    const [clusterTotalPages, setClusterTotalPages] = useState(0);
    const [clusterLoading, setClusterLoading] = useState(false);
    const [analyzingCluster, setAnalyzingCluster] = useState(false);

    // 聚类详情状态
    const [selectedCluster, setSelectedCluster] = useState<PeopleCluster | SubjectCluster | null>(null);
    const [clusterEmails, setClusterEmails] = useState<Email[]>([]);
    const [showClusterDetail, setShowClusterDetail] = useState(false);
    const [loadingClusterEmails, setLoadingClusterEmails] = useState(false);

    // 加载数据
    useEffect(() => {
        if (activeTab === 'raw') {
            loadEmails();
        } else if (activeTab === 'people') {
            loadPeopleClusters();
        } else if (activeTab === 'subjects') {
            loadSubjectClusters();
        }
    }, [taskId, activeTab, clusterPage]);

    const loadEmails = async () => {
        setLoading(true);
        try {
            const response = await axios.get(`/api/tasks/${taskId}/emails`);
            const emailList = response.data.emails || [];
            setEmails(emailList);
            if (emailList.length > 0) {
                setSelectedEmail(emailList[0]);
                loadAnalysisResults(emailList[0].id);
            }
        } catch (error) {
            console.error('Failed to load emails:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadPeopleClusters = async () => {
        setClusterLoading(true);
        try {
            const response = await axios.get(`/api/clusters/people/${taskId}`, {
                params: { page: clusterPage, page_size: 20 }
            });
            setPeopleClusters(response.data.clusters || []);
            setClusterTotalPages(response.data.total_pages || 0);
        } catch (error) {
            console.error('Failed to load people clusters:', error);
        } finally {
            setClusterLoading(false);
        }
    };

    const loadSubjectClusters = async () => {
        setClusterLoading(true);
        try {
            const response = await axios.get(`/api/clusters/subjects/${taskId}`, {
                params: { page: clusterPage, page_size: 20 }
            });
            setSubjectClusters(response.data.clusters || []);
            setClusterTotalPages(response.data.total_pages || 0);
        } catch (error) {
            console.error('Failed to load subject clusters:', error);
        } finally {
            setClusterLoading(false);
        }
    };

    // 加载邮件分析结果
    const loadAnalysisResults = async (emailId: number) => {
        try {
            const response = await axios.get(`/api/analysis/results/${emailId}`);
            setAnalysisResults(response.data.results.reduce((acc: any, result: any) => {
                acc[result.analysis_type] = result;
                return acc;
            }, {}));
        } catch (error) {
            console.error('Failed to load analysis results:', error);
        }
    };

    // 执行邮件分析
    const handleAnalyze = async (analysisType: 'summarize' | 'sentiment' | 'entities') => {
        if (!selectedEmail) return;

        setAnalyzing(analysisType);
        try {
            const response = await axios.post(`/api/analysis/${analysisType}`, {
                task_id: taskId,
                email_id: selectedEmail.id,
                model: selectedModel
            });

            setAnalysisResults(prev => ({
                ...prev,
                [analysisType.replace('summarize', 'summary')]: response.data
            }));
        } catch (error: any) {
            console.error(`${analysisType} failed:`, error);
            alert(`分析失败: ${error.response?.data?.detail || '未知错误'}`);
        } finally {
            setAnalyzing(null);
        }
    };

    // 选择邮件
    const handleSelectEmail = (email: Email) => {
        setSelectedEmail(email);
        loadAnalysisResults(email.id);
    };

    // 分析当前页的聚类
    const handleAnalyzePage = async () => {
        setAnalyzingCluster(true);
        try {
            const clusterKeys = activeTab === 'people'
                ? peopleClusters.map(c => c.participants)
                : subjectClusters.map(c => c.subject);

            await axios.post('/api/clusters/analyze', {
                task_id: taskId,
                cluster_type: activeTab === 'people' ? 'people' : 'subjects',
                cluster_keys: clusterKeys,
                model: selectedModel
            });

            // 重新加载数据
            if (activeTab === 'people') {
                await loadPeopleClusters();
            } else {
                await loadSubjectClusters();
            }
        } catch (error) {
            console.error('Failed to analyze page:', error);
            alert('分析失败');
        } finally {
            setAnalyzingCluster(false);
        }
    };

    // 查看聚类详情
    const handleViewClusterDetail = async (cluster: PeopleCluster | SubjectCluster) => {
        setSelectedCluster(cluster);
        setShowClusterDetail(true);
        setLoadingClusterEmails(true);

        try {
            let response;
            if (activeTab === 'people') {
                const pc = cluster as PeopleCluster;
                response = await axios.get(`/api/clusters/people/${taskId}/emails`, {
                    params: { participant1: pc.participant1, participant2: pc.participant2, limit: 50 }
                });
            } else {
                const sc = cluster as SubjectCluster;
                response = await axios.get(`/api/clusters/subjects/${taskId}/emails`, {
                    params: { subject: sc.subject, limit: 50 }
                });
            }
            setClusterEmails(response.data.emails || []);
        } catch (error) {
            console.error('Failed to load cluster emails:', error);
            setClusterEmails([]);
        } finally {
            setLoadingClusterEmails(false);
        }
    };

    // 导出 CSV
    const handleExportCSV = async () => {
        try {
            const clusterType = activeTab === 'people' ? 'people' : 'subjects';
            window.open(`/api/clusters/export/${taskId}?cluster_type=${clusterType}`, '_blank');
        } catch (error) {
            console.error('Failed to export:', error);
        }
    };

    // 渲染标签页按钮
    const renderTabButton = (tab: TabType, label: string, icon: string) => (
        <button
            onClick={() => { setActiveTab(tab); setClusterPage(1); }}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${activeTab === tab
                ? 'bg-green-500 text-white shadow-md'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
        >
            <span>{icon}</span>
            {label}
        </button>
    );

    // 渲染 Raw 视图
    const renderRawView = () => (
        <div className="flex-1 flex overflow-hidden">
            {/* Email List */}
            <div className="w-1/3 border-r border-gray-200 overflow-y-auto bg-gray-50">
                <div className="p-4">
                    <h3 className="text-lg font-semibold text-gray-800 mb-3">
                        邮件列表 ({emails.length})
                    </h3>
                    {loading ? (
                        <div className="text-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {emails.map((email) => (
                                <div
                                    key={email.id}
                                    onClick={() => handleSelectEmail(email)}
                                    className={`p-3 rounded-lg cursor-pointer transition-all ${selectedEmail?.id === email.id
                                        ? 'bg-blue-100 border-2 border-blue-500'
                                        : 'bg-white border border-gray-200 hover:border-blue-300'
                                        }`}
                                >
                                    <div className="text-sm font-semibold text-gray-900 truncate">
                                        {email.subject || '(无主题)'}
                                    </div>
                                    <div className="text-xs text-gray-600 mt-1">
                                        发件人: {email.sender || 'Unknown'}
                                    </div>
                                    <div className="text-xs text-gray-400 mt-1">
                                        {email.timestamp ? new Date(email.timestamp).toLocaleString('zh-CN') : '-'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Email Detail & Analysis */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {selectedEmail ? (
                    <>
                        {/* Email Content */}
                        <div className="p-6 border-b border-gray-200 overflow-y-auto max-h-1/2">
                            <h3 className="text-xl font-bold text-gray-900 mb-4">
                                {selectedEmail.subject || '(无主题)'}
                            </h3>
                            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                                <div>
                                    <span className="font-semibold text-gray-700">发件人:</span>
                                    <span className="ml-2 text-gray-600">{selectedEmail.sender}</span>
                                </div>
                                <div>
                                    <span className="font-semibold text-gray-700">收件人:</span>
                                    <span className="ml-2 text-gray-600">{selectedEmail.receiver}</span>
                                </div>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-lg">
                                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                                    {selectedEmail.content || '(无内容)'}
                                </p>
                            </div>
                        </div>

                        {/* Analysis Controls & Results */}
                        <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                            {/* Model Selection */}
                            <div className="mb-4 flex items-center space-x-4">
                                <span className="text-sm font-semibold text-gray-700">AI 模型:</span>
                                <label className="flex items-center space-x-2">
                                    <input
                                        type="radio"
                                        value="gemini"
                                        checked={selectedModel === 'gemini'}
                                        onChange={() => setSelectedModel('gemini')}
                                        className="form-radio text-blue-600"
                                    />
                                    <span className="text-sm">Google Gemini</span>
                                </label>
                                <label className="flex items-center space-x-2">
                                    <input
                                        type="radio"
                                        value="azure"
                                        checked={selectedModel === 'azure'}
                                        onChange={() => setSelectedModel('azure')}
                                        className="form-radio text-blue-600"
                                    />
                                    <span className="text-sm">Azure OpenAI</span>
                                </label>
                            </div>

                            {/* Analysis Buttons */}
                            <div className="flex space-x-3 mb-6">
                                <button
                                    onClick={() => handleAnalyze('summarize')}
                                    disabled={analyzing === 'summarize'}
                                    className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors flex items-center justify-center space-x-2"
                                >
                                    {analyzing === 'summarize' && <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>}
                                    <span>📄 生成摘要</span>
                                </button>
                                <button
                                    onClick={() => handleAnalyze('sentiment')}
                                    disabled={analyzing === 'sentiment'}
                                    className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors flex items-center justify-center space-x-2"
                                >
                                    {analyzing === 'sentiment' && <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>}
                                    <span>😊 情感分析</span>
                                </button>
                                <button
                                    onClick={() => handleAnalyze('entities')}
                                    disabled={analyzing === 'entities'}
                                    className="flex-1 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:bg-gray-400 transition-colors flex items-center justify-center space-x-2"
                                >
                                    {analyzing === 'entities' && <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>}
                                    <span>🏷️ 实体提取</span>
                                </button>
                            </div>

                            {/* Analysis Results */}
                            <div className="space-y-4">
                                {analysisResults.summary && (
                                    <div className="bg-white rounded-lg p-4 shadow-sm border border-blue-200">
                                        <h4 className="font-semibold text-blue-900 mb-2 flex items-center">
                                            <span className="text-lg mr-2">📄</span>
                                            摘要 ({analysisResults.summary.model_provider})
                                        </h4>
                                        <p className="text-gray-700 mb-2">{analysisResults.summary.result.summary}</p>
                                        {analysisResults.summary.result.key_points && (
                                            <div>
                                                <p className="text-sm font-semibold text-gray-600 mt-3 mb-1">关键点:</p>
                                                <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                                                    {analysisResults.summary.result.key_points.map((point: string, idx: number) => (
                                                        <li key={idx}>{point}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {analysisResults.sentiment && (
                                    <div className="bg-white rounded-lg p-4 shadow-sm border border-green-200">
                                        <h4 className="font-semibold text-green-900 mb-2 flex items-center">
                                            <span className="text-lg mr-2">😊</span>
                                            情感分析 ({analysisResults.sentiment.model_provider})
                                        </h4>
                                        <div className="flex items-center space-x-3">
                                            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${analysisResults.sentiment.result.label === 'positive' ? 'bg-green-100 text-green-800' :
                                                analysisResults.sentiment.result.label === 'negative' ? 'bg-red-100 text-red-800' :
                                                    'bg-gray-100 text-gray-800'
                                                }`}>
                                                {analysisResults.sentiment.result.label.toUpperCase()}
                                            </span>
                                            <span className="text-sm text-gray-600">
                                                置信度: {(analysisResults.sentiment.result.score * 100).toFixed(1)}%
                                            </span>
                                        </div>
                                        {analysisResults.sentiment.result.reasoning && (
                                            <p className="text-sm text-gray-600 mt-2">
                                                {analysisResults.sentiment.result.reasoning}
                                            </p>
                                        )}
                                    </div>
                                )}

                                {analysisResults.entities && (
                                    <div className="bg-white rounded-lg p-4 shadow-sm border border-purple-200">
                                        <h4 className="font-semibold text-purple-900 mb-2 flex items-center">
                                            <span className="text-lg mr-2">🏷️</span>
                                            实体提取 ({analysisResults.entities.model_provider})
                                        </h4>
                                        <div className="flex flex-wrap gap-2">
                                            {analysisResults.entities.result.entities.map((entity: any, idx: number) => (
                                                <span
                                                    key={idx}
                                                    className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-purple-100 text-purple-800"
                                                >
                                                    <span className="font-semibold mr-1">{entity.type}:</span>
                                                    {entity.value}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-500">
                        请选择一封邮件查看详情
                    </div>
                )}
            </div>
        </div>
    );

    // 渲染聚类视图
    const renderClusterView = () => {
        const clusters = activeTab === 'people' ? peopleClusters : subjectClusters;

        return (
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* 工具栏 */}
                <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <h3 className="text-lg font-semibold text-gray-800">
                            {activeTab === 'people' ? '往来聚合列表 (Participant Clusters)' : '主题聚合列表 (Subject Clusters)'}
                        </h3>
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-gray-600">AI 模型:</span>
                            <select
                                value={selectedModel}
                                onChange={(e) => setSelectedModel(e.target.value as 'gemini' | 'azure')}
                                className="border border-gray-300 rounded px-2 py-1 text-sm"
                            >
                                <option value="gemini">Gemini</option>
                                <option value="azure">Azure</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleExportCSV}
                            className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 flex items-center gap-2 text-sm"
                        >
                            <span>⬇</span> Export CSV
                        </button>
                        <button
                            onClick={handleAnalyzePage}
                            disabled={analyzingCluster}
                            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-400 flex items-center gap-2 text-sm"
                        >
                            {analyzingCluster && <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>}
                            <span>✨</span> Analyze Page
                        </button>
                        <button
                            onClick={() => activeTab === 'people' ? loadPeopleClusters() : loadSubjectClusters()}
                            className="p-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600"
                        >
                            🔄
                        </button>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                            <span>Page {clusterPage} of {clusterTotalPages}</span>
                            <button
                                onClick={() => setClusterPage(p => Math.max(1, p - 1))}
                                disabled={clusterPage <= 1}
                                className="p-1 rounded hover:bg-gray-100 disabled:opacity-50"
                            >
                                ◀
                            </button>
                            <button
                                onClick={() => setClusterPage(p => Math.min(clusterTotalPages, p + 1))}
                                disabled={clusterPage >= clusterTotalPages}
                                className="p-1 rounded hover:bg-gray-100 disabled:opacity-50"
                            >
                                ▶
                            </button>
                        </div>
                    </div>
                </div>

                {/* 数据表格 */}
                <div className="flex-1 overflow-auto">
                    {clusterLoading ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead className="bg-gray-50 sticky top-0">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        {activeTab === 'people' ? 'PARTICIPANTS GROUP (HISTORY)' : 'SUBJECT'}
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        EMAIL COUNT
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        LATEST ACTIVITY
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        AI INSIGHT
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        ACTION
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {clusters.map((cluster, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 text-sm text-gray-900">
                                            {activeTab === 'people'
                                                ? (cluster as PeopleCluster).participants
                                                : (cluster as SubjectCluster).subject}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-600">
                                            {cluster.email_count}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-600">
                                            {cluster.latest_activity
                                                ? new Date(cluster.latest_activity).toLocaleString('zh-CN')
                                                : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-600 max-w-md truncate">
                                            {cluster.ai_insight || '-'}
                                        </td>
                                        <td className="px-6 py-4 text-sm">
                                            <button
                                                onClick={() => handleViewClusterDetail(cluster)}
                                                className="text-blue-600 hover:text-blue-800 hover:underline"
                                            >
                                                查看详情
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {clusters.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                            暂无数据
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* 聚类详情弹窗 */}
                {showClusterDetail && selectedCluster && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60">
                        <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col">
                            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                                <h4 className="text-lg font-semibold">
                                    {'participants' in selectedCluster
                                        ? `往来详情: ${selectedCluster.participants}`
                                        : `主题详情: ${(selectedCluster as SubjectCluster).subject}`}
                                </h4>
                                <button
                                    onClick={() => { setShowClusterDetail(false); setSelectedCluster(null); }}
                                    className="text-gray-500 hover:text-gray-700 text-2xl"
                                >
                                    ×
                                </button>
                            </div>
                            <div className="flex-1 overflow-auto p-4">
                                {loadingClusterEmails ? (
                                    <div className="flex justify-center py-8">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {clusterEmails.map((email) => (
                                            <div key={email.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                                                <div className="font-semibold text-gray-900">{email.subject || '(无主题)'}</div>
                                                <div className="text-sm text-gray-600 mt-1">
                                                    <span>From: {email.sender}</span>
                                                    {email.receiver && <span className="ml-4">To: {email.receiver}</span>}
                                                </div>
                                                <div className="text-xs text-gray-400 mt-1">
                                                    {email.timestamp ? new Date(email.timestamp).toLocaleString('zh-CN') : '-'}
                                                </div>
                                                <div className="text-sm text-gray-700 mt-2 line-clamp-3">
                                                    {email.content?.substring(0, 300) || '(无内容)'}
                                                    {email.content && email.content.length > 300 && '...'}
                                                </div>
                                            </div>
                                        ))}
                                        {clusterEmails.length === 0 && (
                                            <div className="text-center text-gray-500 py-8">暂无邮件数据</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 rounded-t-lg flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-bold">📧 邮件分析</h2>
                        <p className="text-sm text-blue-100 mt-1">任务：{taskName}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-white hover:text-gray-200 text-3xl font-bold leading-none"
                    >
                        ×
                    </button>
                </div>

                {/* Tab Navigation */}
                <div className="px-6 py-3 border-b border-gray-200 flex gap-3">
                    {renderTabButton('raw', '1. 记录明细视图 (Raw)', '📋')}
                    {renderTabButton('subjects', '2. 按主题聚类 (Subject)', '📑')}
                    {renderTabButton('people', '3. 按往来聚类 (People)', '👥')}
                </div>

                {/* Main Content */}
                {activeTab === 'raw' ? renderRawView() : renderClusterView()}
            </div>
        </div>
    );
};

export default EmailAnalyzer;
