import * as React from 'react';
import { Exchange, Response, Request } from '../../model';
import MarkdownRenderer from './markdown-renderer';

interface HistoryProps {
    exchanges: Exchange[];
    onClearHistory: () => void;
}

export const History: React.FC<HistoryProps> = ({ exchanges, onClearHistory }: HistoryProps) => {
    return (
        <div className="flex flex-col gap-4 p-4">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Session History</h2>
                <button
                    onClick={onClearHistory}
                    className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                >
                    Clear History
                </button>
            </div>
            <div className="flex flex-col gap-4">
                {exchanges.map((exchange: Exchange, index: number) => (
                    <div key={index} className="border rounded-lg p-4 bg-gray-50">
                        {exchange.type === 'request' ? (
                            <div className="flex flex-col gap-2">
                                <div className="font-medium text-blue-600">User Request:</div>
                                <div className="pl-4">{(exchange as Request).message}</div>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                <div className="font-medium text-green-600">Assistant Response:</div>
                                <div className="pl-4">
                                    {(exchange as Response).parts.map((part, partIndex) => {
                                        if (part.type === 'markdown') {
                                            return (
                                                <MarkdownRenderer
                                                    key={partIndex}
                                                    rawMarkdown={part.rawMarkdown}
                                                />
                                            );
                                        }
                                        return null;
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};