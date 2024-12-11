/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as http from 'http';
import * as net from 'net';
import * as vscode from 'vscode';

import { AnswerSplitOnNewLineAccumulatorStreaming, StreamProcessor } from '../../chatState/convertStreamToMessage';
import { applyEdits, applyEditsDirectly, } from '../../server/applyEdits';
import { RecentEditsRetriever } from '../../server/editedFiles';
import { handleRequest } from '../../server/requestHandler';
import { EditedCodeStreamingRequest, SideCarAgentEvent, SidecarApplyEditsRequest, SidecarUndoPlanStep } from '../../server/types';
import { RepoRef } from '../../sidecar/client';
import { getUniqueId } from '../../utilities/uniqueId';
import { ProjectContext } from '../../utilities/workspaceContext';
import postHogClient from '../../posthog/client';
import { AideAgentMode, AideAgentPromptReference, AideAgentRequest, AideAgentResponseStream, AideAgentScope, AideSessionExchangeUserAction, AideSessionParticipant } from '../../../types';
import { SIDECAR_CLIENT } from '../../../extension';
import { PanelProvider } from '../../../PanelProvider';
import { TerminalManager } from '../../terminal/TerminalManager';
import assert from 'assert';
import { createFileIfNotExists } from '../../server/createFile';
import { CancellationTokenSource } from 'vscode';
import { AnthropicModels, ProviderType } from '../../../model';
import { MockModelSelection } from '../../utilities/modelSelection';
/**
 * Stores the necessary identifiers required for identifying a response stream
 */
interface ResponseStreamIdentifier {
	sessionId: string;
	exchangeId: string;
}

/*
class AideResponseStreamCollection {
	private responseStreamCollection: Map<string, AideAgentEventSenderResponse> = new Map();

	constructor(private extensionContext: vscode.ExtensionContext, private aideAgentSessionProvider: AideAgentSessionProvider) {
		this.extensionContext = extensionContext;
	}

	getKey(responseStreamIdentifier: ResponseStreamIdentifier): string {
		return `${responseStreamIdentifier.sessionId}-${responseStreamIdentifier.exchangeId}`;
	}

	addResponseStream(responseStreamIdentifier: ResponseStreamIdentifier, responseStream: AideAgentEventSenderResponse) {
		this.extensionContext.subscriptions.push(responseStream.token.onCancellationRequested(() => {
			console.log('responseStream::token_cancelled');
			// over here we get the stream of events from the cancellation
			// we need to send it over on the stream as usual so we can work on it
			// we can send empty access token here since we are not making llm calls
			// on the sidecar... pretty sure I will forget and scream at myself later on
			// for having herd knowledged like this
			const responseStreamAnswer = SIDECAR_CLIENT!.cancelRunningEvent(responseStreamIdentifier.sessionId, responseStreamIdentifier.exchangeId, this.aideAgentSessionProvider.editorUrl!, '');
			this.aideAgentSessionProvider.reportAgentEventsToChat(true, responseStreamAnswer);
		}));
		this.responseStreamCollection.set(this.getKey(responseStreamIdentifier), responseStream);
	}

	getResponseStream(responseStreamIdentifier: ResponseStreamIdentifier): AideAgentEventSenderResponse | undefined {
		return this.responseStreamCollection.get(this.getKey(responseStreamIdentifier));
	}

	removeResponseStream(responseStreamIdentifer: ResponseStreamIdentifier) {
		this.responseStreamCollection.delete(this.getKey(responseStreamIdentifer));
	}
}*/

class RequestsCanellationTokenSourceCollection {
	private ctsCollection: Map<string, CancellationTokenSource> = new Map();

	constructor(private extensionContext: vscode.ExtensionContext, private aideAgentSessionProvider: AideAgentSessionProvider) {
		this.extensionContext = extensionContext;
	}

	getKey(responseStreamIdentifier: ResponseStreamIdentifier): string {
		return `${responseStreamIdentifier.sessionId}-${responseStreamIdentifier.exchangeId}`;
	}

