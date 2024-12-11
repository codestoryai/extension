/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as http from 'http';
import * as vscode from 'vscode';
import { SidecarApplyEditsRequest, LSPDiagnostics, SidecarGoToDefinitionRequest, SidecarGoToImplementationRequest, SidecarGoToReferencesRequest, SidecarOpenFileToolRequest, LSPQuickFixInvocationRequest, SidecarQuickFixRequest, SidecarSymbolSearchRequest, SidecarInlayHintsRequest, SidecarGetOutlineNodesRequest, EditedCodeStreamingRequest, SidecarRecentEditsRetrieverRequest, SidecarRecentEditsRetrieverResponse, SidecarCreateFileRequest, LSPFileDiagnostics, SidecarGetPreviousWordRangeRequest, SidecarDiagnosticsResponse, SidecarCreateNewExchangeRequest, SidecarUndoPlanStep, SidecarExecuteTerminalCommandRequest, SidecarTerminalFreshOutputRequest } from './types';
import { Position, Range } from 'vscode';
import { getDiagnosticsFromEditor, getEnrichedDiagnostics, getFileDiagnosticsFromEditor, getFullWorkspaceDiagnostics, getHoverInformation } from './diagnostics';
import { openFileEditor } from './openFile';
import { goToDefinition } from './goToDefinition';
import { SIDECAR_CLIENT } from '../../extension';
import { goToImplementation } from './goToImplementation';
import { quickFixInvocation, quickFixList } from './quickFix';
import { symbolSearch } from './symbolSearch';
import { goToReferences } from './goToReferences';
import { inlayHints } from './inlayHints';
import { getOutlineNodes } from './outlineNodes';
import { createFileResponse } from './createFile';
import { getPreviousWordAtPosition } from './previousWordCommand';
import { goToTypeDefinition } from './goToTypeDefinition';
import { getRipGrepPath } from '../utilities/ripGrep';
import { executeTerminalCommand, getTerminalOutputPending, TerminalManager } from '../terminal/TerminalManager';

// Helper function to read the request body
function readRequestBody(req: http.IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		let body = '';
		req.on('data', (chunk) => {
			body += chunk.toString();
		});
		req.on('end', () => {
			resolve(body);
		});
		req.on('error', (err) => {
			reject(err);
		});
	});
}

