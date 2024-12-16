import { uniqueId } from 'lodash';
import * as os from 'os';
import * as vscode from 'vscode';
import { AideAgentSessionProvider } from './core/completions/providers/aideAgentProvider';
import { PanelProvider } from './PanelProvider';
import postHogClient from './core/posthog/client';
import { RecentEditsRetriever } from './core/server/editedFiles';
import { RepoRef, RepoRefBackend, SideCarClient } from './core/sidecar/client';
import { TerminalManager } from './core/terminal/TerminalManager';
import { AideAgentMode } from './types';
import {
  checkOrKillRunningServer,
  getSidecarBinaryURL,
  startSidecarBinary,
} from './core/utilities/setupSidecarBinary';
import { sidecarUseSelfRun } from './core/utilities/sidecarUrl';
import { getUniqueId } from './core/utilities/uniqueId';
import { ProjectContext } from './core/utilities/workspaceContext';
import { SimpleBrowserView } from './browser/simpleBrowserView';
import { SimpleBrowserManager } from './browser/simpleBrowserManager';
import { findPortPosition } from './utils/port';
import { ReactDevtoolsManager } from './devtools/react/DevtoolsManager';

const openApiCommand = 'sota-swe.api.open';
const showCommand = 'sota-swe.show-browser';

export let SIDECAR_CLIENT: SideCarClient | null = null;

