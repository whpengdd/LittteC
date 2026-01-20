import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';

interface InsightChatProps {
    taskId: string;
    taskName: string;
    onClose: () => void;
}

interface Message {
    id: number;
    role: 'user' | 'assistant';
    content: string;
    contextEmails?: Array<{
        id: number;
        sender: string;
        subject: string;
        timestamp: string;
    }>;
}

const InsightChat: React.FC<InsightChatProps> = ({ taskId, taskName, onClose }) => {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: 0,
            role: 'assistant',
            content: '你好！我是邮件分析助手。你可以问我关于这个任务中邮件的任何问题，例如：\n\n• "查询来自 xxx 的所有邮件"\n• "总结最近的邮件主题"\n• "找出与项目 X 相关的讨论"'
        }
    ]);
    const [inputValue, setInputValue] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // 自动滚动到底部
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // 自动聚焦输入框
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!inputValue.trim() || loading) return;

        const userMessage: Message = {
            id: Date.now(),
            role: 'user',
            content: inputValue.trim()
        };

        setMessages(prev => [...prev, userMessage]);
        setInputValue('');
        setLoading(true);

        try {
            const response = await axios.post('/api/chat/', {
                task_id: taskId,
                question: userMessage.content
            });

            const assistantMessage: Message = {
                id: Date.now() + 1,
                role: 'assistant',
                content: response.data.answer,
                contextEmails: response.data.context_emails?.slice(0, 3)
            };

            setMessages(prev => [...prev, assistantMessage]);
        } catch (err: any) {
            const errorMessage: Message = {
                id: Date.now() + 1,
                role: 'assistant',
                content: `抱歉，发生了错误：${err.response?.data?.detail || '请稍后重试'}`
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setLoading(false);
        }
    };

    const clearChat = () => {
        setMessages([{
            id: 0,
            role: 'assistant',
            content: '对话已清空。有什么我可以帮助你的吗？'
        }]);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl h-[85vh] flex flex-col">
                {/* Header */}
                <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
                    <div className="flex items-center">
                        <span className="text-3xl mr-3">💡</span>
                        <div>
                            <h2 className="text-xl font-bold">智能洞察</h2>
                            <p className="text-sm text-amber-100">任务：{taskName}</p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-3">
                        <button
                            onClick={onClose}
                            className="text-white hover:text-gray-200 text-3xl font-bold leading-none"
                        >
                            ×
                        </button>
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-4">
                    {messages.map((message) => (
                        <div
                            key={message.id}
                            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div
                                className={`max-w-[80%] rounded-2xl px-4 py-3 ${message.role === 'user'
                                    ? 'bg-amber-500 text-white rounded-br-md'
                                    : 'bg-white text-gray-800 shadow-sm border border-gray-200 rounded-bl-md'
                                    }`}
                            >
                                {/* Message Avatar */}
                                <div className="flex items-start space-x-2">
                                    {message.role === 'assistant' && (
                                        <span className="text-xl">🤖</span>
                                    )}
                                    <div className="flex-1">
                                        <p className="whitespace-pre-wrap text-sm leading-relaxed">
                                            {message.content}
                                        </p>

                                        {/* Context Emails */}
                                        {message.contextEmails && message.contextEmails.length > 0 && (
                                            <div className="mt-3 pt-3 border-t border-gray-200">
                                                <p className="text-xs text-gray-500 mb-2">📎 参考邮件：</p>
                                                <div className="space-y-1">
                                                    {message.contextEmails.map((email) => (
                                                        <div
                                                            key={email.id}
                                                            className="text-xs bg-gray-50 rounded px-2 py-1 text-gray-600"
                                                        >
                                                            <span className="font-medium">{email.sender}</span>
                                                            <span className="mx-1">-</span>
                                                            <span>{email.subject || '(无主题)'}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    {message.role === 'user' && (
                                        <span className="text-xl">👤</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* Loading indicator */}
                    {loading && (
                        <div className="flex justify-start">
                            <div className="bg-white rounded-2xl rounded-bl-md px-4 py-3 shadow-sm border border-gray-200">
                                <div className="flex items-center space-x-2">
                                    <span className="text-xl">🤖</span>
                                    <div className="flex space-x-1">
                                        <div className="w-2 h-2 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                        <div className="w-2 h-2 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                        <div className="w-2 h-2 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                    </div>
                                    <span className="text-sm text-gray-500">思考中...</span>
                                </div>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 border-t border-gray-200 bg-white rounded-b-xl">
                    <form onSubmit={handleSubmit} className="flex space-x-3">
                        <button
                            type="button"
                            onClick={clearChat}
                            className="px-3 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                            title="清空对话"
                        >
                            🗑️
                        </button>
                        <input
                            ref={inputRef}
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder="输入你的问题..."
                            disabled={loading}
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-gray-100"
                        />
                        <button
                            type="submit"
                            disabled={loading || !inputValue.trim()}
                            className="px-6 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <>
                                    <span>发送</span>
                                    <span>➤</span>
                                </>
                            )}
                        </button>
                    </form>
                    <p className="text-xs text-gray-400 mt-2 text-center">
                        使用全局配置的 AI 模型
                    </p>
                </div>
            </div>
        </div>
    );
};

export default InsightChat;