// Async handler function to handle incoming requests
export function handleRequest(
	provideEdit: (request: SidecarApplyEditsRequest) => Promise<{
		fs_file_path: string;
		success: boolean;
	}>,
	provideEditState: (request: EditedCodeStreamingRequest) => Promise<{
		fs_file_path: string;
		success: boolean;
	}>,
	newExchangeId: (sessionId: string) => Promise<{
		exchange_id: string | undefined;
	}>,
	recentEditsRetriever: (request: SidecarRecentEditsRetrieverRequest) => Promise<SidecarRecentEditsRetrieverResponse>,
	undoToCheckpoint: (request: SidecarUndoPlanStep) => Promise<{ success: boolean }>,
	terminalManager: TerminalManager,
) {
	return async (req: http.IncomingMessage, res: http.ServerResponse) => {
		try {
			if (req.method === 'POST' && req.url === '/file_diagnostics') {
				const body = await readRequestBody(req);
				console.log('getting file_diagnostics');
				const { fs_file_path, with_enrichment, with_hover_check, full_workspace }: LSPFileDiagnostics = JSON.parse(body);

				if (full_workspace) {
					const diagnostics = await getFullWorkspaceDiagnostics();
					const response = {
						'diagnostics': diagnostics,
					};

					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify(response));
				}

				let file_diagnostics: SidecarDiagnosticsResponse[] = [];
				if (with_hover_check === null || with_hover_check === undefined) {
					file_diagnostics = getFileDiagnosticsFromEditor(fs_file_path);
				}

				if (with_enrichment && with_hover_check !== undefined && with_hover_check !== null) {
					const startTime = performance.now();

					console.log('Starting enrichment...');
					file_diagnostics = await getEnrichedDiagnostics(fs_file_path);

					const endTime = performance.now();
					const elapsedTime = endTime - startTime;

					console.log(`Enrichment completed in ${elapsedTime.toFixed(2)} milliseconds`);
				}

				if (with_hover_check) {
					console.log('StartingHoverCheck');
					const hoverDiagnostics = await getHoverInformation(fs_file_path, with_hover_check);
					// add all the elements to the file diagnostics when we are doing
					// a hover check
					file_diagnostics.push(...hoverDiagnostics);
				}

				const response = {
					'diagnostics': file_diagnostics,
				};

				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(response));
			}
			else if (req.method === 'POST' && req.url === '/diagnostics') {
				const body = await readRequestBody(req);
				// console.log('body from post request for diagnostics');
				// console.log(body);
				// console.log('log after post for diagnostics');
				const diagnosticsBody: LSPDiagnostics = JSON.parse(body);
				const selectionRange = new Range(new Position(diagnosticsBody.range.startPosition.line, diagnosticsBody.range.startPosition.character), new Position(diagnosticsBody.range.endPosition.line, diagnosticsBody.range.endPosition.character));
				const diagnosticsFromEditor = await getDiagnosticsFromEditor(diagnosticsBody.fs_file_path, selectionRange);
				// Process the diagnostics request asynchronously
				const response = {
					'diagnostics': diagnosticsFromEditor,
				};

				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(response));
			} else if (req.method === 'POST' && req.url === '/file_open') {
				const body = await readRequestBody(req);
				// console.log('file open request');
				const openFileRequest: SidecarOpenFileToolRequest = JSON.parse(body);
				const response = await openFileEditor(openFileRequest);
				// console.log('file open respnose');
				// console.log(response);
				if (response.exists) {
					// we should only do this if there is some file content
					SIDECAR_CLIENT?.documentOpen(openFileRequest.fs_file_path, response.file_contents, response.language);
				}
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(response));
			} else if (req.method === 'POST' && req.url === '/go_to_definition') {
				// console.log('go-to-definition');
				const body = await readRequestBody(req);
				const request: SidecarGoToDefinitionRequest = JSON.parse(body);
				const response = await goToDefinition(request);
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(response));
			} else if (req.method === 'POST' && req.url === '/go_to_implementation') {
				// console.log('go-to-implementation');
				const body = await readRequestBody(req);
				const request: SidecarGoToImplementationRequest = JSON.parse(body);
				const response = await goToImplementation(request);
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(response));
			} else if (req.method === 'POST' && req.url === '/select_quick_fix') {
				// console.log('select-quick-fix');
				const body = await readRequestBody(req);
				const request: SidecarQuickFixRequest = JSON.parse(body);
				const response = await quickFixList(request);
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(response));
			} else if (req.method === 'POST' && req.url === '/invoke_quick_fix') {
				// console.log('invoke-quick-fix');
				const body = await readRequestBody(req);
				const request: LSPQuickFixInvocationRequest = JSON.parse(body);
				const response = await quickFixInvocation(request);
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(response));
			} else if (req.method === 'POST' && req.url === '/apply_edits') {
				// console.log('apply-edits');
				const body = await readRequestBody(req);
				const request: SidecarApplyEditsRequest = JSON.parse(body);
				const response = await provideEdit(request);
				console.log('applyEdits', response);
				console.log(response);
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(response));
			} else if (req.method === 'POST' && req.url === '/apply_edits_streamed') {
				const body = await readRequestBody(req);
				const request: EditedCodeStreamingRequest = JSON.parse(body);
				const response = await provideEditState(request);
				console.log('applyEditsStateful', response);
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(response));
			} else if (req.method === 'POST' && req.url === '/go_to_references') {
				// console.log('go-to-references');
				const body = await readRequestBody(req);
				const request: SidecarGoToReferencesRequest = JSON.parse(body);
				const response = await goToReferences(request);
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(response));
			} else if (req.method === 'POST' && req.url === '/symbol_search') {
				// console.log('search-for-symbol');
				const body = await readRequestBody(req);
				const request: SidecarSymbolSearchRequest = JSON.parse(body);
				const response = await symbolSearch(request);
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(response));
			} else if (req.method === 'POST' && req.url === '/inlay_hints') {
				const body = await readRequestBody(req);
				const request: SidecarInlayHintsRequest = JSON.parse(body);
				const response = await inlayHints(request);
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(response));
			} else if (req.method === 'POST' && req.url === '/get_outline_nodes') {
				console.log('get_outline_nodes');
				const body = await readRequestBody(req);
				const request: SidecarGetOutlineNodesRequest = JSON.parse(body);
				const response = await getOutlineNodes(request);
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(response));
			} else if (req.method === 'POST' && req.url === '/recent_edits') {
				console.log('recent_edits');
				const body = await readRequestBody(req);
				const request: SidecarRecentEditsRetrieverRequest = JSON.parse(body);
				const response = await recentEditsRetriever(request);
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(response));
			} else if (req.method === 'POST' && req.url === '/get_outline_nodes_content') {
				console.log('get_outline_node_content');
			} else if (req.method === 'POST' && req.url === '/create_file') {
				console.log('create_file');
				const body = await readRequestBody(req);
				const request: SidecarCreateFileRequest = JSON.parse(body);
				const response = await createFileResponse(request);
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(response));
			} else if (req.method === 'POST' && req.url === '/previous_word_at_position') {
				console.log('previous_word_at_position');
				const body = await readRequestBody(req);
				const request: SidecarGetPreviousWordRangeRequest = JSON.parse(body);
				const response = await getPreviousWordAtPosition(request);
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(response));
			} else if (req.method === 'POST' && req.url === '/go_to_type_definition') {
				console.log('go_to_type_definition');
				const body = await readRequestBody(req);
				const request: SidecarGoToDefinitionRequest = JSON.parse(body);
				const response = await goToTypeDefinition(request);
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(response));
			} else if (req.method === 'POST' && req.url === '/new_exchange') {
				const body = await readRequestBody(req);
				const request: SidecarCreateNewExchangeRequest = JSON.parse(body);
				const response = await newExchangeId(request.session_id);
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(response));
			} else if (req.method === 'POST' && req.url === '/undo_session_changes') {
				const body = await readRequestBody(req);
				const request: SidecarUndoPlanStep = JSON.parse(body);
				const response = await undoToCheckpoint(request);
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(response));
			} else if (req.method === 'POST' && req.url === '/rip_grep_path') {
				const ripGrepPath = await getRipGrepPath();
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({
					'rip_grep_path': ripGrepPath,
				}));
			} else if (req.method === 'POST' && req.url === '/execute_terminal_command') {
				const body = await readRequestBody(req);
				const request: SidecarExecuteTerminalCommandRequest = JSON.parse(body);
				const response = await executeTerminalCommand(request.command, vscode.workspace.rootPath ?? process.cwd(), terminalManager);
				console.log('response', response);
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ output: response }));
			} else if (req.method === 'POST' && req.url === '/terminal_output_new') {
				const body = await readRequestBody(req);
				const request: SidecarTerminalFreshOutputRequest = JSON.parse(body);
				const response = await getTerminalOutputPending(terminalManager, request);
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ output: response }));
			} else {
				// console.log('HC request');
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ reply: 'gg_testing' }));
			}
		} catch (err) {
			console.error(err);
			res.writeHead(500, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Internal Server Error' }));
		}
	};
}
