/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export const readActiveDirectoriesConfiguration = (workingDirectory: string): string[] => {
	const aideConfiguration = vscode.workspace.getConfiguration('aide');
	const directoryPaths = aideConfiguration.get('activeDirectories');
	if (directoryPaths === undefined) {
		return [workingDirectory];
	}
	if (directoryPaths === '') {
		return [workingDirectory];
	}
	if (typeof directoryPaths === 'string') {
		return directoryPaths.split(',').map((directoryPath: string) => {
			return directoryPath.trim();
		});
	}
	return [workingDirectory];
};


export const readTestSuiteRunCommand = (): string => {
	const aideConfiguration = vscode.workspace.getConfiguration('aide');
	const testSuiteRunCommand = aideConfiguration.get('testSuiteRunCommand');
	if (testSuiteRunCommand === undefined) {
		return 'NotPresent';
	}
	if (testSuiteRunCommand === '') {
		return 'NotPresent';
	}
	if (typeof testSuiteRunCommand === 'string') {
		return testSuiteRunCommand;
	}
	return 'NotPresent';
};
