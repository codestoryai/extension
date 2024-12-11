/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export const readCustomSystemInstruction = (): string | null => {
	const aideConfiguration = vscode.workspace.getConfiguration('aide');
	const systemInstruction = aideConfiguration.get('systemInstruction');
	if (systemInstruction === undefined) {
		return null;
	}
	if (systemInstruction === '') {
		return null;
	}
	if (typeof systemInstruction === 'string') {
		return systemInstruction;
	}
	return null;
};
