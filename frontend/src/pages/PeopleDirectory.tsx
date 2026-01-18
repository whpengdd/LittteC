import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface PeopleDirectoryProps {
    taskId: string;
    taskName: string;
    onClose: () => void;
}

interface Person {
    sender: string;
    email_count: number;
    last_contact: string | null;
}

interface Email {
    id: number;
    task_id: string;
    sender: string;
    receiver: string;
    subject: string;
    content: string;
    timestamp: string;
}

const PeopleDirectory: React.FC<PeopleDirectoryProps> = ({ taskId, taskName, onClose }) => {
    const [people, setPeople] = useState<Person[]>([]);
    const [filteredPeople, setFilteredPeople] = useState<Person[]>([]);
    const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
    const [emails, setEmails] = useState<Email[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingEmails, setLoadingEmails] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        loadPeople();
    }, [taskId]);

    useEffect(() => {
        // 过滤联系人
        if (searchTerm.trim()) {
            setFilteredPeople(
                people.filter(p =>
                    p.sender.toLowerCase().includes(searchTerm.toLowerCase())
                )
            );
        } else {
            setFilteredPeople(people);
        }
    }, [searchTerm, people]);

    const loadPeople = async () => {
        setLoading(true);
        try {
            const response = await axios.get(`/api/people/${taskId}`);
            const peopleData = response.data.people || [];
            setPeople(peopleData);
            setFilteredPeople(peopleData);

            // 自动选择第一个联系人
            if (peopleData.length > 0) {
                handleSelectPerson(peopleData[0]);
            }
        } catch (err) {
            console.error('Failed to load people:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectPerson = async (person: Person) => {
        setSelectedPerson(person);
        setLoadingEmails(true);
        try {
            const response = await axios.get(`/api/people/${taskId}/emails`, {
                params: { sender: person.sender }
            });
            setEmails(response.data.emails || []);
        } catch (err) {
            console.error('Failed to load emails:', err);
            setEmails([]);
        } finally {
            setLoadingEmails(false);
        }
    };

    // 提取邮箱名称（@前的部分）
    const getDisplayName = (email: string) => {
        const name = email.split('@')[0];
        return name.charAt(0).toUpperCase() + name.slice(1);
    };

    // 生成头像颜色
    const getAvatarColor = (email: string) => {
        const colors = [
            'bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500',
            'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500'
        ];
        const index = email.charCodeAt(0) % colors.length;
        return colors[index];
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
                {/* Header */}
                <div className="bg-gradient-to-r from-teal-600 to-cyan-600 text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-bold">👥 人员名录</h2>
                        <p className="text-sm text-teal-100 mt-1">任务：{taskName} | 共 {people.length} 位联系人</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-white hover:text-gray-200 text-3xl font-bold leading-none"
                    >
                        ×
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Left: People List */}
                    <div className="w-1/3 border-r border-gray-200 flex flex-col bg-gray-50">
                        {/* Search */}
                        <div className="p-4 border-b border-gray-200">
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="搜索联系人..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                                />
                                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                                    🔍
                                </span>
                            </div>
                        </div>

                        {/* People List */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {loading ? (
                                <div className="flex items-center justify-center py-8">
                                    <div className="animate-spin rounded-full h-8 w-8 border-4 border-teal-600 border-t-transparent"></div>
                                </div>
                            ) : filteredPeople.length === 0 ? (
                                <p className="text-center text-gray-500 py-8">
                                    {searchTerm ? '未找到匹配的联系人' : '暂无联系人'}
                                </p>
                            ) : (
                                filteredPeople.map((person) => (
                                    <div
                                        key={person.sender}
                                        onClick={() => handleSelectPerson(person)}
                                        className={`flex items-center p-3 rounded-lg cursor-pointer transition-all ${selectedPerson?.sender === person.sender
                                                ? 'bg-teal-100 border-2 border-teal-500'
                                                : 'bg-white border border-gray-200 hover:border-teal-300 hover:shadow-sm'
                                            }`}
                                    >
                                        {/* Avatar */}
                                        <div className={`w-10 h-10 rounded-full ${getAvatarColor(person.sender)} flex items-center justify-center text-white font-bold`}>
                                            {person.sender.charAt(0).toUpperCase()}
                                        </div>

                                        {/* Info */}
                                        <div className="ml-3 flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-gray-800 truncate">
                                                {getDisplayName(person.sender)}
                                            </p>
                                            <p className="text-xs text-gray-500 truncate">
                                                {person.sender}
                                            </p>
                                        </div>

                                        {/* Count Badge */}
                                        <div className="bg-teal-500 text-white text-xs px-2 py-1 rounded-full font-medium">
                                            {person.email_count}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Right: Email List */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {selectedPerson ? (
                            <>
                                {/* Person Header */}
                                <div className="p-6 border-b border-gray-200 bg-white">
                                    <div className="flex items-center">
                                        <div className={`w-16 h-16 rounded-full ${getAvatarColor(selectedPerson.sender)} flex items-center justify-center text-white text-2xl font-bold`}>
                                            {selectedPerson.sender.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="ml-4">
                                            <h3 className="text-xl font-bold text-gray-800">
                                                {getDisplayName(selectedPerson.sender)}
                                            </h3>
                                            <p className="text-sm text-gray-500">{selectedPerson.sender}</p>
                                            <div className="flex items-center space-x-4 mt-2 text-sm text-gray-600">
                                                <span>📧 {selectedPerson.email_count} 封邮件</span>
                                                {selectedPerson.last_contact && (
                                                    <span>🕐 最后联系: {new Date(selectedPerson.last_contact).toLocaleDateString('zh-CN')}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Email List */}
                                <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
                                    <h4 className="text-sm font-semibold text-gray-700 mb-3">邮件往来记录</h4>
                                    {loadingEmails ? (
                                        <div className="flex items-center justify-center py-8">
                                            <div className="animate-spin rounded-full h-8 w-8 border-4 border-teal-600 border-t-transparent"></div>
                                        </div>
                                    ) : emails.length === 0 ? (
                                        <p className="text-center text-gray-500 py-8">暂无邮件记录</p>
                                    ) : (
                                        <div className="space-y-3">
                                            {emails.map((email) => (
                                                <div
                                                    key={email.id}
                                                    className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
                                                >
                                                    <div className="flex justify-between items-start mb-2">
                                                        <h5 className="font-medium text-gray-800">
                                                            {email.subject || '(无主题)'}
                                                        </h5>
                                                        <span className="text-xs text-gray-400 whitespace-nowrap ml-2">
                                                            {email.timestamp ? new Date(email.timestamp).toLocaleString('zh-CN') : '-'}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-gray-500 mb-2">
                                                        收件人: {email.receiver}
                                                    </p>
                                                    <p className="text-sm text-gray-600 line-clamp-3">
                                                        {email.content || '(无内容)'}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-500">
                                <div className="text-center">
                                    <span className="text-6xl">👤</span>
                                    <p className="mt-4">请选择一位联系人查看详情</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PeopleDirectory;
