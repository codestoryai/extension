import * as React from 'react';
import { History } from '../components/history';
import { HistoryManager } from '../../utilities/historyManager';
import { useNavigate } from 'react-router-dom';
import { Exchange } from '../../model';
import * as vscode from 'vscode';

export const HistoryView: React.FC = () => {
    const [exchanges, setExchanges] = React.useState<Exchange[]>([]);
    const [loading, setLoading] = React.useState(true);
    const navigate = useNavigate();

    React.useEffect(() => {
        const loadHistory = async () => {
            try {
                setLoading(true);
                const loadedHistory = await HistoryManager.loadHistory();
                setExchanges(loadedHistory);
            } catch (error) {
                void vscode.window.showErrorMessage('Failed to load history');
            } finally {
                setLoading(false);
            }
        };
        void loadHistory();
    }, []);

    const handleClearHistory = async () => {
        try {
            const confirmed = await HistoryManager.clearHistoryWithPermission();
            if (confirmed) {
                await HistoryManager.clearHistory();
                setExchanges([]);
                navigate('/task'); // Navigate back to task view after clearing
            }
        } catch (error) {
            void vscode.window.showErrorMessage('Failed to clear history');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            <History 
                exchanges={exchanges}
                onClearHistory={handleClearHistory}
            />
        </div>
    );
};