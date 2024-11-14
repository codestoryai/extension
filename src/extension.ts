// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { PanelProvider } from "./PanelProvider";
import { RepoRef, RepoRefBackend, SideCarClient } from "./sidecar/client";
import { startSidecarBinary } from "./utilities/setupSidecarBinary";
import { AideAgentSessionProvider } from "./completions/providers/aideAgentProvider";
import { ProjectContext } from "./utilities/workspaceContext";
import { RecentEditsRetriever } from "./server/editedFiles";
import { randomUUID } from "crypto";
import { AideAgentMode } from "./types";

export let SIDECAR_CLIENT: SideCarClient | null = null;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  const sidecarUrl = await startSidecarBinary(context.globalStorageUri.fsPath); // vscode.env.appRoot second argument
  console.log("sidecarUrl", sidecarUrl);

  const sidecarClient = new SideCarClient(sidecarUrl);

  const healthCheck = await sidecarClient.healthCheck();
  console.log("Sidecar health check", healthCheck);

  const panelProvider = new PanelProvider(context.extensionUri);

  let rootPath = vscode.workspace.rootPath;
  if (!rootPath) {
    rootPath = "";
  }

  const currentRepo = new RepoRef(
    // We assume the root-path is the one we are interested in
    rootPath,
    RepoRefBackend.local
  );

  // We also get some context about the workspace we are in and what we are
  // upto
  const projectContext = new ProjectContext();
  await projectContext.collectContext();

  // add the recent edits retriver to the subscriptions
  // so we can grab the recent edits very quickly
  const recentEditsRetriever = new RecentEditsRetriever(
    300 * 1000,
    vscode.workspace
  );
  context.subscriptions.push(recentEditsRetriever);

  // Register the agent session provider
  const agentSessionProvider = new AideAgentSessionProvider(
    currentRepo,
    projectContext,
    sidecarClient,
    recentEditsRetriever,
    context
  );
  const editorUrl = agentSessionProvider.editorUrl;
  context.subscriptions.push(agentSessionProvider);

  context.subscriptions.push(
    panelProvider.onMessageFromWebview(async (message) => {
      if (message.type === "new-request") {
        if (!editorUrl) {
          return;
        }

        const { query, exchangeId } = message;
        const sessionId = randomUUID();
        
        const iterationEdits = new vscode.WorkspaceEdit();
        
        const stream = sidecarClient.agentSessionPlanStep(
         query,
         sessionId,
         exchangeId,
         editorUrl,
         AideAgentMode.Edit,
         [],
         currentRepo,
         projectContext.labels,
         false,
         "" // Don't pass token for now (people can put their own API keys)
        );
        // @theskcd uncomment the following and start from here
        // const model = new ChatModel();
        // const response = model.addResponse();
        // const cts = new vscode.CancellationTokenSource();
        
        // await reportAgentEventsToChat(true, stream);
      }
    })
  );

  context.subscriptions.push(
    panelProvider.onDidWebviewBecomeVisible(() => {
      // @theskcd we update the view state here
      panelProvider.updateState();
    })
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("sota-pr-panel", panelProvider)
  );

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  const command = vscode.commands.registerCommand(
    "extension.helloWorld",
    () => {
      // The code you place here will be executed every time your command is executed
      // Display a message box to the user
      vscode.window.showInformationMessage("Hello World from extension!");
    }
  );

  context.subscriptions.push(command);
}

// This method is called when your extension is deactivated
export function deactivate() {}