	addCancellationToken(responseStreamIdentifier: ResponseStreamIdentifier, cts: CancellationTokenSource, modelSelection: {
		model: string;
		provider: {
			name: ProviderType;
			apiBase?: string;
			apiKey: string;
		};
	}) {
		this.extensionContext.subscriptions.push(cts.token.onCancellationRequested(() => {

			// over here we get the stream of events from the cancellation
			// we need to send it over on the stream as usual so we can work on it
			// we can send empty access token here since we are not making llm calls
			// on the sidecar... pretty sure I will forget and scream at myself later on
			// for having herd knowledged like this

			const { model, provider } = modelSelection;

			const modelSelectionForCancellation: vscode.ModelSelection = {
				slowModel: model,
				fastModel: model,
				models: {
					[model]: {
						name: MockModelSelection.models[model].name,
						contextLength: MockModelSelection.models[model].contextLength,
						temperature: MockModelSelection.models[model].temperature,
						provider: {
							type: provider.name,
						},
					},
				},
				providers: {
					[provider.name]: {
						name: provider.name,
						apiBase: provider.apiBase,
						apiKey: provider.apiKey,
					},
				},
			};

			console.log('responseStream::token_cancelled', responseStreamIdentifier, modelSelectionForCancellation);

			const responseStreamAnswer = SIDECAR_CLIENT!.cancelRunningEvent(responseStreamIdentifier.sessionId, responseStreamIdentifier.exchangeId, this.aideAgentSessionProvider.editorUrl!, '', modelSelectionForCancellation);
			this.aideAgentSessionProvider.reportAgentEventsToChat(true, responseStreamAnswer);
		}));
		this.ctsCollection.set(this.getKey(responseStreamIdentifier), cts);
	}

	getToken(responseStreamIdentifier: ResponseStreamIdentifier) {
		return this.ctsCollection.get(this.getKey(responseStreamIdentifier));
	}

	removeToken(responseStreamIdentifer: ResponseStreamIdentifier) {
		this.ctsCollection.delete(this.getKey(responseStreamIdentifer));
	}

	removeAllTokenForSession(sessionId: string) {
		for (const [key, value] of this.ctsCollection.entries()) {
			if (key.startsWith(`${sessionId}-`)) {
				// Optionally dispose of the CancellationTokenSource if needed
				value.dispose(); // Assuming CancellationTokenSource has a dispose method
				this.ctsCollection.delete(key);
			}
		}
	}
}


export class AideAgentSessionProvider implements AideSessionParticipant {

	editorUrl: string | undefined;
	private iterationEdits = new vscode.WorkspaceEdit();
	private requestHandler: http.Server | null = null;
	private editsMap = new Map();
	private eventQueue: AideAgentRequest[] = [];
	private openResponseStream: AideAgentResponseStream | undefined;
	private processingEvents: Map<string, boolean> = new Map();
	// private responseStreamCollection: AideResponseStreamCollection;
	private requestCancellationTokensCollection: RequestsCanellationTokenSourceCollection;
	private _pendingExchanges: Map<string, string[]> = new Map();
	private panelProvider: PanelProvider;
	// private sessionId: string | undefined;
	// this is a hack to test the theory that we can keep snapshots and make
	// that work
	private editCounter = 0;

	private async isPortOpen(port: number): Promise<boolean> {
		return new Promise((resolve, _) => {
			const s = net.createServer();
			s.once('error', (err) => {
				s.close();
				// @ts-ignore
				if (err['code'] === 'EADDRINUSE') {
					resolve(false);
				} else {
					resolve(false); // or throw error!!
					// reject(err);
				}
			});
			s.once('listening', () => {
				resolve(true);
				s.close();
			});
			s.listen(port);
		});
	}

	private async getNextOpenPort(startFrom: number = 42427) {
		let openPort: number | null = null;
		while (startFrom < 65535 || !!openPort) {
			if (await this.isPortOpen(startFrom)) {
				openPort = startFrom;
				break;
			}
			startFrom++;
		}
		return openPort;
	}

