import * as React from "react";
import { Event, ViewType, Task, View, AppState } from "../model";
import { TaskView } from "@task/view";
import { uniqueId } from "lodash";
import { PresetView } from "@preset/view";
import { processFormData } from './utils/form';

interface vscode {
  postMessage(message: Event): void;
}

declare const vscode: vscode;

function onMessage(event: React.FormEvent<HTMLFormElement>, sessionId: string | undefined) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const query = data.get("query");
  if (sessionId === undefined) {
    return;
  }
  if (query && typeof query === "string") {
    vscode.postMessage({
      type: 'task-feedback',
      query,
      sessionId,
    });
  }

  // resets the form
  form.reset();
}

function onNewPreset(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  console.log(processFormData(data))
}

// Move this somewhere else
interface State {
  extensionReady: boolean;
  view: ViewType;
  currentTask?: Task;
  loadedTasks: Map<string, Task>;
}


function reducer(state: AppState, action: Event) {
  const newState = structuredClone(state);

  if (action.type === 'initial-state') {
    newState.currentTask = action.initialAppState.currentTask;
    return newState;
  }
  if (action.type === 'task-update') {
    newState.currentTask = action.currentTask;
    return newState;
  }
  if (action.type === "init") {
    newState.extensionReady = true;
  } else if (action.type === "open-task") {
    const task = action.task;
    if (!newState.loadedTasks.has(task.sessionId)) {
      newState.loadedTasks.set(task.sessionId, task);
    }
    newState.view = View.Task;
    newState.currentTask = task;
  }
  return newState;
}

export const initialState: AppState = {
  extensionReady: false,
  view: View.Task,
  currentTask: {
    sessionId: uniqueId(),
    context: [],
    cost: 0,
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReads: 0,
      cacheWrites: 0,
    },
    exchanges: [],
    preset: {
      provider: "anthropic",
      model: "claude-3-5-sonnet-20241022",
      apiKey: "exampleApiKey123",
      customBaseUrl: "https://api.anthropic.com",
      permissions: {
        readData: "ask",
        writeData: "ask",
      },
      customInstructions: "Answer as concisely as possible",
      name: "claude-sonnet-3.5",
    },
    responseOnGoing: false,
  },
  loadedTasks: new Map()
};

const App = () => {
  const [state, dispatch] = React.useReducer(reducer, initialState);
  const [isSidecarReady, setIsSidecarReady] = React.useState(false);

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent<Event>) => {
      dispatch(event.data);
    };
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  React.useEffect(() => {
    // handles messages from the extension
    const messageHandler = (event: MessageEvent) => {
      const message = event.data;

      // Only PanelProvider sends updateState messages
      if (message.command === 'updateState') {
        setIsSidecarReady(message.isSidecarReady);
      }
    };

    // listen for messages
    window.addEventListener('message', messageHandler);
    return () => window.removeEventListener('message', messageHandler);
  }, []);


  // piping the current state from the bridge
  React.useEffect(() => {
    // handles messages from the extension
    const messageHandler = (event: MessageEvent) => {
      const message = event.data;

      // Only PanelProvider sends updateState messages
      if (message.command === 'initial-state') {
        dispatch({
          initialAppState: message.initialAppState,
          type: 'initial-state',
        });
      }

      if (message.command === 'state-updated') {
        dispatch({
          type: 'task-update',
          currentTask: message.initialAppState.currentTask,
        });
      }
    };

    // listen for messages
    window.addEventListener('message', messageHandler);
    return () => window.removeEventListener('message', messageHandler);
  }, []);

  // loading spinner
  if (!isSidecarReady) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="flex flex-col items-center gap-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <p className="text-sm text-gray-600">Downloading and starting Sota PR Assistant...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full">
      {renderView(state)}
    </div>
  );
}

function renderView(state: AppState) {
  switch (state.view) {
    case "task":
      return <TaskView task={state.currentTask} onSubmit={(event) => onMessage(event, state.currentTask?.sessionId)} />;
    case View.Preset:
      return <PresetView onSubmit={onNewPreset} />
    default:
      return "View not implemented";
  }
}

export default App;
