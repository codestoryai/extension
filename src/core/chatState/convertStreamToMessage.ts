/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import { SidecarRequestRange } from '../server/types';
import { Limiter } from '../server/applyEdits';
import { IndentationHelper, IndentStyleSpaces } from '../completions/providers/editorSessionProvider';
import { AdjustedLineContent, LineContent, LineIndentManager } from '../completions/providers/reportEditorSessionAnswerStream';

/**
 * Processor tools for making streaming edits a thing
 */
export enum AnswerStreamContext {
	BeforeCodeBlock,
	InCodeBlock,
	AfterCodeBlock,
}

export interface AnswerStreamLine {
	line: string;
	context: AnswerStreamContext;
}

export class AnswerSplitOnNewLineAccumulatorStreaming {
	accumulator: string;
	runningAnswer: string;
	lines: AnswerStreamLine[];
	codeBlockStringFound: boolean;
	runningState: AnswerStreamContext;

	constructor() {
		this.accumulator = '';
		this.runningAnswer = '';
		this.lines = [];
		this.codeBlockStringFound = false;
		this.runningState = AnswerStreamContext.BeforeCodeBlock;
	}

	addDelta(delta: string | null | undefined) {
		if (delta === null || delta === undefined) {
			return;
		}
		// When we are adding delta, we need to check if after adding the delta
		// we get a new line, and if we do we split it on the new line and add it
		// to our queue of events to push
		this.accumulator = this.accumulator + delta;
		while (true) {
			const newLineIndex = this.accumulator.indexOf('\n');
			// If we found no new line, lets just break here
			if (newLineIndex === -1) {
				break;
			}
			const completeLine = this.accumulator.substring(0, newLineIndex);
			if (/^```/.test(completeLine)) {
				if (!this.codeBlockStringFound) {
					this.codeBlockStringFound = true;
					this.runningState = AnswerStreamContext.BeforeCodeBlock;
				} else {
					this.runningState = AnswerStreamContext.InCodeBlock;
				}
			} else {
				if (this.codeBlockStringFound) {
					this.runningState = AnswerStreamContext.InCodeBlock;
				}
			}
			this.lines.push({
				line: completeLine,
				context: this.runningState,
			});
			// we set the accumulator to the remaining line
			this.accumulator = this.accumulator.substring(newLineIndex + 1);
		}
	}

	getLine(): AnswerStreamLine | null {
		if (this.lines.length === 0) {
			return null;
		}
		// or give back the first element of the string
		const line = this.lines[0];
		// remove the first element from the array
		this.lines = this.lines.slice(1);
		return line;
	}

	getLineLength(): number {
		return this.lines.length;
	}
}

export enum StateEnum {
	Initial,
	InitialAfterFilePath,
	InProgress,
}

export class StreamProcessor {
	document: DocumentManager;
	currentState: StateEnum;
	previousLine: LineIndentManager | null;
	documentLineIndex: number;
	sentEdits: boolean;
	documentLineLimit: number;
	editLineDecorationType: vscode.TextEditorDecorationType;
	activeWindow: vscode.TextEditor;
	private previousDecorationRange: vscode.Range | null = null;
	constructor(
		lines: string[],
		indentStyle: IndentStyleSpaces | undefined,
		uri: vscode.Uri,
		range: SidecarRequestRange,
		limiter: Limiter<any> | null,
		iterationEdits: vscode.WorkspaceEdit,
		applyDirectly: boolean,
		uniqueId: string,
		activeWindow: vscode.TextEditor,
	) {
		this.activeWindow = activeWindow;
		this.editLineDecorationType = vscode.window.createTextEditorDecorationType(
			{
				isWholeLine: true,
				backgroundColor: { id: "diffEditor.insertedLineBackground" },
				outlineWidth: "1px",
				outlineStyle: "solid",
				outlineColor: { id: "diffEditor.insertedTextBorder" },
				rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
			},
		);
		// Initialize document with the given parameters
		this.document = new DocumentManager(
			lines,
			range,
			indentStyle,
			uri,
			limiter,
			iterationEdits,
			applyDirectly,
			uniqueId,
			activeWindow,
		);
		this.documentLineLimit = Math.min(range.endPosition.line, this.document.getLineCount() - 1);

		// Set markers for file path, begin, and end
		this.currentState = StateEnum.InitialAfterFilePath;
		this.previousLine = null;
		this.documentLineIndex = this.document.firstSentLineIndex;
		this.sentEdits = false;
	}

	async cleanup() {
		// for cleanup we are going to replace the lines from the documentLineIndex to the documentLineLimit with ""
		// console.log('cleanup', this.documentLineIndex, this.documentLineLimit);
		if (this.documentLineIndex <= this.documentLineLimit) {
			this.document.replaceLines(this.documentLineIndex, this.documentLineLimit, new AdjustedLineContent('', 0, '', 0));
		}
		this.editLineDecorationType.dispose();
	}

	async processLine(answerStreamLine: AnswerStreamLine) {
		// console.table({
		// 	'event_name': 'process_line',
		// 	'line_content': answerStreamLine.line,
		// 	'documentLineIndex': this.documentLineIndex,
		// });
		if (answerStreamLine.context !== AnswerStreamContext.InCodeBlock) {
			return;
		}

		// console.log('documentLineIndex', this.documentLineIndex);

		// updating the decorations
		// Clear previous decoration
		if (vscode.window.activeTextEditor?.document.uri.fsPath === this.activeWindow.document.uri.fsPath) {
			if (this.previousDecorationRange) {
				vscode.window.activeTextEditor.setDecorations(this.editLineDecorationType, []);
			}

			// Get the range for the current line
			let lineNumber = this.documentLineIndex;
			const lineCount = vscode.window.activeTextEditor.document.lineCount;
			if (lineNumber >= lineCount) {
				lineNumber = vscode.window.activeTextEditor.document.lineCount - 1;
			}

			// guard against empty files
			if (lineNumber >= 0) {
				const lineRange = vscode.window.activeTextEditor.document.lineAt(lineNumber).range;

				// Apply the decoration
				vscode.window.activeTextEditor.setDecorations(this.editLineDecorationType, [lineRange]);

				// Update the previous decoration range
				this.previousDecorationRange = lineRange;
			}
		}


		const line = answerStreamLine.line;
		if (this.previousLine) {
			// if previous line is there, then we can reindent the current line
			// contents here
			const adjustedLine = this.previousLine.reindent(line, this.document.indentStyle);
			// find the anchor point for the current line
			// anchor will always be null over here
			const anchor = this.findAnchor(adjustedLine, this.documentLineIndex);
			if (anchor !== null) {
				// console.log('documentLineIndex::if_condition', this.documentLineIndex);
				this.sentEdits = true;
				// if no anchor line, then we have to replace the current line
				// console.log('replaceLines', this.documentLineIndex, anchor, adjustedLine);
				this.documentLineIndex = await this.document.replaceLines(this.documentLineIndex, anchor, adjustedLine);
			} else if (this.documentLineIndex > this.documentLineLimit) {
				// console.log('documentLineIndex::else_if_condition', this.documentLineIndex);
				if (this.sentEdits) {
					this.documentLineIndex = await this.document.insertLineAfter(this.documentLineIndex - 1, adjustedLine);
					// this.documentLineIndex = await this.document.appendLine(adjustedLine);
				} else {
					if (this.documentLineIndex > this.documentLineLimit && !this.sentEdits) {
						this.documentLineIndex = await this.document.appendLine(adjustedLine);
					} else {
						this.documentLineIndex = await this.document.replaceLine(this.documentLineIndex, adjustedLine);
					}
				}
				this.sentEdits = true;
			} else {
				// console.log('documentLineIndex::elsecase', this.documentLineIndex);
				this.documentLineIndex = await this.document.replaceLine(this.documentLineIndex, adjustedLine);
				// we have sent the edits for this range, we should track that
			}
		} else {
			const initialAnchor = this.findInitialAnchor(line);
			this.previousLine = new LineIndentManager(this.document.getLine(initialAnchor).indentLevel, line);
			const adjustedInitialLine = this.previousLine.reindent(line, this.document.indentStyle);
			this.documentLineIndex = await this.document.replaceLine(initialAnchor, adjustedInitialLine);
		}
	}

	// Find the initial anchor line in the document
	findInitialAnchor(_lineContent: string): number {
		// const trimmedContent = lineContent.trim();
		// for (let index = this.document.firstSentLineIndex; index < this.document.getLineCount(); index++) {
		// 	const line = this.document.getLine(index);
		// 	if (line.isSent && line.trimmedContent === trimmedContent) {
		// 		return index;
		// 	}
		// }
		return this.document.firstRangeLine;
	}

	// Find the anchor line in the document based on indentation and content
	findAnchor(adjustedLine: AdjustedLineContent, startIndex: number): number | null {
		const endIndex = startIndex + 1;
		if (endIndex > 10000) {
			adjustedLine.adjustedContent = '';
		}
		return null;
	}
}


class DocumentManager {
	indentStyle: IndentStyleSpaces;
	lines: LineContent[];
	firstSentLineIndex: number;
	firstRangeLine: number;
	uri: vscode.Uri;
	limiter: Limiter<any> | null;
	iterationEdits: vscode.WorkspaceEdit;
	applyDirectly: boolean;
	uniqueId: string;
	activeWindow: vscode.TextEditor;

	constructor(
		lines: string[],
		// Fix the way we provide context over here?
		range: SidecarRequestRange,
		indentStyle: IndentStyleSpaces | undefined,
		uri: vscode.Uri,
		limiter: Limiter<any> | null,
		iterationEdits: vscode.WorkspaceEdit,
		applyDirectly: boolean,
		uniqueId: string,
		activeWindow: vscode.TextEditor,
	) {
		this.activeWindow = activeWindow;
		this.uniqueId = uniqueId;
		this.limiter = limiter;
		this.lines = []; // Stores all the lines in the document
		this.indentStyle = IndentationHelper.getDocumentIndentStyle(lines, indentStyle);
		this.iterationEdits = iterationEdits;
		this.applyDirectly = applyDirectly;

		// Split the editor's text into lines and initialize each line
		const editorLines = lines;
		// restrict the document to the end position of the range, cause any code
		// after that is irrelevant to the current streaming edits
		for (let i = 0; i <= Math.min(Math.max(editorLines.length - 1, 0), range.endPosition.line); i++) {
			this.lines[i] = new LineContent(editorLines[i], this.indentStyle);
		}

		// Mark the lines as 'sent' based on the location provided
		const rangeLength = range.endPosition.line - range.startPosition.line + 1;
		const firstLineIndex = range.startPosition.line;
		for (let j = 0; j < rangeLength; j++) {
			const lineIndex = firstLineIndex + j;
			try {
				this.lines[lineIndex].markSent();
			} catch (exception) {
				console.log('document_manager::line_index', lineIndex);
				console.error(exception);
			}
		}

		// console.log('document_manager::range', JSON.stringify(range));

		this.firstSentLineIndex = firstLineIndex;
		this.firstRangeLine = firstLineIndex;
		this.uri = uri;
	}

	// Returns the total number of lines
	getLineCount() {
		return this.lines.length;
	}

	// Retrieve a specific line
	getLine(index: number): LineContent {
		return this.lines[index];
	}

	// Replace a specific line and report the change
	async replaceLine(index: number, newLine: AdjustedLineContent) {
		this.lines[index] = new LineContent(newLine.adjustedContent, this.indentStyle);
		//console.log('sidecar.replaceLine', index);
		// console.table({
		// 	'edit': 'replace_line',
		// 	'index': index,
		// 	'content': newLine.adjustedContent,
		// });
		const edits = new vscode.WorkspaceEdit();
		if (newLine.adjustedContent === '') {
			// console.log('What line are we replaceLine', newLine.adjustedContent);
			edits.delete(this.uri, new vscode.Range(index, 0, index, 1000), {
				label: this.uniqueId.toString(),
				needsConfirmation: false,
			});
			this.iterationEdits.delete(this.uri, new vscode.Range(index, 0, index, 1000));
			if (this.applyDirectly) {
				await this.activeWindow.edit((editBuilder) => {
					return editBuilder.delete(new vscode.Range(index, 0, index, 1000));
				}, {
					undoStopAfter: false,
					undoStopBefore: false,
				});
				// await vscode.workspace.applyEdit(edits);
			}
			return index + 1;
		} else {
			// console.log('What line are we replaceLine', newLine.adjustedContent);
			edits.replace(this.uri, new vscode.Range(index, 0, index, 1000), newLine.adjustedContent, {
				label: this.uniqueId.toString(),
				needsConfirmation: false,
			});
			this.iterationEdits.replace(this.uri, new vscode.Range(index, 0, index, 1000), newLine.adjustedContent);
			if (this.applyDirectly) {
				await this.activeWindow.edit((editBuilder) => {
					return editBuilder.replace(new vscode.Range(index, 0, index, 1000), newLine.adjustedContent);
				}, {
					undoStopAfter: false,
					undoStopBefore: false,
				});
				// await vscode.workspace.applyEdit(edits);
			}
			return index + 1;
		}
	}

	// Replace multiple lines starting from a specific index
	async replaceLines(startIndex: number, endIndex: number, newLine: AdjustedLineContent) {
		//console.log('sidecar.replaceLine', startIndex, endIndex);
		// console.table({
		// 	'edit': 'replace_lines',
		// 	'start_index': startIndex,
		// 	'end_index': endIndex,
		// 	'content': newLine.adjustedContent,
		// });
		if (startIndex === endIndex) {
			return await this.replaceLine(startIndex, newLine);
		} else {
			this.lines.splice(
				startIndex,
				endIndex - startIndex + 1,
				new LineContent(newLine.adjustedContent, this.indentStyle)
			);
			const edits = new vscode.WorkspaceEdit();
			// console.log('sidecar.What line are we replaceLines', newLine.adjustedContent, startIndex, endIndex);
			edits.replace(this.uri, new vscode.Range(startIndex, 0, endIndex, 1000), newLine.adjustedContent, {
				label: this.uniqueId.toString(),
				needsConfirmation: false,
			});
			console.log('changedLineRange', startIndex, endIndex);
			this.iterationEdits.replace(this.uri, new vscode.Range(startIndex, 0, endIndex, 1000), newLine.adjustedContent);
			if (this.applyDirectly) {
				await this.activeWindow.edit((editBuilder) => {
					return editBuilder.replace(new vscode.Range(startIndex, 0, endIndex, 1000), newLine.adjustedContent);
				}, {
					undoStopAfter: false,
					undoStopBefore: false,
				});
				// await vscode.workspace.applyEdit(edits);
			}
			return startIndex + 1;
		}
	}

	// Add a new line at the end
	async appendLine(newLine: AdjustedLineContent) {
		//console.log('sidecar.appendLine', this.lines.length - 1);
		this.lines.push(new LineContent(newLine.adjustedContent, this.indentStyle));
		const edits = new vscode.WorkspaceEdit();
		// console.table({
		// 	'edit': 'append_line',
		// 	'start_index': this.lines.length - 2,
		// 	'content': newLine.adjustedContent,
		// });
		// console.log('what line are we appendLine', newLine.adjustedContent);
		edits.replace(this.uri, new vscode.Range(this.lines.length - 2, 1000, this.lines.length - 2, 1000), '\n' + newLine.adjustedContent, {
			label: this.uniqueId.toString(),
			needsConfirmation: false,
		});
		console.log('changedLine', this.lines.length - 1);
		this.iterationEdits.replace(this.uri, new vscode.Range(this.lines.length - 2, 1000, this.lines.length - 2, 1000), '\n' + newLine.adjustedContent);
		if (this.applyDirectly) {
			await this.activeWindow.edit((editBuilder) => {
				return editBuilder.replace(new vscode.Range(this.lines.length - 2, 1000, this.lines.length - 2, 1000), '\n' + newLine.adjustedContent);
			}, {
				undoStopAfter: false,
				undoStopBefore: false,
			});
			// await vscode.workspace.applyEdit(edits);
		}
		return this.lines.length;
	}

	// Insert a new line after a specific index
	async insertLineAfter(index: number, newLine: AdjustedLineContent) {
		//console.log('insertLineAfter', index);
		// console.table({
		// 	'edit': 'insert_line_after',
		// 	'index': index,
		// 	'content': newLine.adjustedContent,
		// });
		this.lines.splice(index + 1, 0, new LineContent(newLine.adjustedContent, this.indentStyle));
		const edits = new vscode.WorkspaceEdit();
		// console.log('what line are we inserting insertLineAfter', newLine.adjustedContent);
		edits.replace(this.uri, new vscode.Range(index, 1000, index, 1000), '\n' + newLine.adjustedContent, {
			label: this.uniqueId.toString(),
			needsConfirmation: false,
		});
		console.log('changedLine', index);
		this.iterationEdits.replace(this.uri, new vscode.Range(index, 1000, index, 1000), '\n' + newLine.adjustedContent);
		if (this.applyDirectly) {
			await this.activeWindow.edit((editBuilder) => {
				return editBuilder.replace(new vscode.Range(index, 1000, index, 1000), '\n' + newLine.adjustedContent);
			}, {
				undoStopAfter: false,
				undoStopBefore: false,
			});
			// await vscode.workspace.applyEdit(edits);
		}
		return index + 2;
	}
}