	constructor(
		private currentRepoRef: RepoRef,
		private projectContext: ProjectContext,
		recentEditsRetriever: RecentEditsRetriever,
		extensionContext: vscode.ExtensionContext,
		panelProvider: PanelProvider,
		terminalManager: TerminalManager,
	) {
		this.requestCancellationTokensCollection = new RequestsCanellationTokenSourceCollection(extensionContext, this);
		this.panelProvider = panelProvider;
		this.requestHandler = http.createServer(
			handleRequest(
				this.provideEdit.bind(this),
				this.provideEditStreamed.bind(this),
				this.newExchangeIdForSession.bind(this),
				recentEditsRetriever.retrieveSidecar.bind(recentEditsRetriever),
				this.undoToCheckpoint.bind(this),
				terminalManager,
			)
		);
		this.getNextOpenPort().then((port) => {
			if (port === null) {
				throw new Error('Could not find an open port');
			}

			// can still grab it by listenting to port 0
			this.requestHandler?.listen(port);
			const editorUrl = `http://127.0.0.1:${port}`;
			console.log('editorUrl', editorUrl);
			this.editorUrl = editorUrl;
		});

		// our collection of active response streams for exchanges which are still running
		// apparantaly this also works??? crazy the world of js
		// this.responseStreamCollection = new AideResponseStreamCollection(extensionContext, this);
	}

