
import * as vscode from "vscode";

import {
  AideAgentResponseStream,
  AideAgentEditsInfo,
  AideAgentPlanInfo,
  AideCommand,
  AideAgentStreamingState,
  AideChatStep,
  AideAgentThinkingForEdit,
  AideAgentPlanRegenerateInformation,
} from "./types";

export class AideResponse implements AideAgentResponseStream {

  constructor() {}


  markdownWithVulnerabilities(_value: string | vscode.MarkdownString, _vulnerabilities: vscode.ChatVulnerability[]): void {
   
  }
  detectedParticipant(_participant: string, _command?: vscode.ChatCommand): void {
    console.warn('Method not implemented');
  }
  reference2(_value: vscode.Uri | vscode.Location | string | { variableName: string; value?: vscode.Uri | vscode.Location; }, _iconPath?: vscode.Uri | vscode.ThemeIcon | { light: vscode.Uri; dark: vscode.Uri; }, _options?: { status?: { description: string; kind: vscode.ChatResponseReferencePartStatusKind; }; }): void {
    console.warn('Method not implemented');
  }

  markdown(_value: unknown): void {
    console.warn('Method not implemented');
  }
  anchor(_value: unknown, _title?: unknown): void {
    console.warn('Method not implemented');
  }
  filetree(_value: unknown, _baseUri: unknown): void {
    console.warn('Method not implemented');
  }
  progress(_value: unknown, _task?: unknown): void {
    console.warn('Method not implemented');
  }
  reference(_value: unknown, _iconPath?: unknown): void {
    console.warn('Method not implemented');
  }
  textEdit(
    _target: vscode.Uri,
    _edits: vscode.TextEdit | vscode.TextEdit[]
  ): void {
    console.warn('Method not implemented');
  }
  codeblockUri(_uri: vscode.Uri): void {
    console.warn('Method not implemented');
  }
  confirmation(
    _title: string,
    _message: string,
    _data: any,
    _buttons?: string[]
  ): void {
    console.warn('Method not implemented');
  }
  warning(_message: string | vscode.MarkdownString): void {
    console.warn('Method not implemented');
  }
  codeCitation(_value: vscode.Uri, _license: string, _snippet: string): void {
    console.warn('Method not implemented');
  }
  editsInfo(_edits: AideAgentEditsInfo) {
    console.warn('Method not implemented');
  }
  planInfo(_plan: AideAgentPlanInfo) {
    console.warn('Method not implemented');
  }
  button(_ommand: AideCommand) {
    console.warn('Method not implemented');
  }
  buttonGroup(_ommands: AideCommand[]) {
    console.warn('Method not implemented');
  }
  streamingState(_state: AideAgentStreamingState) {
    console.warn('Method not implemented');
  }
  codeEdit(_edits: vscode.WorkspaceEdit) {
    console.warn('Method not implemented');
  }
  step(_step: AideChatStep) {
    console.warn('Method not implemented');
  }
  push(_part: vscode.AideAgentResponsePart) {
    console.warn('Method not implemented');
  }
  thinkingForEdit(_part: AideAgentThinkingForEdit) {
    console.warn('Method not implemented');
  }
  regeneratePlan(_planInformation: AideAgentPlanRegenerateInformation) {
    console.warn('Method not implemented');
  }

  close() {}
}

export class ChatModel {}

