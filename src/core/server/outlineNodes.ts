/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Uri, workspace, commands } from 'vscode';
import { SidecarGetOutlineNodesRequest, SidecarGetOutlineNodesResponse } from './types';

export async function getOutlineNodes(request: SidecarGetOutlineNodesRequest): Promise<SidecarGetOutlineNodesResponse> {
	const filePath = request.fs_file_path;
	const documentSymbols: any[] | undefined = await commands.executeCommand(
		'vscode.executeDocumentSymbolProvider',
		Uri.file(filePath),
	);
	const uri = Uri.file(filePath);
	const textDocument = await workspace.openTextDocument(uri);
	if (documentSymbols === undefined || documentSymbols === null || documentSymbols.length === 0) {
		return {
			file_content: textDocument.getText(),
			outline_nodes: [],
			language: textDocument.languageId,
		};
	}
	try {
		return {
			file_content: textDocument.getText(),
			outline_nodes: documentSymbols ?? [],
			language: textDocument.languageId,
		};
		// now we want to parse the document symbols and maybe map it back to outline
		// nodes here but thats too much, so we send it back to the rust side for handling
		// not worrying about it for now
	} catch (exception) {
		console.log('getOutlineNodesException');
		console.error(exception);
	}
	return {
		file_content: textDocument.getText(),
		outline_nodes: [],
		language: textDocument.languageId,
	};
}