/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * We are going to implement the Quick actions fix class here and invoke the cs-chat
 * to fix things here
 */

import * as vscode from 'vscode';

export class AideQuickFix implements vscode.CodeActionProvider {
	provideCodeActions(
		_document: vscode.TextDocument,
		_range: vscode.Range | vscode.Selection,
		context: vscode.CodeActionContext,
		_token: vscode.CancellationToken,
	): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
		const codeActions: (vscode.CodeAction | vscode.Command)[] = [];
		if (!vscode.window.activeTextEditor) {
			return codeActions;
		}

		const severeDiagnostics = AideQuickFix.getSevereDiagnostics(context.diagnostics);
		if (severeDiagnostics.length === 0) {
			return codeActions;
		}

		const diagnosticRange = severeDiagnostics.map((diagnostic) => diagnostic.range).reduce((prev, current) => prev.union(current));
		const selection = new vscode.Selection(diagnosticRange.start, diagnosticRange.end);
		const diagnosticsAsText = AideQuickFix.getDiagnosticsAsText(severeDiagnostics);

		const fixCodeAction = new vscode.CodeAction('Fix using Aide', vscode.CodeActionKind.QuickFix);
		fixCodeAction.diagnostics = severeDiagnostics;
		fixCodeAction.command = {
			title: '$(sparkle) ' + fixCodeAction.title,
			command: 'vscode.editorChat.start',
			arguments: [
				{
					autoSend: true,
					message: `/fix ${diagnosticsAsText}`,
					position: diagnosticRange.start,
					initialSelection: selection,
					initialRange: diagnosticRange,
				},
			],
			tooltip: '$(sparkle) ',
		};
		codeActions.push(fixCodeAction);

		return codeActions;
	}

	private static getSevereDiagnostics(diagnostics: readonly vscode.Diagnostic[]): vscode.Diagnostic[] {
		return diagnostics.filter((diagnostic) => diagnostic.severity <= vscode.DiagnosticSeverity.Warning);
	}

	private static getDiagnosticsAsText(diagnostics: vscode.Diagnostic[]): string {
		return diagnostics.map((diagnostic) => diagnostic.message).join(', ');
	}
}
