import React, { useState, useEffect } from 'react';
import axios from 'axios';
import BatchAnalysisModal from './BatchAnalysisModal';
import BatchAnalysisProgress from './BatchAnalysisProgress';

interface Email {
    id: number;
    task_id: string;
    sender: string;
    receiver: string;
    subject: string;
    content: string;
    timestamp: string;
    batch_analysis_result?: {
        risk_level: string;
        summary: string;
        tags: string[];
    };
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
    isStandalone?: boolean;
}

type TabType = 'raw' | 'subjects' | 'people';

const EmailAnalyzer: React.FC<EmailAnalyzerProps> = ({ taskId, taskName, onClose, isStandalone = false }) => {
    // 当前活动标签页
    const [activeTab, setActiveTab] = useState<TabType>('people');

    // Raw 视图状态
    const [emails, setEmails] = useState<Email[]>([]);
    const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
    const [loading, setLoading] = useState(false);
    const [analyzing, setAnalyzing] = useState<string | null>(null);
    const [analysisResults, setAnalysisResults] = useState<Record<string, any>>({});

    // 聚类视图状态
    const [peopleClusters, setPeopleClusters] = useState<PeopleCluster[]>([]);
    const [subjectClusters, setSubjectClusters] = useState<SubjectCluster[]>([]);
    const [clusterPage, setClusterPage] = useState(1);
    const [clusterTotalPages, setClusterTotalPages] = useState(0);
    const [clusterLoading, setClusterLoading] = useState(false);
    const [analyzingCluster, setAnalyzingCluster] = useState(false);
    const [analyzingSpecificCluster, setAnalyzingSpecificCluster] = useState<string | null>(null);

    // 聚类详情状态
    const [selectedCluster, setSelectedCluster] = useState<PeopleCluster | SubjectCluster | null>(null);
    const [clusterEmails, setClusterEmails] = useState<Email[]>([]);
    const [showClusterDetail, setShowClusterDetail] = useState(false);
    const [loadingClusterEmails, setLoadingClusterEmails] = useState(false);

    // 批量分析状态
    const [showBatchAnalysisModal, setShowBatchAnalysisModal] = useState(false);
    const [currentBatchJobId, setCurrentBatchJobId] = useState<string | null>(null);
    const [analyzingSingle, setAnalyzingSingle] = useState<number | null>(null);
    const [batchJobHistory, setBatchJobHistory] = useState<any[]>([]);
    const [showJobHistory, setShowJobHistory] = useState(false);
    // 聚类分析状态追踪：cluster_key -> 'pending' | 'analyzing' | 'completed' | 'failed'
    const [clusterAnalysisStatus, setClusterAnalysisStatus] = useState<Record<string, 'pending' | 'analyzing' | 'completed' | 'failed'>>({});

    // 获取任务历史
    const fetchJobHistory = async () => {
        try {
            const response = await axios.get(`/api/batch-analysis/jobs/${taskId}`);
            const jobs = response.data.jobs || [];
            setBatchJobHistory(jobs);

            // 查找正在运行或待处理的任务，如果当前没有监控的任务，尝试恢复
            if (!currentBatchJobId) {
                const runningJob = jobs.find((job: any) =>
                    job.status === 'RUNNING' || job.status === 'PENDING'
                );
                if (runningJob) {
                    console.log('[EmailAnalyzer] 恢复正在运行的任务:', runningJob.id);
                    setCurrentBatchJobId(runningJob.id);
                }
            }
        } catch (error) {
            console.error('Failed to fetch job history:', error);
        }
    };

    // 恢复任务
    const handleResumeJob = async (oldJobId: string) => {
        try {
            const response = await axios.post(`/api/batch-analysis/${oldJobId}/resume`);
            const newJobId = response.data.job_id;

            // 更新当前监控的任务 ID
            setCurrentBatchJobId(newJobId);

            // 关闭历史弹窗（如果在）
            setShowJobHistory(false);

            // 刷新任务历史
            fetchJobHistory();

            alert('任务已恢复执行，已跳过已完成的部分');
        } catch (error: any) {
            console.error('Failed to resume job:', error);
            alert(`恢复任务失败: ${error.response?.data?.detail || '未知错误'}`);
        }
    };

    // 组件加载时获取一次
    useEffect(() => {
        fetchJobHistory();
    }, [taskId]);

    // 当任务历史弹窗打开时，或者有正在运行的任务时，定期刷新历史列表
    useEffect(() => {
        if (!showJobHistory && !currentBatchJobId) return;

        fetchJobHistory();
        const interval = setInterval(fetchJobHistory, 5000);
        return () => clearInterval(interval);
    }, [showJobHistory, currentBatchJobId, taskId]);

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
                email_id: selectedEmail.id
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

    // 移除 handleAnalyzePage 功能


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

    // 单条邮件 AI 分析
    const handleSingleAnalysis = async (email: Email) => {
        setAnalyzingSingle(email.id);
        try {
            await axios.post('/api/batch-analysis/single', {
                task_id: taskId,
                email_id: email.id
            });
            // 刷新分析结果
            loadAnalysisResults(email.id);
        } catch (error: any) {
            console.error('Single analysis failed:', error);
            alert(`分析失败: ${error.response?.data?.detail || '未知错误'}`);
        } finally {
            setAnalyzingSingle(null);
        }
    };

    // 单条聚类 AI 分析
    const handleAnalyzeSingleCluster = async (cluster: PeopleCluster | SubjectCluster) => {
        const clusterKey = 'participants' in cluster ? (cluster as PeopleCluster).participants : (cluster as SubjectCluster).subject;

        setAnalyzingSpecificCluster(clusterKey);
        try {
            const response = await axios.post('/api/clusters/analyze', {
                task_id: taskId,
                cluster_type: activeTab === 'people' ? 'people' : 'subjects',
                cluster_keys: [clusterKey]
            });

            // 局部更新状态，避免全量刷新导致的闪烁
            if (response.data.results && response.data.results.length > 0) {
                const result = response.data.results[0];
                if (result.success) {
                    if (activeTab === 'people') {
                        setPeopleClusters(prev => prev.map(c =>
                            c.participants === clusterKey ? { ...c, ai_insight: result.ai_insight } : c
                        ));
                    } else {
                        setSubjectClusters(prev => prev.map(c =>
                            c.subject === clusterKey ? { ...c, ai_insight: result.ai_insight } : c
                        ));
                    }
                }
            }
        } catch (error: any) {
            console.error('Cluster analysis failed:', error);
            alert(`分析失败: ${error.response?.data?.detail || '未知错误'}`);
        } finally {
            setAnalyzingSpecificCluster(null);
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
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="text-sm font-semibold text-gray-900 truncate flex-1">
                                            {email.subject || '(无主题)'}
                                        </div>
                                        {email.batch_analysis_result?.risk_level && (
                                            <span className={`flex-shrink-0 px-1.5 py-0.5 text-[10px] rounded border ${['高', 'High'].includes(email.batch_analysis_result.risk_level) ? 'bg-red-50 text-red-600 border-red-200' :
                                                ['中', 'Medium'].includes(email.batch_analysis_result.risk_level) ? 'bg-yellow-50 text-yellow-600 border-yellow-200' :
                                                    'bg-green-50 text-green-600 border-green-200'
                                                }`}>
                                                {email.batch_analysis_result.risk_level === 'High' ? '高' :
                                                    email.batch_analysis_result.risk_level === 'Medium' ? '中' :
                                                        email.batch_analysis_result.risk_level === 'Low' ? '低' :
                                                            email.batch_analysis_result.risk_level}
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-xs text-gray-600 mt-1">
                                        发件人: {email.sender || '未知'}
                                    </div>

                                    {/* Summary Snippet */}
                                    {email.batch_analysis_result?.summary && (
                                        <div className="mt-1.5 text-xs text-gray-500 line-clamp-2 leading-relaxed">
                                            {email.batch_analysis_result.summary}
                                        </div>
                                    )}

                                    {/* Tags */}
                                    {email.batch_analysis_result?.tags && email.batch_analysis_result.tags.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1">
                                            {email.batch_analysis_result.tags.slice(0, 3).map((tag, idx) => (
                                                <span key={idx} className="px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-600 rounded border border-gray-200">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    <div className="text-xs text-gray-400 mt-1.5 flex justify-end">
                                        {email.timestamp ? new Date(email.timestamp).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
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

                        {/* Analysis Buttons & Results */}
                        <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
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
                                {/* 批量分析结果（含标签） */}
                                {analysisResults.batch_summary && (
                                    <div className="bg-white rounded-lg p-4 shadow-sm border border-orange-200">
                                        <h4 className="font-semibold text-orange-900 mb-2 flex items-center justify-between">
                                            <div className="flex items-center">
                                                <span className="text-lg mr-2">🔍</span>
                                                概要 & 分析 ({analysisResults.batch_summary.model_provider})
                                            </div>
                                            {analysisResults.batch_summary.result.risk_level && (
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${analysisResults.batch_summary.result.risk_level === '高' ? 'bg-red-100 text-red-800' :
                                                    analysisResults.batch_summary.result.risk_level === '中' ? 'bg-yellow-100 text-yellow-800' :
                                                        'bg-green-100 text-green-800'
                                                    }`}>
                                                    风险: {analysisResults.batch_summary.result.risk_level}
                                                </span>
                                            )}
                                        </h4>

                                        {/* 摘要 */}
                                        <p className="text-gray-700 mb-3">{analysisResults.batch_summary.result.summary}</p>

                                        {/* 标签 */}
                                        {analysisResults.batch_summary.result.tags && analysisResults.batch_summary.result.tags.length > 0 && (
                                            <div className="mb-3">
                                                <div className="flex flex-wrap gap-2">
                                                    {analysisResults.batch_summary.result.tags.map((tag: string, idx: number) => (
                                                        <span
                                                            key={idx}
                                                            className="inline-block px-3 py-1 rounded-full text-sm font-medium bg-orange-50 text-orange-700 border border-orange-200"
                                                        >
                                                            {tag}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* 关键发现 */}
                                        {analysisResults.batch_summary.result.key_findings && (
                                            <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                                                <span className="font-semibold">关键发现: </span>
                                                {analysisResults.batch_summary.result.key_findings}
                                            </div>
                                        )}
                                    </div>
                                )}

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
        </div >
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
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setShowBatchAnalysisModal(true)}
                            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 flex items-center gap-2 text-sm font-medium"
                        >
                            <span>🚀</span> 开始全部分析
                        </button>
                        <button
                            onClick={() => setShowJobHistory(true)}
                            className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 flex items-center gap-2 text-sm"
                            title="查看分析任务历史"
                        >
                            <span>📊</span> 分析任务 {batchJobHistory.length > 0 && `(${batchJobHistory.length})`}
                        </button>
                        <button
                            onClick={handleExportCSV}
                            className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 flex items-center gap-2 text-sm"
                        >
                            <span>⬇</span> 导出 CSV
                        </button>
                        <button
                            onClick={() => activeTab === 'people' ? loadPeopleClusters() : loadSubjectClusters()}
                            className="p-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600"
                        >
                            🔄
                        </button>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                            <span>第 {clusterPage} 页 / 共 {clusterTotalPages} 页</span>
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
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--primary-indigo)' }}></div>
                        </div>
                    ) : (
                        <table className="w-full table-fixed">
                            <thead style={{ background: '#F8FAFC' }} className="sticky top-0">
                                <tr>
                                    <th className={`px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider ${activeTab === 'people' ? 'w-[280px]' : 'w-[400px]'}`} style={{ color: 'var(--text-secondary)' }}>
                                        {activeTab === 'people' ? '发起人' : '主题'}
                                    </th>
                                    {activeTab === 'people' && (
                                        <th className="px-2 py-3 text-center text-xs font-semibold uppercase w-[40px]" style={{ color: 'var(--text-secondary)' }}></th>
                                    )}
                                    {activeTab === 'people' && (
                                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider w-[280px]" style={{ color: 'var(--text-secondary)' }}>
                                            接收人
                                        </th>
                                    )}
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider min-w-[400px]" style={{ color: 'var(--text-secondary)' }}>
                                        概要 & 分析
                                    </th>
                                    <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider w-[100px]" style={{ color: 'var(--text-secondary)' }}>
                                        状态
                                    </th>
                                    <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider w-[120px]" style={{ color: 'var(--text-secondary)' }}>
                                        操作
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {clusters.map((cluster, idx) => {
                                    const isPeopleCluster = activeTab === 'people';
                                    const pc = cluster as PeopleCluster;
                                    const sc = cluster as SubjectCluster;

                                    // 提取发件人和收件人信息
                                    const sender = isPeopleCluster ? pc.participant1 : '';
                                    const receiver = isPeopleCluster ? pc.participant2 : '';
                                    const senderInitial = sender ? sender.charAt(0).toUpperCase() : '?';
                                    const receiverInitial = receiver ? receiver.charAt(0).toUpperCase() : '?';
                                    const senderName = sender ? (sender.split('@')[0] || '未知') : '未知';
                                    const receiverName = receiver ? (receiver.split('@')[0] || '未知') : '未知';

                                    return (
                                        <tr key={idx} className="hover:bg-gray-50 transition-colors" style={{ borderBottom: '1px solid var(--border-light)' }}>
                                            {/* 发起人列 */}
                                            <td className="px-6 py-4">
                                                {isPeopleCluster ? (
                                                    <div className="participant-cell">
                                                        <div className="avatar sender">{senderInitial}</div>
                                                        <div className="participant-info">
                                                            <span className="participant-name">{senderName}</span>
                                                            <span className="participant-email">{sender}</span>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="link-primary font-medium">{sc.subject}</span>
                                                )}
                                            </td>

                                            {/* 箭头指示 */}
                                            {isPeopleCluster && (
                                                <td className="px-2 py-4 text-center">
                                                    <span className="arrow-indicator">→</span>
                                                </td>
                                            )}

                                            {/* 接收人列 */}
                                            {isPeopleCluster && (
                                                <td className="px-6 py-4">
                                                    <div className="participant-cell">
                                                        <div className="avatar receiver">{receiverInitial}</div>
                                                        <div className="participant-info">
                                                            <span className="participant-name">{receiverName}</span>
                                                            <span className="participant-email">{receiver}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                            )}

                                            {/* 概要 & AI 分析 - 仿参考图片样式 */}
                                            <td className="px-6 py-4">
                                                <div className="max-w-md">
                                                    {(() => {
                                                        const clusterKey = isPeopleCluster ? pc.participants : sc.subject;
                                                        const analysisStatus = clusterAnalysisStatus[clusterKey];

                                                        // 优先显示分析状态
                                                        if (analysisStatus === 'analyzing') {
                                                            return (
                                                                <div className="flex items-center gap-2 text-sm text-purple-600">
                                                                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-purple-600 border-t-transparent"></div>
                                                                    <span>分析中...</span>
                                                                </div>
                                                            );
                                                        }

                                                        if (analysisStatus === 'pending') {
                                                            return <span className="text-xs text-gray-400">等待分析...</span>;
                                                        }

                                                        if (analysisStatus === 'failed') {
                                                            return <span className="text-xs text-red-500">分析失败</span>;
                                                        }

                                                        // 然后检查是否有AI洞察结果
                                                        if (cluster.ai_insight) {
                                                            return (() => {
                                                                // 尝试解析 JSON 格式的 ai_insight
                                                                try {
                                                                    const insight = typeof cluster.ai_insight === 'string'
                                                                        ? JSON.parse(cluster.ai_insight)
                                                                        : cluster.ai_insight;

                                                                    const displayedTags = insight.tags?.slice(0, 3) || [];
                                                                    const remainingCount = (insight.tags?.length || 0) - 3;

                                                                    return (
                                                                        <div className="space-y-2">
                                                                            {/* Header: Risk + Tags (Simplified View) */}
                                                                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                                                                {/* Risk Badge */}
                                                                                {insight.risk_level && (
                                                                                    <span className={`flex-shrink-0 px-2 py-0.5 rounded text-xs font-bold border ${['高', 'High'].includes(insight.risk_level) ? 'bg-red-50 text-red-600 border-red-200' :
                                                                                        ['中', 'Medium'].includes(insight.risk_level) ? 'bg-yellow-50 text-yellow-600 border-yellow-200' :
                                                                                            'bg-green-50 text-green-600 border-green-200'
                                                                                        }`}>
                                                                                        {insight.risk_level === 'High' ? '高' :
                                                                                            insight.risk_level === 'Medium' ? '中' :
                                                                                                insight.risk_level === 'Low' ? '低' :
                                                                                                    insight.risk_level}
                                                                                    </span>
                                                                                )}

                                                                                {/* Tags */}
                                                                                {displayedTags.length > 0 && (
                                                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                                                        {displayedTags.map((tag: string, tagIdx: number) => (
                                                                                            <span
                                                                                                key={tagIdx}
                                                                                                className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200"
                                                                                            >
                                                                                                {tag}
                                                                                            </span>
                                                                                        ))}
                                                                                        {remainingCount > 0 && (
                                                                                            <span className="text-xs text-gray-400">
                                                                                                +{remainingCount}
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                )}
                                                                            </div>

                                                                            {/* Key Findings (Highlighted) */}
                                                                            {insight.key_findings && insight.key_findings.trim() && (
                                                                                <div className="text-xs text-orange-700 bg-orange-50 px-2 py-1.5 rounded border border-orange-100 mb-1">
                                                                                    <span className="font-bold mr-1">⚡ 关键发现:</span>
                                                                                    {insight.key_findings}
                                                                                </div>
                                                                            )}

                                                                            {/* Summary Body */}
                                                                            <p className="text-sm text-gray-700 leading-relaxed line-clamp-3" title={insight.summary}>
                                                                                {insight.summary}
                                                                            </p>
                                                                        </div>
                                                                    );
                                                                } catch {
                                                                    // JSON 解析失败，显示原始文本
                                                                    return (
                                                                        <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                                                                            {cluster.ai_insight.length > 80
                                                                                ? cluster.ai_insight.substring(0, 80) + '...'
                                                                                : cluster.ai_insight}
                                                                        </p>
                                                                    );
                                                                }
                                                            })();
                                                        }

                                                        // 默认未分析状态
                                                        return <span className="text-xs" style={{ color: 'var(--text-muted)' }}>未分析</span>;
                                                    })()}
                                                </div>
                                            </td>

                                            {/* 状态 */}
                                            <td className="px-6 py-4 text-center">
                                                <span className="badge info">{cluster.email_count}封</span>
                                            </td>

                                            {/* 操作 */}
                                            <td className="px-6 py-4">
                                                <div className="flex justify-center gap-1">
                                                    <button
                                                        onClick={() => handleViewClusterDetail(cluster)}
                                                        className="icon-btn primary"
                                                        title="查看详情"
                                                    >
                                                        👁️
                                                    </button>
                                                    <button
                                                        onClick={() => handleAnalyzeSingleCluster(cluster)}
                                                        disabled={analyzingSpecificCluster === (isPeopleCluster ? pc.participants : sc.subject)}
                                                        className="icon-btn primary disabled:opacity-50"
                                                        title="分析"
                                                    >
                                                        {analyzingSpecificCluster === (isPeopleCluster ? pc.participants : sc.subject)
                                                            ? <div className="animate-spin rounded-full h-3 w-3 border-2 border-indigo-600 border-t-transparent"></div>
                                                            : '⚡'}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {clusters.length === 0 && (
                                    <tr>
                                        <td colSpan={activeTab === 'people' ? 6 : 4} className="px-6 py-16 text-center">
                                            <div className="text-4xl mb-3">📭</div>
                                            <p style={{ color: 'var(--text-secondary)' }}>暂无数据</p>
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
                                                <div className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">
                                                    {email.content || '(无内容)'}
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

    const wrapperClass = isStandalone
        ? "h-screen w-screen flex flex-col bg-white"
        : "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4";

    const containerClass = isStandalone
        ? "flex-1 flex flex-col h-full"
        : "bg-white rounded-lg shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col";

    return (
        <div className={wrapperClass}>
            <div className={containerClass}>
                {/* Header */}
                <div className={`${!isStandalone ? 'rounded-t-lg' : ''} bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 flex justify-between items-center`}>
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

                {/* 批量分析进度显示 */}
                {currentBatchJobId && (
                    <div className="absolute bottom-4 right-4 w-96 z-40">
                        <BatchAnalysisProgress
                            jobId={currentBatchJobId}
                            taskId={taskId}
                            onComplete={() => {
                                // 分析完成后刷新数据
                                if (activeTab === 'people') loadPeopleClusters();
                                else if (activeTab === 'subjects') loadSubjectClusters();
                                else if (activeTab === 'raw') loadEmails();

                                // 清除当前任务ID，使进度组件卸载，避免重复触发
                                setTimeout(() => setCurrentBatchJobId(null), 3000); // 3秒后自动关闭进度显示
                            }}
                            onCancel={() => setCurrentBatchJobId(null)}
                            onProgress={async (processed, success) => {
                                // 使用局部更新而非全量刷新
                                // 每处理 3 封邮件或全部完成时，获取最新分析结果并局部更新
                                if (processed % 3 === 0 || processed === success) {
                                    try {
                                        // 从数据库获取最新分析的结果
                                        const clusterType = activeTab === 'people' ? 'people' : 'subjects';
                                        const response = await axios.get(`/api/clusters/${clusterType}/${taskId}`, {
                                            params: { page: clusterPage, page_size: 20 }
                                        });

                                        const updatedClusters = response.data.clusters || [];

                                        // 局部更新：只更新有ai_insight的聚类
                                        if (activeTab === 'people') {
                                            setPeopleClusters(prev => {
                                                const updated = [...prev];
                                                updatedClusters.forEach((newCluster: PeopleCluster) => {
                                                    if (newCluster.ai_insight) {
                                                        const idx = updated.findIndex(c => c.participants === newCluster.participants);
                                                        if (idx !== -1) {
                                                            updated[idx] = { ...updated[idx], ai_insight: newCluster.ai_insight };
                                                            // 更新状态为已完成
                                                            setClusterAnalysisStatus(prevStatus => ({
                                                                ...prevStatus,
                                                                [newCluster.participants]: 'completed'
                                                            }));
                                                        }
                                                    }
                                                });
                                                return updated;
                                            });
                                        } else if (activeTab === 'subjects') {
                                            setSubjectClusters(prev => {
                                                const updated = [...prev];
                                                updatedClusters.forEach((newCluster: SubjectCluster) => {
                                                    if (newCluster.ai_insight) {
                                                        const idx = updated.findIndex(c => c.subject === newCluster.subject);
                                                        if (idx !== -1) {
                                                            updated[idx] = { ...updated[idx], ai_insight: newCluster.ai_insight };
                                                            // 更新状态为已完成
                                                            setClusterAnalysisStatus(prevStatus => ({
                                                                ...prevStatus,
                                                                [newCluster.subject]: 'completed'
                                                            }));
                                                        }
                                                    }
                                                });
                                                return updated;
                                            });
                                        }
                                    } catch (error) {
                                        console.error('Failed to fetch updated clusters:', error);
                                    }
                                }
                            }}
                            onResume={handleResumeJob}
                        />
                    </div>
                )}

                {/* 批量分析配置弹窗 */}
                {showBatchAnalysisModal && (
                    <BatchAnalysisModal
                        taskId={taskId}
                        onClose={() => setShowBatchAnalysisModal(false)}
                        onStarted={(jobId) => {
                            setCurrentBatchJobId(jobId);
                            // 如果是聚类分析，可能需要刷新聚类列表 (虽然进度条组件会轮询)
                            setShowBatchAnalysisModal(false);
                        }}
                        analysisType={
                            activeTab === 'people' ? 'people' :
                                activeTab === 'subjects' ? 'subjects' :
                                    'email'
                        }
                    />
                )}

                {/* 任务历史弹窗 */}
                {showJobHistory && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60">
                        <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[70vh] flex flex-col">
                            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                                <h4 className="text-lg font-semibold">📊 分析任务历史</h4>
                                <button
                                    onClick={() => setShowJobHistory(false)}
                                    className="text-gray-500 hover:text-gray-700 text-2xl"
                                >
                                    ×
                                </button>
                            </div>
                            <div className="flex-1 overflow-auto p-4">
                                {batchJobHistory.length === 0 ? (
                                    <div className="text-center text-gray-500 py-8">暂无分析任务历史</div>
                                ) : (
                                    <div className="space-y-3">
                                        {batchJobHistory.map((job: any) => (
                                            <div key={job.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${job.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                                                                job.status === 'RUNNING' ? 'bg-blue-100 text-blue-800' :
                                                                    job.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                                                                        job.status === 'INTERRUPTED' ? 'bg-orange-100 text-orange-800' :
                                                                            job.status === 'CANCELLED' ? 'bg-gray-100 text-gray-800' :
                                                                                'bg-yellow-100 text-yellow-800'
                                                                }`}>
                                                                {job.status === 'COMPLETED' ? '已完成' :
                                                                    job.status === 'RUNNING' ? '运行中' :
                                                                        job.status === 'FAILED' ? '失败' :
                                                                            job.status === 'INTERRUPTED' ? '已中断' :
                                                                                job.status === 'CANCELLED' ? '已取消' : '待处理'}
                                                            </span>
                                                            <span className="text-sm text-gray-600">
                                                                {job.model_provider.toUpperCase()}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-gray-500 mt-1">
                                                            创建于: {new Date(job.created_at).toLocaleString('zh-CN')}
                                                        </div>
                                                        <div className="text-sm text-gray-700 mt-2">
                                                            进度: {job.processed_count}/{job.total_count}
                                                            <span className="text-green-600 ml-2">成功 {job.success_count}</span>
                                                            {job.failed_count > 0 && <span className="text-red-600 ml-2">失败 {job.failed_count}</span>}
                                                            {job.skipped_count > 0 && <span className="text-yellow-600 ml-2">跳过 {job.skipped_count}</span>}
                                                        </div>
                                                        {job.error_message && (
                                                            <div className="text-xs text-red-600 mt-1">{job.error_message}</div>
                                                        )}
                                                    </div>
                                                    <div className="flex gap-2">
                                                        {(job.status === 'RUNNING' || job.status === 'PENDING') && (
                                                            <button
                                                                onClick={() => {
                                                                    setCurrentBatchJobId(job.id);
                                                                    setShowJobHistory(false);
                                                                }}
                                                                className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                                                            >
                                                                查看进度
                                                            </button>
                                                        )}
                                                        {(job.status === 'FAILED' || job.status === 'CANCELLED' || job.status === 'INTERRUPTED') && (
                                                            <button
                                                                onClick={() => handleResumeJob(job.id)}
                                                                className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600"
                                                            >
                                                                继续执行
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EmailAnalyzer;
