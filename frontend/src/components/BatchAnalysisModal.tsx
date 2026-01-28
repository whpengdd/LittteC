import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface BatchAnalysisModalProps {
    taskId: string;
    onClose: () => void;
    onStarted: (jobId: string) => void;
    analysisType?: 'email' | 'people' | 'subjects'; // 新增分析类型
}

interface DefaultConfig {
    default_prompt: string;
    default_filter_keywords: string[];
    default_concurrency: number;
    default_max_retries: number;
}

const BatchAnalysisModal: React.FC<BatchAnalysisModalProps> = ({
    taskId,
    onClose,
    onStarted,
    analysisType = 'email'
}) => {
    // 步骤控制
    const [step, setStep] = useState<1 | 2 | 3>(1);

    // 配置状态
    const [prompt, setPrompt] = useState('');
    const [filterKeywords, setFilterKeywords] = useState<string[]>([]);
    const [newKeyword, setNewKeyword] = useState('');
    const [model, setModel] = useState<'azure'>('azure');
    const [concurrency, setConcurrency] = useState(5);
    const [maxRetries, setMaxRetries] = useState(3);
    const [saveSettings, setSaveSettings] = useState(false);

    // 状态
    const [loading, setLoading] = useState(false);
    const [loadingDefaults, setLoadingDefaults] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // 判断是否是聚类分析
    const isClusterAnalysis = analysisType === 'people' || analysisType === 'subjects';

    // 加载默认配置
    useEffect(() => {
        loadDefaults();
    }, [analysisType]); // 依赖 analysisType 为了重置 prompt

    const loadDefaults = async () => {
        setLoadingDefaults(true);
        try {
            const response = await axios.get<DefaultConfig>('/api/batch-analysis/defaults');

            if (isClusterAnalysis) {
                // 聚类分析使用特定的默认提示词
                setPrompt(`基于以下邮件往来，以 JSON 格式返回分析结果：
{
    "risk_level": "低/中/高",
    "summary": "100字以内的核心内容简述",
    "tags": ["标签1", "标签2", "标签3"],
    "key_findings": "如有敏感或合规相关内容，请说明；否则留空"
}

邮件内容：
{content}

请只输出 JSON，不要有任何前缀或解释。所有字段值必须使用**简体中文**。risk_level 必须是 "高"、"中"、"低" 之一。`);
                // 聚类分析通常不需要过滤关键词，或者关键词逻辑不同
                setFilterKeywords([]);
            } else {
                setPrompt(response.data.default_prompt);
                setFilterKeywords(response.data.default_filter_keywords);
            }

            setConcurrency(response.data.default_concurrency);
            setMaxRetries(response.data.default_max_retries);
        } catch (error) {
            console.error('Failed to load defaults:', error);
            // 使用硬编码的默认值作为后备
            if (isClusterAnalysis) {
                setPrompt(`基于以下邮件往来，以 JSON 格式返回分析结果... (Default)`);
            } else {
                setPrompt(`请分析以下邮件内容...`);
            }
        } finally {
            setLoadingDefaults(false);
        }
    };

    // 添加关键词
    const handleAddKeyword = () => {
        const trimmed = newKeyword.trim();
        if (trimmed && !filterKeywords.includes(trimmed)) {
            setFilterKeywords([...filterKeywords, trimmed]);
            setNewKeyword('');
        }
    };

    // 删除关键词
    const handleRemoveKeyword = (keyword: string) => {
        setFilterKeywords(filterKeywords.filter(k => k !== keyword));
    };

    // 开始分析
    const handleStart = async () => {
        setLoading(true);
        setError(null);

        try {
            // 映射 analysisType 到后端 API 期望的值
            let apiAnalysisType = 'email';
            if (analysisType === 'people') apiAnalysisType = 'people_cluster';
            if (analysisType === 'subjects') apiAnalysisType = 'subject_cluster';

            const response = await axios.post('/api/batch-analysis/start', {
                task_id: taskId,
                prompt: prompt,
                filter_keywords: filterKeywords,
                model: model,
                concurrency: concurrency,
                max_retries: maxRetries,
                analysis_type: apiAnalysisType
            });

            onStarted(response.data.job_id);
            onClose();
        } catch (error: any) {
            setError(error.response?.data?.detail || '启动分析失败');
        } finally {
            setLoading(false);
        }
    };

    // 渲染步骤指示器
    const renderStepIndicator = () => (
        <div className="flex items-center justify-center mb-6">
            {(isClusterAnalysis ? [1, 3] : [1, 2, 3]).map((s, index, arr) => (
                <React.Fragment key={s}>
                    <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${step >= s
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-200 text-gray-500'
                            }`}
                    >
                        {/* 如果只显示两步，需要调整显示的数字 */}
                        {isClusterAnalysis ? (index + 1) : s}
                    </div>
                    {index < arr.length - 1 && (
                        <div
                            className={`w-16 h-1 mx-2 ${step > s ? 'bg-purple-600' : 'bg-gray-200'
                                }`}
                        />
                    )}
                </React.Fragment>
            ))}
        </div>
    );

    // 渲染步骤 1: Prompt 配置
    const renderStep1 = () => (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                    📝 分析 Prompt ({isClusterAnalysis ? '聚类分析' : '邮件分析'})
                </label>
                <p className="text-xs text-gray-500 mb-2">
                    定义 AI 分析的任务。使用 {'{content}'} 作为{isClusterAnalysis ? '聚类上下文' : '邮件内容'}的占位符。
                </p>
                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={12}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none text-sm font-mono"
                    placeholder="输入分析 Prompt..."
                />
            </div>
        </div>
    );

    // 渲染步骤 2: 过滤配置 (聚类模式下跳过)
    const renderStep2 = () => (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                    🔍 过滤关键词
                </label>
                <p className="text-xs text-gray-500 mb-3">
                    主题中包含以下关键词的邮件将被跳过，不消耗 LLM 配额。
                </p>

                {/* 关键词标签 */}
                <div className="flex flex-wrap gap-2 mb-4 min-h-[40px] p-3 bg-gray-50 rounded-lg">
                    {filterKeywords.map((keyword, idx) => (
                        <span
                            key={idx}
                            className="inline-flex items-center px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm"
                        >
                            {keyword}
                            <button
                                onClick={() => handleRemoveKeyword(keyword)}
                                className="ml-2 text-purple-600 hover:text-purple-800 font-bold"
                            >
                                ×
                            </button>
                        </span>
                    ))}
                    {filterKeywords.length === 0 && (
                        <span className="text-gray-400 text-sm">暂无过滤关键词</span>
                    )}
                </div>

                {/* 添加新关键词 */}
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={newKeyword}
                        onChange={(e) => setNewKeyword(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddKeyword()}
                        placeholder="输入关键词后按回车添加"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                    <button
                        onClick={handleAddKeyword}
                        disabled={!newKeyword.trim()}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 transition-colors"
                    >
                        添加
                    </button>
                </div>
            </div>
        </div>
    );

    // 渲染步骤 3: 执行配置
    const renderStep3 = () => (
        <div className="space-y-5">
            {/* 模型选择 */}
            <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                    🤖 AI 模型
                </label>
                <div className="flex gap-4">
                    <label className="flex items-center cursor-pointer">
                        <input
                            type="radio"
                            name="model"
                            value="azure"
                            checked={true}
                            readOnly
                            className="mr-2"
                        />
                        <span className="text-sm">Azure OpenAI</span>
                    </label>
                </div>
            </div>

            {/* 并行度 */}
            <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                    ⚡ 并行度: {concurrency}
                </label>
                <input
                    type="range"
                    min="1"
                    max="10"
                    value={concurrency}
                    onChange={(e) => setConcurrency(parseInt(e.target.value))}
                    className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-400">
                    <span>1 (慢速稳定)</span>
                    <span>10 (快速)</span>
                </div>
            </div>

            {/* 重试次数 */}
            <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                    🔄 失败重试次数: {maxRetries}
                </label>
                <input
                    type="range"
                    min="1"
                    max="5"
                    value={maxRetries}
                    onChange={(e) => setMaxRetries(parseInt(e.target.value))}
                    className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-400">
                    <span>1 次</span>
                    <span>5 次</span>
                </div>
            </div>

            {/* 保存设置 */}
            <div className="flex items-center">
                <input
                    type="checkbox"
                    id="saveSettings"
                    checked={saveSettings}
                    onChange={(e) => setSaveSettings(e.target.checked)}
                    className="mr-2"
                />
                <label htmlFor="saveSettings" className="text-sm text-gray-600">
                    保存这些设置为默认值
                </label>
            </div>

            {/* 配置摘要 */}
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">📋 配置摘要</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                    <li>• 任务类型: {isClusterAnalysis ? '聚类分析' : '单邮件批量分析'}</li>
                    <li>• 模型: Azure OpenAI</li>
                    <li>• 并行度: {concurrency} 个并发请求</li>
                    <li>• 重试次数: {maxRetries} 次</li>
                    {!isClusterAnalysis && <li>• 过滤关键词: {filterKeywords.length} 个</li>}
                </ul>
            </div>

            {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    {error}
                </div>
            )}
        </div>
    );

    if (loadingDefaults) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">加载配置中...</p>
                </div>
            </div>
        );
    }

    // 处理下一步点击逻辑，自动跳过 step 2 如果是 cluster mode
    const handleNext = () => {
        if (step === 1 && isClusterAnalysis) {
            setStep(3);
        } else if (step < 3) {
            setStep((step + 1) as 1 | 2 | 3);
        }
    };

    // 处理上一步点击逻辑
    const handlePrev = () => {
        if (step === 3 && isClusterAnalysis) {
            setStep(1);
        } else if (step > 1) {
            setStep((step - 1) as 1 | 2 | 3);
        } else {
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">🚀 批量分析配置</h2>
                        <p className="text-sm text-gray-500 mt-1">
                            {step === 1 && '步骤 1/3: 配置分析 Prompt'}
                            {step === 2 && '步骤 2/3: 设置过滤关键词'}
                            {step === 3 && '步骤 3/3: 执行参数设置'}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
                    >
                        ×
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {renderStepIndicator()}

                    {step === 1 && renderStep1()}
                    {step === 2 && !isClusterAnalysis && renderStep2()}
                    {step === 3 && renderStep3()}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 flex justify-between">
                    <button
                        onClick={handlePrev}
                        className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                    >
                        {step === 1 ? '取消' : '← 上一步'}
                    </button>

                    {step < 3 ? (
                        <button
                            onClick={handleNext}
                            className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                        >
                            下一步 →
                        </button>
                    ) : (
                        <button
                            onClick={handleStart}
                            disabled={loading}
                            className="px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-400 transition-all flex items-center gap-2"
                        >
                            {loading && (
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                            )}
                            🚀 开始分析
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BatchAnalysisModal;
