import { Button } from 'components/button';
import { RequestViewItem } from 'components/exchange/request';
import { ResponseViewItem } from 'components/exchange/response';
import resolveEditorContent from 'components/input/resolveInput';
import Tiptap from 'components/input/TipTapEditor';
import { PresetLogo } from 'components/preset';
import { TaskDD, TaskDL, TaskDT } from 'components/task-definition-list';
import * as React from 'react';
import { Navigate, useBlocker, useLocation, useNavigate } from 'react-router-dom';
import { useSubmenuContext } from 'store/submenuContext';
import { cn } from 'utils/cn';
import { Event, Exchange, TerminalInformation, View, ViewType } from '../../model';
import { useTask } from './use-task';
import { TerminalPreview } from 'components/terminal-preview';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { Spinner } from 'components/spinner';
import { AppState } from 'app';

export function TaskView() {
  const task = useTask();
  const [summaryShown, setSummaryShown] = React.useState(false);
  const availableContextProviders = useSubmenuContext((state) => state.contextProviderDescriptions);

  const [showActions, setShowActions] = React.useState(false);
  const acceptButtonRef = React.useRef<HTMLButtonElement>(null);

  const appState = React.useContext(AppState);

  React.useEffect(() => {
    if (showActions && acceptButtonRef.current) {
      acceptButtonRef.current.focus();
    }
  }, [showActions]);

  function onUserSaysNo() {
    if (task.data) {
      task.sendRequest('No', task.data.task.sessionId, [], []);
    }
  }

  function onUserSaysYes() {
    if (task.data) {
      task.sendRequest('Yes', task.data.task.sessionId, [], []);
    }
  }

  const [exchanges, setExchanges] = React.useState(task.data?.task?.exchanges || []);
  const [preset, setPreset] = React.useState(task.data?.task?.preset);
  const [query, setQuery] = React.useState(task.data?.task?.query);
  const isQueryEmpty = query === '';

  const [terminals, setTerminals] = React.useState<TerminalInformation[]>([]);

  React.useEffect(() => {
    const handleTerminalUpdates = (event: MessageEvent<Event>) => {
      if (event.data.type === 'task-terminals') {
        setTerminals(event.data.terminals);
      }
    };

    window.addEventListener('message', handleTerminalUpdates);
    return () => {
      window.removeEventListener('message', handleTerminalUpdates);
    };
  }, []);

  const exchangesContainerRef = React.useRef<HTMLDivElement>(null);
  const [userInitiatedScroll, setUserInitiatedScroll] = React.useState(false);
  const [userDidScroll, setUserDidScroll] = React.useState(false);

  React.useEffect(() => {
    const exchangesContainer = exchangesContainerRef.current;
    if (!userDidScroll && exchangesContainer) {
      exchangesContainer.scrollTop = exchangesContainer.scrollHeight;
    }
  }, [exchanges, terminals.length]);

  function handleUserEvent() {
    setUserInitiatedScroll(true);
  }

  function handleMessagesScroll(event: React.UIEvent<HTMLDivElement>) {
    // console.log({ userInitiatedScroll });
    if (userInitiatedScroll) {
      const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
      const scrolledToBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 10;
      // Reset `userDidScroll` if they went all the way down to the bottom
      setUserDidScroll(!scrolledToBottom);
    } else {
      setUserDidScroll(false);
    }
    setUserInitiatedScroll(false);
  }

  React.useEffect(() => {
    if (task.data) {
      setExchanges(task.data.task.exchanges);
      setPreset(task.data.task.preset);
    }
    //setQuery(task.data?.task.query);
  }, [task.data?.task]);

  function openTerminal(terminalId: number) {
    vscode.postMessage({
      type: 'open-terminal',
      id: terminalId,
    });
  }

  const blocker = useBlocker(exchanges?.length > 0);

  function onCancelTask() {
    blocker.proceed?.();
    if (task.data?.task) {
      vscode.postMessage({
        type: 'cancel-request',
        sessionId: task.data.task.sessionId,
      });
    }
  }

  function onDialogOpenChange(open: boolean) {
    if (!open) {
      blocker.reset?.();
    }
  }

  if (task.data === undefined) {
    return <div>Loading...</div>;
  }

  if (!task.data.task || !task.data.task.preset) {
    return <Navigate to={`/${View.Preset}`} />;
  }

  return (
    <React.Fragment key={task.data.task.sessionId}>
      <main className="flex h-full flex-col">
        <header className="sticky top-0 z-10 bg-panel-background p-2">
          <div className="group">
            <div className="mb-2 flex cursor-pointer select-none items-center justify-between">
              <h2 className="text-base text-description">
                Task
                {/* {isQueryEmpty ? 'New request' : query} */}
              </h2>
              <span
                className={cn(
                  // 'codicon',
                  //summaryShown ? 'codicon-chevron-up' : 'codicon-chevron-down',
                  'ml-2 flex-shrink-0'
                )}
              />
            </div>
            {!summaryShown ? (
              <dl className="flex items-baseline">
                <dt className="sr-only">Preset</dt>
                <dd className="mr-auto flex items-center text-description">
                  {preset?.provider && (
                    <PresetLogo provider={preset.provider} className="mr-1 h-3 w-3" />
                  )}
                  <span className="whitespace-nowrap">{preset?.name}</span>
                </dd>
                {/* {cost && (
                <React.Fragment>
                  <dt className="sr-only">API cost</dt>
                  <dd>
                    <span>{cost}$</span>
                  </dd>
                </React.Fragment>
              )} */}
              </dl>
            ) : (
              <TaskDL>
                <TaskDT>Query</TaskDT>
                <TaskDD className={cn(isQueryEmpty && 'No')}>
                  {isQueryEmpty ? 'No query made yet' : query}
                </TaskDD>
                <TaskDT>Preset</TaskDT>
                <TaskDD>
                  <span className="flex gap-1">
                    {preset?.provider && (
                      <PresetLogo
                        provider={preset.provider}
                        className="h-3 w-3 flex-shrink-0 translate-y-0.5"
                      />
                    )}
                    {preset?.name}
                  </span>
                </TaskDD>
                {/* <React.Fragment>
              <TaskDT>API cost</TaskDT>
              <TaskDD className="flex gap-1">
                <CostIcon className="translate-y-0.5" />
                {cost}$
              </TaskDD>
            </React.Fragment>
            {showUsage && (
              <React.Fragment>
                <TaskDT>Data</TaskDT>
                <TaskDD className="mt-1">
                  <UsageList usage={usage} />
                </TaskDD>
              </React.Fragment>
            )} */}
              </TaskDL>
            )}
          </div>
          {terminals.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              <p className="sr-only">Task terminals</p>
              <ul>
                {terminals.map((terminal) => (
                  <li key={terminal.id}>
                    <button className="w-full" onClick={() => openTerminal(terminal.id)}>
                      <TerminalPreview
                        className={cn(!terminal.busy && 'opacity-50')}
                        name={terminal.name}
                        busy={terminal.busy}
                        lines={[terminal.lastCommand]}
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </header>
        <div
          className="flex flex-grow flex-col gap-2 overflow-x-hidden overflow-y-scroll"
          onWheel={handleUserEvent}
          onMouseDown={handleUserEvent}
          onTouchStart={handleUserEvent}
          onKeyDown={handleUserEvent}
          onScroll={handleMessagesScroll}
          ref={exchangesContainerRef}
        >
          <section className="flex-grow px-3 py-2">
            {exchanges && (
              <ol>
                {exchanges.map((exchange, index) => (
                  <li
                    className={cn(
                      exchange.type === 'request' ? 'my-6' : 'my-2',
                      index === 0 && 'mt-0'
                    )}
                    key={exchange.exchangeId}
                  >
                    {renderExchange(exchange)}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <div className="sticky bottom-0 bg-sidebar-background p-2">
            {!task.data?.task.complete && (
              <span
                aria-live="polite"
                className="mb-0.5 flex items-center gap-2 rounded-xs bg-panel-background px-2 py-1 text-description"
              >
                <Spinner className="h-3 w-3" />
                Generating
              </span>
            )}
            {showActions && (
              <div
                aria-live="assertive"
                aria-hidden={!showActions}
                className={cn(
                  'mb-2 flex gap-2 transition-all duration-150 ease-in-out',
                  showActions ? 'translate-y-1/2 opacity-100' : 'translate-y-0 opacity-0'
                )}
              >
                <Button
                  onClick={onUserSaysYes}
                  ref={acceptButtonRef}
                  type="button"
                  className="flex flex-grow items-start gap-2"
                >
                  <span
                    aria-hidden
                    className="codicon codicon-thumbsup-filled -ml-1 translate-y-0.5"
                  />
                  Yes
                </Button>
                <Button
                  onClick={onUserSaysNo}
                  type="button"
                  variant="secondary"
                  className="flex flex-grow items-start gap-2"
                >
                  <span aria-hidden className="codicon codicon-thumbsdown -ml-1 translate-y-0.5" />
                  No
                </Button>
              </div>
            )}
            <Tiptap
              availableContextProviders={availableContextProviders ?? []}
              showCancelButton={!task.data?.task.complete}
              showDevtoolsButton={appState.reactDevtoolsReady}
              onToggleDevtools={() => {
                vscode.postMessage({
                  type: 'start-inspecting-host',
                });
              }}
              historyKey="chat"
              onEnter={async (editorState, editor) => {
                const sessionId = task.data?.task.sessionId;
                if (sessionId === undefined) {
                  return;
                }

                const [selectedContextItems, _, content] = await resolveEditorContent(editorState);
                const inputQuery = Array.isArray(content)
                  ? content
                      .filter((p) => p.type === 'text')
                      .map((c) => c.text)
                      .join('\n')
                  : content;
                const base64Images = Array.isArray(content)
                  ? content
                      .filter(
                        (p): p is { type: 'imageUrl'; imageUrl: { url: string } } =>
                          p.type === 'imageUrl' && p.imageUrl !== undefined
                      )
                      .map((c) => c.imageUrl.url.split(',')[1])
                      .filter((url): url is string => url !== undefined)
                  : [];

                console.log({ selectedContextItems });

                task.sendRequest(inputQuery, sessionId, selectedContextItems, base64Images);

                // Clear the editor after sending
                editor.commands.clearContent();
              }}
              onClear={() => {
                vscode.postMessage({
                  type: 'init',
                  newSession: true,
                });
              }}
              onCancel={() => {
                vscode.postMessage({
                  type: 'cancel-request',
                  sessionId: task.data.task.sessionId,
                });
              }}
            />
          </div>
        </div>
      </main>
      <AlertDialog.Root open={blocker.state === 'blocked'} onOpenChange={onDialogOpenChange}>
        <AlertDialog.Portal>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <AlertDialog.Overlay className="bg-panel-background opacity-40 backdrop-blur-sm" />
            <AlertDialog.Content className="relative isolate m-3 flex flex-col gap-2 bg-panel-background p-3 text-description lg:w-fit">
              <div className="absolute inset-0 rounded border border-panel-border opacity-50" />
              <AlertDialog.Title className="font-semibold text-foreground">
                Are you sure you want to interrupt this task?
              </AlertDialog.Title>
              <AlertDialog.Description>You will lose all progress.</AlertDialog.Description>
              <div className="mt-4 flex justify-end gap-2">
                <AlertDialog.Cancel asChild>
                  <Button type="button">Cancel</Button>
                </AlertDialog.Cancel>
                <AlertDialog.Action asChild>
                  <Button type="button" variant="secondary" onClick={onCancelTask}>
                    Yes, drop task
                  </Button>
                </AlertDialog.Action>
              </div>
            </AlertDialog.Content>
          </div>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </React.Fragment>
  );
}

function renderExchange(exchange: Exchange) {
  switch (exchange.type) {
    case 'request':
      return <RequestViewItem {...exchange} />;
    case 'response':
      return <ResponseViewItem {...exchange} />;
  }
}
