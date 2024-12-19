import * as vscode from 'vscode';
import { Exchange } from '../../model';

export class HistoryManager {
    private static readonly HISTORY_KEY = 'codestory.history';

    static async saveHistory(exchanges: Exchange[]): Promise<void> {
        try {
            await vscode.commands.executeCommand('codestory.saveHistory', exchanges);
        } catch (error) {
            console.error('Failed to save history:', error);
        }
    }

    static async loadHistory(): Promise<Exchange[]> {
        try {
            const history = await vscode.commands.executeCommand<Exchange[]>('codestory.loadHistory');
            return history || [];
        } catch (error) {
            console.error('Failed to load history:', error);
            return [];
        }
    }

    static async clearHistory(): Promise<void> {
        try {
            await vscode.commands.executeCommand('codestory.clearHistory');
        } catch (error) {
            console.error('Failed to clear history:', error);
        }
    }

    static async clearHistoryWithPermission(): Promise<boolean> {
        try {
            const result = await vscode.window.showWarningMessage(
                'Are you sure you want to clear the history?',
                { modal: true },
                'Yes',
                'No'
            );
            return result === 'Yes';
        } catch (error) {
            console.error('Failed to show confirmation dialog:', error);
            return false;
        }
    }
}