	async undoToCheckpoint(request: SidecarUndoPlanStep): Promise<{
		success: boolean;
	}> {
		const exchangeId = request.exchange_id;
		const planStep = request.index;
		// const sessionId = request.session_id;
		// Check this @theskcd I think this is always undefined
		const responseStream = undefined; //this.responseStreamCollection.getResponseStream({sessionId, exchangeId });
		if (responseStream === undefined) {
			return {
				success: false,
			};
		}
		let label = exchangeId;
		if (planStep !== null) {
			label = `${exchangeId}::${planStep}`;
		}

		// This creates a very special code edit which is handled by the aideAgentCodeEditingService
		// where we intercept this edit and instead do a global rollback
		const edit = new vscode.WorkspaceEdit();
		edit.delete(vscode.Uri.file('/undoCheck'), new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0)), {
			label,
			needsConfirmation: false,
		});
		// responseStream.stream.codeEdit(edit);
		return {
			success: true,
		};
	}

	async newExchangeIdForSession(sessionId: string): Promise<{
		exchange_id: string | undefined;
	}> {
		const exchangeId = this.panelProvider.createNewExchangeResponse(sessionId);

		if (!this.panelProvider.runningTask) {
			throw new Error('No task running');
		}

		if (exchangeId) {
			const newExchanges = [exchangeId];
			// console.log('newExchanges', newExchanges);
			this._pendingExchanges.set(sessionId, newExchanges);
			const cts = new CancellationTokenSource();
			// here we should also unset all the previous exchanges which are going on
			// since that would lead to lot of cancellation events
			this.requestCancellationTokensCollection.removeAllTokenForSession(sessionId);

			const { preset } = this.panelProvider.runningTask;
			// only track the current one
			this.requestCancellationTokensCollection.addCancellationToken({
				sessionId,
				exchangeId,
			}, cts, {
				model: AnthropicModels.ClaudeSonnet ?? preset.model,
				provider: {
					name: preset.provider,
					apiBase: preset.customBaseUrl,
					apiKey: preset.apiKey,
				},
			});
		}
		return { exchange_id: exchangeId };
	}

	cancelAllExchangesForSession(sessionId: string): void {
		const pendingExchanges = this._pendingExchanges.get(sessionId);
		if (pendingExchanges) {
			for (const exchangeId of pendingExchanges) {
				const cts = this.requestCancellationTokensCollection.getToken({
					sessionId,
					exchangeId,
				});
				if (cts) {
					cts.cancel();
				} else {
					const key = this.requestCancellationTokensCollection.getKey({
						sessionId,
						exchangeId,
					});
					console.warn(`No cts found for exchangeId ${key}`);
				}
			}
		}

		this._pendingExchanges.delete(sessionId);
	}

	async provideEditStreamed(request: EditedCodeStreamingRequest): Promise<{
		fs_file_path: string;
		success: boolean;
	}> {
		const sessionId = request.session_id;
		const exchangeId = request.exchange_id;
		if (!this.panelProvider.doesExchangeExist(sessionId, exchangeId)) {
			console.log('exchangeDoesNotExistOnSession');
			return {
				fs_file_path: request.fs_file_path,
				success: false,
			};
		}
		// This is our uniqueEditId which we are using to tag the edits and make
		// sure that we can roll-back if required on the undo-stack
		let uniqueEditId = request.exchange_id;
		if (request.plan_step_id) {
			uniqueEditId = `${uniqueEditId}:: ${request.plan_step_id}`;
		}
		// we first check if the file exists otherwise we create it
		await createFileIfNotExists(vscode.Uri.file(request.fs_file_path));

		// now we can work on top of the file
		const textDocument = await vscode.workspace.openTextDocument(vscode.Uri.file(request.fs_file_path));
		await vscode.window.showTextDocument(textDocument, {
			preview: true,
		});
		const activeWindow = vscode.window.activeTextEditor;
		assert(activeWindow?.document.fileName === request.fs_file_path, "file paths are not correct");
		// now that we are showing it, it should also be the active text editor I suppose?
		const editStreamEvent = request;
		const fileDocument = editStreamEvent.fs_file_path;
		if ('Start' === editStreamEvent.event) {
			const document = await vscode.workspace.openTextDocument(fileDocument);
			if (document === undefined || document === null) {
				return {
					fs_file_path: '',
					success: false,
				};
			}
			const documentLines = document.getText().split(/\r\n|\r|\n/g);
			this.editsMap.set(editStreamEvent.edit_request_id, {
				answerSplitter: new AnswerSplitOnNewLineAccumulatorStreaming(),
				// Now here we want to pass a proper id as we want to make sure that
				// things work out so the edit event should send some metadata with the
				// edits so we can keep track of it and use it, but for now we go
				// with the iteration numbers on the aideagentsessionprovider itself
				streamProcessor: new StreamProcessor(
					documentLines,
					undefined,
					vscode.Uri.file(editStreamEvent.fs_file_path),
					editStreamEvent.range,
					null,
					this.iterationEdits,
					true,
					// send an id over here which is unique to this run
					// over here we want to send the plan-id or a unique reference
					// which tracks this edit in our system so we can track it as a timeline
					// for the editor
					uniqueEditId,
					activeWindow,
				),
			});
		} else if ('End' === editStreamEvent.event) {
			// drain the lines which might be still present
			const editsManager = this.editsMap.get(editStreamEvent.edit_request_id);
			while (true) {
				const currentLine = editsManager.answerSplitter.getLine();
				if (currentLine === null) {
					break;
				}
				await editsManager.streamProcessor.processLine(currentLine);
			}
			editsManager.streamProcessor.cleanup();
			// send a no-op edit to update the undo stack
			activeWindow.edit((_) => {
				// No-op edit
			}, { undoStopBefore: false, undoStopAfter: true });

			await vscode.workspace.save(vscode.Uri.file(editStreamEvent.fs_file_path)); // save files upon stream completion
			console.log('provideEditsStreamed::finished', editStreamEvent.fs_file_path);
			// delete this from our map
			this.editsMap.delete(editStreamEvent.edit_request_id);
			// incrementing the counter over here
			this.editCounter = this.editCounter + 1;
			// we have the updated code (we know this will be always present, the types are a bit meh)
		} else if (editStreamEvent.event.Delta) {
			const editsManager = this.editsMap.get(editStreamEvent.edit_request_id);
			if (editsManager !== undefined) {
				editsManager.answerSplitter.addDelta(editStreamEvent.event.Delta);
				while (true) {
					const currentLine = editsManager.answerSplitter.getLine();
					if (currentLine === null) {
						break;
					}
					await editsManager.streamProcessor.processLine(currentLine);
				}
			}
		}
		return {
			fs_file_path: '',
			success: true,
		};
	}

	async provideEdit(request: SidecarApplyEditsRequest): Promise<{
		fs_file_path: string;
		success: boolean;
	}> {
		if (request.apply_directly) {
			applyEditsDirectly(request);
			return {
				fs_file_path: request.fs_file_path,
				success: true,
			};
		}
		if (!this.openResponseStream) {
			console.log('returning early over here');
			return {
				fs_file_path: request.fs_file_path,
				success: true,
			};
		}
		const response = await applyEdits(request, this.openResponseStream, this.iterationEdits);
		return response;
	}

	newSession(sessionId: string): void {
		console.log('newSessionStarting', sessionId);
		// this.sessionId = sessionId;
	}

	async handleSessionIterationRequest(sessionId: string, exchangeId: string, iterationQuery: string, references: readonly AideAgentPromptReference[]): Promise<void> {
		// check here that we do not look at the user info over here if the llm keys are set
		const session = await vscode.csAuthentication.getSession();
		const token = session?.accessToken ?? '';
		const stream = SIDECAR_CLIENT!.agentSessionEditFeedback(iterationQuery, sessionId, exchangeId, this.editorUrl!, AideAgentMode.Edit, references, this.currentRepoRef, this.projectContext.labels, token);
		this.reportAgentEventsToChat(true, stream);
	}

	handleSessionUndo(sessionId: string, exchangeId: string): void {
		// TODO(skcd): Handle this properly that we are doing an undo over here
		SIDECAR_CLIENT!.handleSessionUndo(sessionId, exchangeId, this.editorUrl!);
		console.log('handleSessionUndo', sessionId, exchangeId);
	}

	/**
	 * TODO(codestory): We want to get this exchange feedback on each exchange
	 * either automagically or when the user invokes it
	 * Its the responsibility of the editor for now to make sure that the feedback
	 * is give, the sidecar should not close the exchange until we have this feedback
	 * this also updates the feedback on the sidecar side so we can tell the agent if its
	 * chagnes were accepted or not
	 */
	async handleExchangeUserAction(sessionId: string, exchangeId: string, stepIndex: number | undefined, action: AideSessionExchangeUserAction): Promise<void> {
		// we ping the sidecar over here telling it about the state of the edits after
		// the user has reacted to it appropriately
		const editorUrl = this.editorUrl;
		let isAccepted = false;
		if (action === AideSessionExchangeUserAction.AcceptAll) {
			isAccepted = true;
		}
		if (editorUrl) {
			// TODO(skcd): Not sure if an async stream like this works, but considering
			// js/ts this should be okay from what I remember, pending futures do not
			// get cleaned up via GC
			console.log('are we hitting this somehow');
			const session = await vscode.csAuthentication.getSession();
			const accessToken = session?.accessToken ?? '';
			const responseStream = SIDECAR_CLIENT!.userFeedbackOnExchange(sessionId, exchangeId, stepIndex, editorUrl, isAccepted, accessToken);
			this.reportAgentEventsToChat(true, responseStream);
		}
	}

	handleEvent(event: AideAgentRequest): void {
		this.eventQueue.push(event);
		const uniqueId = `${event.sessionId} - ${event.exchangeId}`;
		if (!this.processingEvents.has(uniqueId)) {
			this.processingEvents.set(uniqueId, true);
			this.processEvent(event);
		}
	}

	// consider putting posthog event here?
	private async processEvent(event: AideAgentRequest): Promise<void> {
		if (!this.editorUrl) {
			return;
		}

		const session = await vscode.csAuthentication.getSession();

		// Nullish coalescing more appropriate here
		const email = session?.account.email ?? '';

		// accessToken required for sidecar requests (through codestory provider)
		const token = session?.accessToken ?? '';

		// capture launch success metric
		postHogClient?.capture({
			distinctId: getUniqueId(),
			event: 'processEvent',
			properties: {
				platform: os.platform(),
				product: 'extension',
				email,
				query: event.prompt,
				mode: event.mode,
			},
		});
		// New flow migration
		if (event.mode === AideAgentMode.Chat || event.mode === AideAgentMode.Edit || event.mode === AideAgentMode.Plan) {
			await this.streamResponse(event, event.sessionId, this.editorUrl, token);
			return;
		}
	}

	/**
	 * A uniform reply stream over here which transparently handles any kind of request
	 * type, since on the sidecar side we are taking care of streaming the right thing
	 * depending on the agent mode
	 */
	private async streamResponse(event: AideAgentRequest, sessionId: string, editorUrl: string, workosAccessToken: string) {
		const prompt = event.prompt;
		const exchangeIdForEvent = event.exchangeId;
		const agentMode = event.mode;
		const variables = event.references;
		if (event.mode === AideAgentMode.Chat) {
			const responseStream = SIDECAR_CLIENT!.agentSessionChat(prompt, sessionId, exchangeIdForEvent, editorUrl, agentMode, variables, this.currentRepoRef, this.projectContext.labels, workosAccessToken);
			await this.reportAgentEventsToChat(true, responseStream);
		}
		// Now lets try to handle the edit event first
		// there are 2 kinds of edit events:
		// - anchored and agentic events
		// if its anchored, then we have the sscope as selection
		// if its selection scope then its agentic
		if (event.mode === AideAgentMode.Edit) {
			if (event.scope === AideAgentScope.Selection) {
				const responseStream = await SIDECAR_CLIENT!.agentSessionAnchoredEdit(prompt, sessionId, exchangeIdForEvent, editorUrl, agentMode, variables, this.currentRepoRef, this.projectContext.labels, workosAccessToken);
				await this.reportAgentEventsToChat(true, responseStream);
			} else {
				const isWholeCodebase = event.scope === AideAgentScope.Codebase;
				const responseStream = await SIDECAR_CLIENT!.agentSessionPlanStep(prompt, sessionId, exchangeIdForEvent, editorUrl, agentMode, variables, this.currentRepoRef, this.projectContext.labels, isWholeCodebase, workosAccessToken);
				await this.reportAgentEventsToChat(true, responseStream);
			}
		}

		// For plan generation we have 2 things which can happen:
		// plan gets generated incrementally or in an instant depending on people using
		// o1 or not
		// once we have a step of the plan we should stream it along with the edits of the plan
		// and keep doing that until we are done completely
		if (event.mode === AideAgentMode.Plan) {
			const responseStream = await SIDECAR_CLIENT!.agentSessionPlanStep(prompt, sessionId, exchangeIdForEvent, editorUrl, agentMode, variables, this.currentRepoRef, this.projectContext.labels, false, workosAccessToken);
			await this.reportAgentEventsToChat(true, responseStream);
		}
	}

	/**
	 * We might be streaming back chat events or something else on the exchange we are
	 * interested in, so we want to close the stream when we want to
	 */
	public async reportAgentEventsToChat(
		_editMode: boolean,
		stream: AsyncIterableIterator<SideCarAgentEvent>,
	): Promise<void> {
		// const editsMap = new Map();
		const asyncIterable = {
			[Symbol.asyncIterator]: () => stream
		};

		for await (const event of asyncIterable) {
			// now we ping the sidecar that the probing needs to stop

			console.log('agent event', event);

			if ('keep_alive' in event) {
				continue;
			}

			if ('session_id' in event && 'started' in event) {
				continue;
			}

			if ('done' in event) {
				continue;
			}
			const sessionId = event.request_id;
			const exchangeId = event.exchange_id;

			if (event.event.ChatEvent) {
				// responses to the chat
				this.panelProvider.addChatMessage(sessionId, exchangeId, event.event.ChatEvent.delta);
			}
			if (event.event.FrameworkEvent) {
				if (event.event.FrameworkEvent.ToolThinking) {
					const toolThinking = event.event.FrameworkEvent.ToolThinking;
					this.panelProvider.addToolThinking(sessionId, exchangeId, toolThinking.thinking);
				}
				if (event.event.FrameworkEvent.ToolTypeFound) {
					const toolType = event.event.FrameworkEvent.ToolTypeFound.tool_type;
					this.panelProvider.addToolTypeFound(sessionId, exchangeId, toolType);
				}
				if (event.event.FrameworkEvent.ToolNotFound) {
					const output = event.event.FrameworkEvent.ToolNotFound.full_output;
					this.panelProvider.addToolNotFound(sessionId, exchangeId, output);
				}
				if (event.event.FrameworkEvent.ToolParameterFound) {
					const toolParameter = event.event.FrameworkEvent.ToolParameterFound.tool_parameter_input;


					this.panelProvider.addToolParameterFound(sessionId, exchangeId, toolParameter.field_name, toolParameter.field_content_delta, toolParameter.field_content_up_until_now);

				}
				if (event.event.FrameworkEvent.ToolOutput) {
					if (event.event.FrameworkEvent.ToolOutput.ToolTypeForOutput) {
						// This contains the tool type for which we are generating the output over here
						const toolTypeForOutput = event.event.FrameworkEvent.ToolOutput.ToolTypeForOutput.tool_type;
						this.panelProvider.addToolTypeForOutputFound(sessionId, exchangeId, toolTypeForOutput);
					}
					if (event.event.FrameworkEvent.ToolOutput.ToolOutputResponse) {
						// This contains the tool output response, which shows you that we have the delta over here and the answer up until now
						// we can just send the answer up until now completely and have it displayed on the extension layer
						const toolOutput = event.event.FrameworkEvent.ToolOutput.ToolOutputResponse;
						this.panelProvider.addToolOutputFound(sessionId, exchangeId, toolOutput.delta, toolOutput.answer_up_until_now);
					}

				}
			}
		}
	}

	dispose() {
		// this.aideAgent.dispose();
	}
}