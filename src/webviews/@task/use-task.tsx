import * as React from 'react';
import { Event, Task } from '../../model';
import { ContextItemWithId } from '../..';

export enum Status {
  Idle = 'idle',
  Loading = 'loading',
  Success = 'success',
  Error = 'error',
}

type AsyncState<T> =
  | { status: Status.Idle; data: undefined }
  | { status: Status.Loading; data: undefined }
  | { status: Status.Success; data: T }
  | { status: Status.Error; data: undefined };

function getTask() {
  vscode.postMessage({
    type: 'init',
    newSession: false,
  });
}

export function useTask() {
  const [state, setState] = React.useState<AsyncState<{ task: Task }>>({
    status: Status.Idle,
    data: undefined,
  });

  React.useEffect(() => {
    setState({ data: undefined, status: Status.Loading });
    getTask();
  }, []);

  // Initial message event
  React.useEffect(() => {
    const handleMessage = (event: MessageEvent<Event>) => {
      if (event.data.type === 'init-response') {
        setState({ status: Status.Success, data: { task: event.data.task } });
        // console.log('sessionId', event.data.task.sessionId);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  // Added by Sandeep and Zi

  // piping the current state from the bridge
  React.useEffect(() => {
    // handles messages from the extension
    const messageHandler = (event: MessageEvent) => {
      const message = event.data;

      // Only PanelProvider sends updateState messages
      // if (message.command === 'initial-state') {
      //   dispatch({
      //     initialAppState: message.initialAppState,
      //     type: 'initial-state',
      //   });
      // }

      if (message.command === 'state-updated') {
        setState({ data: { task: message.initialAppState.currentTask }, status: Status.Success });
      }
    };

    // listen for messages
    window.addEventListener('message', messageHandler);
    return () => window.removeEventListener('message', messageHandler);
  }, []);

  function sendRequest(
    query: string,
    sessionId: string,
    variables: ContextItemWithId[],
    images: string[]
  ) {
    if (state.data) {
      const { preset } = state.data.task;

      vscode.postMessage({
        type: 'task-feedback',
        query,
        sessionId,
        variables,
        images,
        modelSelection: {
          model: preset.model,
          provider: {
            name: preset.provider,
            apiBase: preset.customBaseUrl,
            apiKey: preset.apiKey,
          },
        },
      });
    }
  }

  return Object.assign(state, { sendRequest });
}
