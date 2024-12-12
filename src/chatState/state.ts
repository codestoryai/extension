/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AideAgentMode, AideAgentPromptReference } from '../types';

export type RoleString = 'system' | 'user' | 'assistant' | undefined;
export type RoleStringForOpenai = 'system' | 'user' | 'assistant' | 'function';

export const chatSystemPrompt = (agentCustomInstruction: string | null): string => {
    if (agentCustomInstruction) {
        return `
Your name is CodeStory bot. You are a brilliant and meticulous engineer assigned to help the user with any query they have. When you write code, the code works on the first try and is formatted perfectly. You can be asked to explain the code, in which case you should use the context you know to help the user out. You have the utmost care for the code that you write, so you do not make mistakes. Take into account the current repository\'s language, frameworks, and dependencies. You must always use markdown when referring to code symbols.
You are given some additional context about the codebase and instructions by the user below, follow them to better help the user
${agentCustomInstruction}
        `;
    } else {
        return 'Your name is CodeStory bot. You are a brilliant and meticulous engineer assigned to help the user with any query they have. When you write code, the code works on the first try and is formatted perfectly. You can be asked to explain the code, in which case you should use the context you know to help the user out. You have the utmost care for the code that you write, so you do not make mistakes. Take into account the current repository\'s language, frameworks, and dependencies. You must always use markdown when referring to code symbols.';
    }
};

export const convertRoleToString = (role: RoleStringForOpenai): RoleString => {
    switch (role) {
        case 'system':
            return 'system';
        case 'user':
            return 'user';
        case 'assistant':
            return 'assistant';
        default:
            return undefined;
    }
};

export interface ConversationMessage {
    role: RoleString;
    content: string;
    timestamp: number;
    exchangeId: string;
    mode: AideAgentMode;
    references?: readonly AideAgentPromptReference[];
}

export class ChatStateManager {
    private _history: ConversationMessage[] = [];
    private _currentExchange: string | null = null;
    private _currentMode: AideAgentMode = AideAgentMode.Chat;

    constructor() {}

    addMessage(message: ConversationMessage) {
        this._history.push(message);
    }

    startExchange(exchangeId: string, mode: AideAgentMode = AideAgentMode.Chat) {
        this._currentExchange = exchangeId;
        this._currentMode = mode;
    }

    getCurrentExchange(): string | null {
        return this._currentExchange;
    }

    getCurrentMode(): AideAgentMode {
        return this._currentMode;
    }

    getExchangeHistory(exchangeId: string): ConversationMessage[] {
        return this._history.filter(msg => msg.exchangeId === exchangeId);
    }

    getCurrentContext(): ConversationMessage[] {
        return this._history;
    }

    getRecentContext(limit: number = 10): ConversationMessage[] {
        return this._history.slice(-limit);
    }

    clearExchange(exchangeId: string) {
        this._history = this._history.filter(msg => msg.exchangeId !== exchangeId);
        if (this._currentExchange === exchangeId) {
            this._currentExchange = null;
        }
    }

    clear() {
        this._history = [];
        this._currentExchange = null;
        this._currentMode = AideAgentMode.Chat;
    }
}
