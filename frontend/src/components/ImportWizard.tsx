import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface ImportWizardProps {
    onClose: () => void;
    onSuccess: () => void;
}

interface UploadResponse {
    temp_file_id: string;
    file_path: string;
    columns: string[];
    sample_rows: Record<string, any>[];
    file_info: {
        filename: string;
        size_bytes: number;
        row_count: number;
        extension: string;
    };
}

interface FieldMapping {
    sender: string;
    receiver: string;
    subject: string;
    content: string;
    timestamp: string;
}

interface FilterCondition {
    field: string;
    match_type: 'exact' | 'contains';
    value: string;
}

interface FilterConfig {
    logic: 'AND' | 'OR';
    conditions: FilterCondition[];
}

// 步骤枚举
type WizardStep = 'upload' | 'mapping' | 'filter' | 'confirm';

const ImportWizard: React.FC<ImportWizardProps> = ({ onClose, onSuccess }) => {
    // 当前步骤
    const [currentStep, setCurrentStep] = useState<WizardStep>('upload');

    // 步骤 1: 上传
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

    // 上传响应数据
    const [uploadData, setUploadData] = useState<UploadResponse | null>(null);

    // 步骤 2: 字段映射
    const [taskName, setTaskName] = useState('');
    const [mapping, setMapping] = useState<FieldMapping>({
        sender: '',
        receiver: '',
        subject: '',
        content: '',
        timestamp: ''
    });
    const [mappingErrors, setMappingErrors] = useState<string[]>([]);

    // 步骤 3: 过滤配置
    const [filterConfig, setFilterConfig] = useState<FilterConfig>({
        logic: 'OR',
        conditions: []
    });

    // 步骤 4: 确认导入
    const [importing, setImporting] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);

    // 步骤指示器
    const steps = [
        { key: 'upload', label: '上传文件', icon: '📁' },
        { key: 'mapping', label: '字段映射', icon: '🔗' },
        { key: 'filter', label: '过滤规则', icon: '🔍' },
        { key: 'confirm', label: '确认导入', icon: '✓' }
    ];

    const getCurrentStepIndex = () => steps.findIndex(s => s.key === currentStep);

    // 步骤 1: 上传文件
    const handleUpload = async () => {
        if (!selectedFile) {
            setUploadError('请选择要上传的文件');
            return;
        }

        setUploading(true);
        setUploadError(null);

        const formData = new FormData();
        formData.append('file', selectedFile);

        try {
            const response = await axios.post<UploadResponse>('/api/tasks/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            const data = response.data;
            setUploadData(data);

            // 自动设置任务名称为文件名（去除扩展名）
            setTaskName(selectedFile.name.replace(/\.[^/.]+$/, ''));

            // 智能字段匹配
            const newMapping = { ...mapping };
            const lowerColumns = data.columns.map(c => c.toLowerCase());

            // 辅助函数：查找匹配的列名（忽略大小写）
            const findColumn = (patterns: string[]) => {
                for (const pattern of patterns) {
                    const index = lowerColumns.indexOf(pattern.toLowerCase());
                    if (index !== -1) return data.columns[index];
                }
                return '';
            };

            // 规则匹配优先级：用户指定 > 英文常见 > 中文常见
            newMapping.timestamp = findColumn(['@timestamp', 'timestamp', 'date', 'time', '时间', '日期']);
            newMapping.sender = findColumn(['sender', 'from', 'source', '发件人', '发送者']);
            newMapping.receiver = findColumn(['rcpt', 'receiver', 'to', 'destination', '收件人', '接收者']);
            newMapping.subject = findColumn(['subject', 'title', 'topic', '主题', '标题']);
            newMapping.content = findColumn(['content', 'body', 'text', 'message', '正文', '内容']);

            setMapping(newMapping);

            setCurrentStep('mapping');
        } catch (error: any) {
            setUploadError(error.response?.data?.detail || '文件上传失败，请重试');
        } finally {
            setUploading(false);
        }
    };

    // 验证字段映射
    const validateMapping = (): boolean => {
        const errors: string[] = [];
        if (!taskName.trim()) errors.push('请输入任务名称');
        if (!mapping.sender) errors.push('请选择发件人字段');
        if (!mapping.receiver) errors.push('请选择收件人字段');
        if (!mapping.subject) errors.push('请选择主题字段');
        if (!mapping.content) errors.push('请选择正文字段');

        setMappingErrors(errors);
        return errors.length === 0;
    };

    // 步骤 2: 确认映射
    const handleMappingNext = () => {
        if (validateMapping()) {
            setCurrentStep('filter');
        }
    };

    // 添加过滤条件
    const addFilterCondition = () => {
        setFilterConfig(prev => ({
            ...prev,
            conditions: [...prev.conditions, { field: '', match_type: 'exact', value: '' }]
        }));
    };

    // 删除过滤条件
    const removeFilterCondition = (index: number) => {
        setFilterConfig(prev => ({
            ...prev,
            conditions: prev.conditions.filter((_, i) => i !== index)
        }));
    };

    // 更新过滤条件
    const updateFilterCondition = (index: number, updates: Partial<FilterCondition>) => {
        setFilterConfig(prev => ({
            ...prev,
            conditions: prev.conditions.map((cond, i) =>
                i === index ? { ...cond, ...updates } : cond
            )
        }));
    };

    // 过滤预览统计
    const [filteredCount, setFilteredCount] = useState<number | null>(null);
    const [calculatingCount, setCalculatingCount] = useState(false);

    // 步骤 3: 确认过滤规则
    const handleFilterNext = async () => {
        if (!uploadData) return;

        // 如果有过滤条件，先计算预览结果
        const validConditions = filterConfig.conditions.filter(c => c.field && c.value);

        if (validConditions.length > 0) {
            setCalculatingCount(true);
            try {
                const payload = {
                    temp_file_id: uploadData.temp_file_id,
                    filter: {
                        logic: filterConfig.logic,
                        conditions: validConditions
                    }
                };
                const response = await axios.post('/api/tasks/preview/count', payload);
                setFilteredCount(response.data.count);
                setCurrentStep('confirm');
            } catch (error) {
                console.error("Failed to get filtered count", error);
                // 即使失败也允许继续，只是不显示预览数
                setFilteredCount(null);
                setCurrentStep('confirm');
            } finally {
                setCalculatingCount(false);
            }
        } else {
            setFilteredCount(uploadData.file_info.row_count);
            setCurrentStep('confirm');
        }
    };

    // 步骤 4: 执行导入
    const handleImport = async () => {
        if (!uploadData) return;

        setImporting(true);
        setImportError(null);

        try {
            // 过滤掉空的条件
            const validConditions = filterConfig.conditions.filter(
                c => c.field && c.value
            );

            const payload = {
                task_name: taskName,
                temp_file_id: uploadData.temp_file_id,
                mapping: mapping,
                filter: validConditions.length > 0 ? {
                    logic: filterConfig.logic,
                    conditions: validConditions
                } : null
            };

            await axios.post('/api/tasks/import', payload);
            onSuccess();
            onClose();
        } catch (error: any) {
            setImportError(error.response?.data?.detail || '导入失败，请重试');
        } finally {
            setImporting(false);
        }
    };

    // 返回上一步
    const handleBack = () => {
        const stepOrder: WizardStep[] = ['upload', 'mapping', 'filter', 'confirm'];
        const currentIndex = stepOrder.indexOf(currentStep);
        if (currentIndex > 0) {
            setCurrentStep(stepOrder[currentIndex - 1]);
        }
    };

    // 渲染字段映射下拉框
    const renderFieldSelect = (
        label: string,
        field: keyof FieldMapping,
        required: boolean = false
    ) => (
        <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
                {label} {required && <span className="text-red-500">*</span>}
            </label>
            <select
                value={mapping[field]}
                onChange={(e) => setMapping(prev => ({ ...prev, [field]: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
                <option value="">-- 请选择 --</option>
                {uploadData?.columns.map(col => (
                    <option key={col} value={col}>{col}</option>
                ))}
            </select>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* 头部 */}
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gradient-to-r from-blue-600 to-indigo-600">
                    <h2 className="text-xl font-semibold text-white">导入数据向导</h2>
                    <button
                        onClick={onClose}
                        className="text-white hover:text-gray-200 text-2xl leading-none"
                    >
                        ×
                    </button>
                </div>

                {/* 步骤指示器 */}
                <div className="px-6 py-4 bg-gray-50 border-b">
                    <div className="flex items-center justify-between">
                        {steps.map((step, index) => (
                            <React.Fragment key={step.key}>
                                <div className="flex items-center">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${index < getCurrentStepIndex()
                                        ? 'bg-green-500 text-white'
                                        : index === getCurrentStepIndex()
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-gray-200 text-gray-500'
                                        }`}>
                                        {index < getCurrentStepIndex() ? '✓' : step.icon}
                                    </div>
                                    <span className={`ml-2 text-sm font-medium ${index <= getCurrentStepIndex() ? 'text-gray-900' : 'text-gray-400'
                                        }`}>
                                        {step.label}
                                    </span>
                                </div>
                                {index < steps.length - 1 && (
                                    <div className={`flex-1 h-1 mx-4 ${index < getCurrentStepIndex() ? 'bg-green-500' : 'bg-gray-200'
                                        }`} />
                                )}
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                {/* 内容区域 */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* 步骤 1: 上传文件 */}
                    {currentStep === 'upload' && (
                        <div className="space-y-6">
                            <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 transition-colors">
                                <input
                                    type="file"
                                    accept=".csv"
                                    onChange={(e) => {
                                        setSelectedFile(e.target.files?.[0] || null);
                                        setUploadError(null);
                                    }}
                                    className="hidden"
                                    id="file-upload"
                                />
                                <label htmlFor="file-upload" className="cursor-pointer">
                                    <div className="text-5xl mb-4">📁</div>
                                    <p className="text-lg font-medium text-gray-700">
                                        点击选择 CSV 文件
                                    </p>
                                    <p className="text-sm text-gray-500 mt-2">
                                        支持大文件（1GB+）
                                    </p>
                                </label>
                            </div>

                            {selectedFile && (
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                    <p className="font-medium text-blue-800">已选择文件:</p>
                                    <p className="text-blue-600">
                                        {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                                    </p>
                                </div>
                            )}

                            {uploadError && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                                    {uploadError}
                                </div>
                            )}
                        </div>
                    )}

                    {/* 步骤 2: 字段映射 */}
                    {currentStep === 'mapping' && uploadData && (
                        <div className="space-y-6">
                            {/* 任务名称 */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    任务名称 <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={taskName}
                                    onChange={(e) => setTaskName(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="请输入任务名称"
                                />
                            </div>

                            {/* 文件信息 */}
                            <div className="bg-gray-50 rounded-lg p-4">
                                <h3 className="font-medium text-gray-700 mb-2">文件信息</h3>
                                <div className="grid grid-cols-3 gap-4 text-sm">
                                    <div>
                                        <span className="text-gray-500">文件名:</span>
                                        <span className="ml-2 font-medium">{uploadData.file_info.filename}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">行数:</span>
                                        <span className="ml-2 font-medium">{uploadData.file_info.row_count.toLocaleString()}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">列数:</span>
                                        <span className="ml-2 font-medium">{uploadData.columns.length}</span>
                                    </div>
                                </div>
                            </div>

                            {/* 字段映射 */}
                            <div className="grid grid-cols-2 gap-4">
                                {renderFieldSelect('发件人', 'sender', true)}
                                {renderFieldSelect('收件人', 'receiver', true)}
                                {renderFieldSelect('主题', 'subject', true)}
                                {renderFieldSelect('正文内容', 'content', true)}
                                {renderFieldSelect('时间戳', 'timestamp')}
                            </div>

                            {/* 验证错误 */}
                            {mappingErrors.length > 0 && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                    <ul className="list-disc list-inside text-red-700">
                                        {mappingErrors.map((err, i) => (
                                            <li key={i}>{err}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* 数据预览 */}
                            <div>
                                <h3 className="font-medium text-gray-700 mb-2">数据预览（前 5 行）</h3>
                                <div className="overflow-x-auto border rounded-lg">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                {uploadData.columns.map(col => (
                                                    <th key={col} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                                        {col}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {uploadData.sample_rows.map((row, i) => (
                                                <tr key={i}>
                                                    {uploadData.columns.map(col => (
                                                        <td key={col} className="px-4 py-2 text-sm text-gray-700 max-w-xs truncate">
                                                            {String(row[col] ?? '')}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 步骤 3: 过滤规则 */}
                    {currentStep === 'filter' && uploadData && (
                        <div className="space-y-6">
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-blue-700">
                                <p className="font-medium">💡 过滤提示</p>
                                <p className="text-sm mt-1">
                                    设置过滤规则可以排除不需要的数据。符合规则的记录将<strong>不会被导入</strong>。
                                </p>
                            </div>

                            {/* 逻辑选择 */}
                            {filterConfig.conditions.length > 1 && (
                                <div className="flex items-center space-x-4">
                                    <span className="text-sm font-medium text-gray-700">多条件逻辑:</span>
                                    <label className="flex items-center">
                                        <input
                                            type="radio"
                                            value="OR"
                                            checked={filterConfig.logic === 'OR'}
                                            onChange={() => setFilterConfig(prev => ({ ...prev, logic: 'OR' }))}
                                            className="mr-2"
                                        />
                                        <span className="text-sm">OR (满足任一条件即排除)</span>
                                    </label>
                                    <label className="flex items-center">
                                        <input
                                            type="radio"
                                            value="AND"
                                            checked={filterConfig.logic === 'AND'}
                                            onChange={() => setFilterConfig(prev => ({ ...prev, logic: 'AND' }))}
                                            className="mr-2"
                                        />
                                        <span className="text-sm">AND (满足所有条件才排除)</span>
                                    </label>
                                </div>
                            )}

                            {/* 过滤条件列表 */}
                            <div className="space-y-4">
                                {filterConfig.conditions.map((cond, index) => (
                                    <div key={index} className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg">
                                        <span className="text-sm font-medium text-gray-500 w-8">#{index + 1}</span>

                                        {/* 字段选择 */}
                                        <select
                                            value={cond.field}
                                            onChange={(e) => updateFilterCondition(index, { field: e.target.value })}
                                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        >
                                            <option value="">选择字段</option>
                                            {uploadData.columns.map(col => (
                                                <option key={col} value={col}>{col}</option>
                                            ))}
                                        </select>

                                        {/* 匹配类型 */}
                                        <select
                                            value={cond.match_type}
                                            onChange={(e) => updateFilterCondition(index, { match_type: e.target.value as 'exact' | 'contains' })}
                                            className="w-40 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        >
                                            <option value="exact">精确匹配</option>
                                            <option value="contains">包含</option>
                                        </select>

                                        {/* 值输入 */}
                                        <input
                                            type="text"
                                            value={cond.value}
                                            onChange={(e) => updateFilterCondition(index, { value: e.target.value })}
                                            placeholder="排除值"
                                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />

                                        {/* 删除按钮 */}
                                        <button
                                            onClick={() => removeFilterCondition(index)}
                                            className="text-red-500 hover:text-red-700 text-xl"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}

                                {/* 添加条件按钮 */}
                                <button
                                    onClick={addFilterCondition}
                                    className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-500 hover:text-blue-500 transition-colors"
                                >
                                    + 添加过滤条件
                                </button>
                            </div>

                            {filterConfig.conditions.length === 0 && (
                                <div className="text-center text-gray-500 py-4">
                                    未设置过滤规则，将导入全部数据
                                </div>
                            )}
                        </div>
                    )}

                    {/* 步骤 4: 确认导入 */}
                    {currentStep === 'confirm' && uploadData && (
                        <div className="space-y-6">
                            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-700">
                                <p className="font-medium">✓ 配置完成</p>
                                <p className="text-sm mt-1">请确认以下导入配置，点击"开始导入"执行导入操作。</p>
                            </div>

                            {/* 配置摘要 */}
                            <div className="bg-white border rounded-lg divide-y">
                                {/* 任务信息 */}
                                <div className="p-4">
                                    <h4 className="text-sm font-medium text-gray-500 mb-2">任务信息</h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <span className="text-gray-700">任务名称:</span>
                                            <span className="ml-2 font-medium">{taskName}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-700">原始行数:</span>
                                            <span className="ml-2 font-medium">{uploadData.file_info.row_count.toLocaleString()}</span>
                                        </div>
                                        {filteredCount !== null && (
                                            <>
                                                <div>
                                                    <span className="text-gray-700">预计导入:</span>
                                                    <span className="ml-2 font-medium text-green-600">{filteredCount.toLocaleString()}</span>
                                                </div>
                                                <div>
                                                    <span className="text-gray-700">过滤排除:</span>
                                                    <span className="ml-2 font-medium text-red-500">
                                                        {(uploadData.file_info.row_count - filteredCount).toLocaleString()}
                                                    </span>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* 字段映射 */}
                                <div className="p-4">
                                    <h4 className="text-sm font-medium text-gray-500 mb-2">字段映射</h4>
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        <div>发件人: <span className="font-mono bg-gray-100 px-2 py-1 rounded">{mapping.sender}</span></div>
                                        <div>收件人: <span className="font-mono bg-gray-100 px-2 py-1 rounded">{mapping.receiver}</span></div>
                                        <div>主题: <span className="font-mono bg-gray-100 px-2 py-1 rounded">{mapping.subject}</span></div>
                                        <div>正文: <span className="font-mono bg-gray-100 px-2 py-1 rounded">{mapping.content}</span></div>
                                        {mapping.timestamp && (
                                            <div>时间戳: <span className="font-mono bg-gray-100 px-2 py-1 rounded">{mapping.timestamp}</span></div>
                                        )}
                                    </div>
                                </div>

                                {/* 过滤规则 */}
                                <div className="p-4">
                                    <h4 className="text-sm font-medium text-gray-500 mb-2">过滤规则</h4>
                                    {filterConfig.conditions.filter(c => c.field && c.value).length > 0 ? (
                                        <div className="space-y-2">
                                            <div className="text-sm text-gray-600">
                                                逻辑: <span className="font-medium">{filterConfig.logic === 'OR' ? '满足任一条件即排除' : '满足所有条件才排除'}</span>
                                            </div>
                                            {filterConfig.conditions.filter(c => c.field && c.value).map((cond, i) => (
                                                <div key={i} className="text-sm">
                                                    <span className="font-mono bg-red-50 text-red-700 px-2 py-1 rounded">
                                                        排除 {cond.field} {cond.match_type === 'exact' ? '=' : '包含'} "{cond.value}"
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-gray-500">无过滤规则，将导入全部数据</p>
                                    )}
                                </div>
                            </div>

                            {importError && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                                    {importError}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* 底部按钮 */}
                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-between">
                    <button
                        onClick={currentStep === 'upload' ? onClose : handleBack}
                        className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                    >
                        {currentStep === 'upload' ? '取消' : '上一步'}
                    </button>

                    <div className="flex space-x-3">
                        {currentStep === 'upload' && (
                            <button
                                onClick={handleUpload}
                                disabled={!selectedFile || uploading}
                                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                            >
                                {uploading && (
                                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                )}
                                <span>{uploading ? '上传中...' : '上传并预览'}</span>
                            </button>
                        )}

                        {currentStep === 'mapping' && (
                            <button
                                onClick={handleMappingNext}
                                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                            >
                                下一步
                            </button>
                        )}

                        {currentStep === 'filter' && (
                            <button
                                onClick={handleFilterNext}
                                disabled={calculatingCount}
                                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-400 transition-colors flex items-center space-x-2"
                            >
                                {calculatingCount && (
                                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                )}
                                <span>{calculatingCount ? '计算中...' : '下一步'}</span>
                            </button>
                        )}

                        {currentStep === 'confirm' && (
                            <button
                                onClick={handleImport}
                                disabled={importing}
                                className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                            >
                                {importing && (
                                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                )}
                                <span>{importing ? '导入中...' : '开始导入'}</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ImportWizard;
