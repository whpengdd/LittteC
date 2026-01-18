import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface DashboardProps {
    taskId: string;
    taskName: string;
    onClose: () => void;
}

interface StatsData {
    total_emails: number;
    date_range: {
        start: string | null;
        end: string | null;
    };
    top_senders: Array<{ sender: string; count: number }>;
    email_trend: Array<{ date: string; count: number }>;
}

const Dashboard: React.FC<DashboardProps> = ({ taskId, taskName, onClose }) => {
    const [stats, setStats] = useState<StatsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadStats();
    }, [taskId]);

    const loadStats = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await axios.get(`/api/stats/${taskId}`);
            setStats(response.data);
        } catch (err: any) {
            setError(err.response?.data?.detail || '加载统计数据失败');
            console.error('Failed to load stats:', err);
        } finally {
            setLoading(false);
        }
    };

    // 计算时间跨度（天数）
    const getDateSpan = () => {
        if (!stats?.date_range.start || !stats?.date_range.end) return '-';
        const start = new Date(stats.date_range.start);
        const end = new Date(stats.date_range.end);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return `${diffDays} 天`;
    };

    // 获取趋势图的最大值（用于归一化）
    const getMaxTrend = () => {
        if (!stats?.email_trend.length) return 1;
        return Math.max(...stats.email_trend.map(t => t.count));
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-auto">
                {/* Header */}
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-4 rounded-t-xl flex justify-between items-center sticky top-0">
                    <div>
                        <h2 className="text-2xl font-bold">📊 数据仪表盘</h2>
                        <p className="text-sm text-indigo-100 mt-1">任务：{taskName}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-white hover:text-gray-200 text-3xl font-bold leading-none"
                    >
                        ×
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent"></div>
                        </div>
                    ) : error ? (
                        <div className="text-center py-16">
                            <p className="text-red-500 text-lg">{error}</p>
                            <button
                                onClick={loadStats}
                                className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                            >
                                重试
                            </button>
                        </div>
                    ) : stats && (
                        <>
                            {/* 核心指标卡片 */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                                {/* 邮件总数 */}
                                <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl p-6 shadow-lg">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-blue-100 text-sm">邮件总数</p>
                                            <p className="text-4xl font-bold mt-2">{stats.total_emails.toLocaleString()}</p>
                                        </div>
                                        <div className="text-5xl opacity-50">📧</div>
                                    </div>
                                </div>

                                {/* 时间跨度 */}
                                <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl p-6 shadow-lg">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-green-100 text-sm">时间跨度</p>
                                            <p className="text-4xl font-bold mt-2">{getDateSpan()}</p>
                                            <p className="text-green-100 text-xs mt-1">
                                                {stats.date_range.start?.split('T')[0] || '-'} ~ {stats.date_range.end?.split('T')[0] || '-'}
                                            </p>
                                        </div>
                                        <div className="text-5xl opacity-50">📅</div>
                                    </div>
                                </div>

                                {/* 活跃发件人 */}
                                <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-xl p-6 shadow-lg">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-purple-100 text-sm">联系人数量</p>
                                            <p className="text-4xl font-bold mt-2">{stats.top_senders.length}</p>
                                        </div>
                                        <div className="text-5xl opacity-50">👥</div>
                                    </div>
                                </div>
                            </div>

                            {/* 邮件趋势 */}
                            {stats.email_trend.length > 0 && (
                                <div className="bg-gray-50 rounded-xl p-6 mb-8">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4">📈 邮件趋势</h3>
                                    <div className="flex items-end space-x-1 h-40 overflow-x-auto pb-2">
                                        {stats.email_trend.map((item, idx) => (
                                            <div key={idx} className="flex flex-col items-center min-w-[30px]">
                                                <div
                                                    className="w-6 bg-gradient-to-t from-indigo-500 to-indigo-400 rounded-t transition-all hover:from-indigo-600 hover:to-indigo-500"
                                                    style={{
                                                        height: `${(item.count / getMaxTrend()) * 120}px`,
                                                        minHeight: '4px'
                                                    }}
                                                    title={`${item.date}: ${item.count} 封`}
                                                ></div>
                                                <span className="text-xs text-gray-400 mt-1 transform -rotate-45 origin-top-left whitespace-nowrap">
                                                    {item.date?.slice(5) || ''}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Top 发件人 */}
                            <div className="bg-gray-50 rounded-xl p-6">
                                <h3 className="text-lg font-semibold text-gray-800 mb-4">🏆 Top 发件人</h3>
                                <div className="space-y-3">
                                    {stats.top_senders.slice(0, 10).map((sender, idx) => (
                                        <div key={sender.sender} className="flex items-center">
                                            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${idx === 0 ? 'bg-yellow-500' :
                                                    idx === 1 ? 'bg-gray-400' :
                                                        idx === 2 ? 'bg-amber-600' :
                                                            'bg-gray-300'
                                                }`}>
                                                {idx + 1}
                                            </span>
                                            <div className="ml-3 flex-1">
                                                <p className="text-sm font-medium text-gray-800 truncate">
                                                    {sender.sender}
                                                </p>
                                            </div>
                                            <div className="flex items-center">
                                                <div
                                                    className="h-2 bg-indigo-500 rounded"
                                                    style={{
                                                        width: `${(sender.count / stats.top_senders[0].count) * 100}px`
                                                    }}
                                                ></div>
                                                <span className="ml-2 text-sm text-gray-600 w-12 text-right">
                                                    {sender.count}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
