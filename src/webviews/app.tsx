import * as React from 'react';
import { Outlet, useNavigation } from 'react-router-dom';
import { useNavigationFromExtension } from 'routes';
import { useSubmenuContext } from 'store/submenuContext';
import { AppState as AppStateType, ClientRequest, Event } from '../model';
import { ProgressIndicator } from 'components/progress-indicator';

function reducer(state: AppStateType, action: Event) {
  if (action.type !== 'task-terminals') {
    // console.log('action from extension', action);
  }
  const newState = structuredClone(state);

  if (action.type === 'react-devtools-status') {
    newState.reactDevtoolsReady = action.connected;
  }

  if (action.type === 'initial-state') {
    newState.activePreset = action.initialAppState.activePreset;
    newState.currentTask = action.initialAppState.currentTask;
    newState.reactDevtoolsReady = action.initialAppState.reactDevtoolsReady;
    return newState;
  }

  if (action.type === 'sidecar-ready-state') {
    newState.isSidecarReady = action.isSidecarReady;
  }

  if (action.type === 'init-response') {
    newState.extensionReady = true;
    newState.isSidecarReady = action.isSidecarReady;
  }

  if (action.type === 'sidecar-downloading') {
    newState.isSidecarDownloading = !action.complete;
  }

  if (action.type === 'workspace-folders') {
    newState.workspaceFolders = action.workspaceFolders;
  }

  return newState;
}

export const initialState: AppStateType = {
  extensionReady: false,
  reactDevtoolsReady: false,
  isSidecarReady: false, // this is extra
  isSidecarDownloading: false,
};

export const AppState = React.createContext<AppStateType>(initialState);
AppState.displayName = 'AppState';

const App = () => {
  useNavigationFromExtension();
  const navigation = useNavigation();

  const [state, dispatch] = React.useReducer(reducer, initialState);
  const initializeContextProviders = useSubmenuContext((state) => state.initializeContextProviders);
  const initializeSubmenuItems = useSubmenuContext((state) => state.initializeSubmenuItems);

  React.useEffect(() => {
    const initalize = async () => {
      await initializeContextProviders();
      await initializeSubmenuItems();
    };

    initalize();
  }, [initializeSubmenuItems, initializeContextProviders]);

  React.useEffect(() => {
    // fetches state from the extension

    const handleMessage = (event: MessageEvent<Event>) => {
      dispatch(event.data);
    };
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  return (
    <AppState.Provider value={state}>
      <div className="relative flex h-full flex-col overflow-hidden">
        {navigation.state === 'loading' && (
          <ProgressIndicator className="absolute inset-x-0 top-0 z-20" />
        )}
        {state.isSidecarReady ? (
          <Outlet />
        ) : state.isSidecarDownloading ? (
          <React.Fragment>
            <ProgressIndicator className="absolute inset-x-0 top-0 z-20" />
            <p className="mx-auto my-2 self-center text-center text-sm text-description">
              Downloading Sota PR Assistant...
            </p>
          </React.Fragment>
        ) : (
          <p className="mx-auto self-center text-center text-sm text-description">
            Starting Sota PR Assistant...
          </p>
        )}
      </div>
    </AppState.Provider>
  );
};

export default App;

declare global {
  interface Window {
    vscode: {
      postMessage(message: ClientRequest): void;
    };
  }

  const vscode: {
    postMessage(message: ClientRequest): void;
  };
}