/**
Extension → PanelProvider → Webview (app.tsx)
(native)     (bridge)       (UI layer)

Example flow:
1. Extension starts sidecar download
2. When ready, calls panelProvider.setSidecarReady()
3. PanelProvider sends message to webview
4. app.tsx receives message and updates UI
 */

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {

  //const session = await vscode.csAuthentication.getSession();
  //const email = session?.account.email ?? '';
  postHogClient?.capture({
    distinctId: getUniqueId(),
    event: 'activate',
    properties: {
      platform: os.platform(),
      product: 'extension',
      email: 'test@test.com',
    },
  });

  // Create a terminal manager instance
  const terminalManager = new TerminalManager();

  const reactDevtoolsManager = new ReactDevtoolsManager();

  const panelProvider = new PanelProvider(context, terminalManager, reactDevtoolsManager);
  let rootPath = vscode.workspace.rootPath;
  if (!rootPath) {
    rootPath = '';
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
  const recentEditsRetriever = new RecentEditsRetriever(300 * 1000, vscode.workspace);
  context.subscriptions.push(recentEditsRetriever);

  // Register the agent session provider
  const agentSessionProvider = new AideAgentSessionProvider(
    currentRepo,
    projectContext,
    recentEditsRetriever,
    context,
    panelProvider,
    terminalManager
  );
  context.subscriptions.push(agentSessionProvider);

  // Show the panel immediately
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('sota-swe-panel', panelProvider)
  );

  console.log('extension:will start sidecar binary');
  // sidecar binary download in background
  startSidecarBinary(context.globalStorageUri.fsPath, panelProvider)
    .then(async (sidecarUrl) => {
      const sidecarClient = new SideCarClient(sidecarUrl);
      // Perform a health check
      await sidecarClient.healthCheck();

      // Tell the PanelProvider that the sidecar is ready
      panelProvider.setSidecarClient(sidecarClient);
      SIDECAR_CLIENT = sidecarClient;
    })
    .catch((error) => {
      console.error('Failed to start sidecar:', error);
      vscode.window.showErrorMessage('Failed to start sidecar for SOTA SWE extension');
    });

  context.subscriptions.push(
    panelProvider.onMessageFromWebview(async (message) => {
      // console.log('message from webview', message);
      if (message.type === 'task-feedback') {
        try {
          // here we get the message from the user
          const query = message.query;
          const sessionId = message.sessionId;
          const webviewVariables = message.variables;
          const base64Images = message.images;

          // Convert variables to VSCode format
          const variables: vscode.ChatPromptReference[] = await Promise.all(
            webviewVariables
              .filter((v) => v.id.providerTitle === 'file')
              .map(async (v) => {
                const uri = vscode.Uri.parse(v.uri!.value);
                const document = await vscode.workspace.openTextDocument(uri);
                const range = new vscode.Range(
                  document.positionAt(0),
                  document.positionAt(document.getText().length)
                );

                return {
                  id: 'vscode.file',
                  value: { uri, range },
                };
              })
          );

          // something will create the exchange id
          const exchangeId = uniqueId();
          panelProvider.addExchangeRequest(sessionId, exchangeId, query);

          const { model, provider } = message.modelSelection;

          const modelSelection = {
            slowModel: model,
            fastModel: model,
            models: {
              [model]: {
                name: model,
                contextLength: 10000,
                temperature: 0.2,
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

          console.log('model selection', modelSelection);

          panelProvider.setTaskStatus(message.sessionId, false);

          console.log('set task status', message.sessionId);
          // - ping the sidecar over here. currentRepo can be undefined, which will 422 sidecar
          const stream = SIDECAR_CLIENT!.agentSessionPlanStep(
            query,
            sessionId,
            exchangeId,
            agentSessionProvider.editorUrl!,
            AideAgentMode.Chat,
            variables,
            currentRepo ?? '',
            projectContext.labels,
            false,
            'workos-fake-id',
            modelSelection,
            base64Images
          );
          // - have a respose somewhere and the chat model would update
          await agentSessionProvider.reportAgentEventsToChat(true, stream);

          panelProvider.setTaskStatus(message.sessionId, true);
          // and the model will have a on did change
          // - the extension needs the state
          // - on did change chat model gets back over here

        } catch (error) {
          console.error('Error handling message from webview:', error);
        }
      }

      if (message.type === 'cancel-request') {
        agentSessionProvider.cancelAllExchangesForSession(message.sessionId);
      }

      if (message.type === 'open-file') {
        try {
          const uri = vscode.Uri.parse(message.fs_file_path);
          const document = await vscode.workspace.openTextDocument(uri);
          await vscode.window.showTextDocument(document);
          console.log('file opened');
        } catch (err) {
          console.error(`Could not find file with path ${message.fs_file_path}`);
        }
      }
    })
  );

  context.subscriptions.push(
    panelProvider.onDidWebviewBecomeVisible(() => {
      // @theskcd we update the view state here
      panelProvider.updateState();
    })
  );

  const manager = new SimpleBrowserManager(context.extensionUri);
  context.subscriptions.push(manager);

  context.subscriptions.push(vscode.window.registerWebviewPanelSerializer(SimpleBrowserView.viewType, {
    deserializeWebviewPanel: async (panel, state) => {
      console.log('deserialize webview panel ', state);
      manager.restore(panel, state);
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand(showCommand, async (url?: string) => {

    const prefilledUrl = 'http://localhost:3000';
    const portPosition = findPortPosition(prefilledUrl);

    if (!url) {
      url = await vscode.window.showInputBox({
        placeHolder: vscode.l10n.t("https://localhost:3000"),
        value: prefilledUrl,
        valueSelection: portPosition ? [portPosition.start, portPosition.end] : undefined,
        prompt: vscode.l10n.t("Insert the url of your dev server")
      });
    }

    if (url) {
      try {
        const parsedUrl = new URL(url);
        if (reactDevtoolsManager.status === 'server-connected') {
          const proxyedPort = await reactDevtoolsManager.proxy(Number(parsedUrl.port));
          const proxyedUrl = new URL(parsedUrl);
          proxyedUrl.port = proxyedPort.toString();
          manager.show(proxyedUrl.href);
        } else {
          console.error('Devtools are not ready');
        }
      } catch (err) {
        vscode.window.showErrorMessage('The URL you provided is not valid');
      }
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand(openApiCommand, (url: vscode.Uri, showOptions?: {
    preserveFocus?: boolean;
    viewColumn: vscode.ViewColumn;
  }) => {
    manager.show(url, showOptions);
  }));
}

// This method is called when your extension is deactivated
export async function deactivate() {
  const shouldUseSelfRun = sidecarUseSelfRun();
  if (!shouldUseSelfRun) {
    // This will crash when self-running
    const serverUrl = getSidecarBinaryURL();
    return await checkOrKillRunningServer(serverUrl);
  }
  return new Promise((resolve) => {
    resolve(true);
  });
}
