/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import Bridge from 'react-devtools-shared/src/bridge';
import Store from 'react-devtools-shared/src/devtools/store';
import { getSavedComponentFilters } from 'react-devtools-shared/src/utils';
import { registerDevToolsEventLogger } from 'react-devtools-shared/src/registerDevToolsEventLogger';
import { Server } from 'ws';
import { join } from 'path';
import { readFileSync } from 'fs';
import { __DEBUG__, LOCAL_STORAGE_DEFAULT_TAB_KEY } from 'react-devtools-shared/src/constants';
import { localStorageSetItem } from 'react-devtools-shared/src/storage';

import type { FrontendBridge } from 'react-devtools-shared/src/bridge';

export type StatusTypes = 'server-connected' | 'devtools-connected' | 'error';
export type StatusListener = (message: string, status: StatusTypes) => void;
export type OnDisconnectedCallback = () => void;

let statusListener: StatusListener = (message: string, status?: StatusTypes) => {
  log('Status', message, status);
};
let disconnectedCallback: OnDisconnectedCallback = () => {};

function setStatusListener(value: StatusListener): typeof Devtools {
  statusListener = value;
  return Devtools;
}

function setDisconnectedCallback(value: OnDisconnectedCallback): typeof Devtools {
  disconnectedCallback = value;
  return Devtools;
}

let bridge: FrontendBridge | null = null;
let store: Store | null = null;

const log = (...args: Array<mixed>) => console.log('[React DevTools]', ...args);
log.warn = (...args: Array<mixed>) => console.warn('[React DevTools]', ...args);
log.error = (...args: Array<mixed>) => console.error('[React DevTools]', ...args);

function debug(methodName: string, ...args: Array<mixed>) {
  if (__DEBUG__) {
    console.log(
      `%c[core/standalone] %c${methodName}`,
      'color: teal; font-weight: bold;',
      'font-weight: bold;',
      ...args
    );
  }
}

let i = 0;

function reload() {
  console.log('reloading');

  if (!bridge || !store) {
    console.log('no bridge or store');
    return;
  }
  const localBridge = bridge;
  const localStore = store;

  // TODO (make sure to clean up)
  localBridge.send('startInspectingHost');
  localBridge.addListener('selectElement', (elementId) => {
    console.log('selected an element with id ', elementId);
    const rendererID = localStore.getRendererIDForElement(elementId);
    // const element = localStore.getElementByID(elementId);

    if (rendererID === null) {
      console.log('no renderer id');
      return;
    }

    const payload = {
      id: elementId,
      rendererID,
      requestID: i++,
      path: null,
      forceFullData: true,
    };
    console.log('will send payload', payload);
    localBridge.send('inspectElement', payload);
  });

  localBridge.addListener('inspectedElement', (...stuff) => {
    console.log('inspectElement', stuff);
  });
}

function onDisconnected() {
  disconnectedCallback();
}

function onError({ code, message }: $FlowFixMe) {
  if (code === 'EADDRINUSE') {
    console.error(
      'Another instance of DevTools is running. Only one copy of DevTools can be used at a time.'
    );
  } else {
    console.error(`Unknown error: ${message}`);
  }
}

function openProfiler() {
  // Mocked up bridge and store to allow the DevTools to be rendered
  bridge = new Bridge({ listen: () => {}, send: () => {} });
  store = new Store(bridge, {});

  // Ensure the Profiler tab is shown initially.
  localStorageSetItem(LOCAL_STORAGE_DEFAULT_TAB_KEY, JSON.stringify('profiler'));

  reload();
}

function initialize(socket: WebSocket) {
  const listeners = [];
  socket.onmessage = (event) => {
    let data;
    try {
      if (typeof event.data === 'string') {
        data = JSON.parse(event.data);

        if (__DEBUG__) {
          debug('WebSocket.onmessage', data);
        }
      } else {
        throw Error();
      }
    } catch (e) {
      log.error('Failed to parse JSON', event.data);
      return;
    }
    listeners.forEach((fn) => {
      try {
        fn(data);
      } catch (error) {
        log.error('Error calling listener', data);
        throw error;
      }
    });
  };

  bridge = new Bridge({
    listen(fn) {
      listeners.push(fn);
      return () => {
        const index = listeners.indexOf(fn);
        if (index >= 0) {
          listeners.splice(index, 1);
        }
      };
    },
    send(event: string, payload: any, transferable?: Array<any>) {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ event, payload }));
      }
    },
  });

  ((bridge: any): FrontendBridge).addListener('shutdown', () => {
    socket.close();
  });

  // $FlowFixMe[incompatible-call] found when upgrading Flow
  store = new Store(bridge, {
    checkBridgeProtocolCompatibility: true,
    supportsTraceUpdates: true,
    supportsClickToInspect: true,
  });

  log('Connected');
  statusListener('DevTools initialized.', 'devtools-connected');
  reload();
}

let startServerTimeoutID: TimeoutID | null = null;

function connectToSocket(socket: WebSocket): { close(): void } {
  socket.onerror = (err) => {
    onDisconnected();
    log.error('Error with websocket connection', err);
  };
  socket.onclose = () => {
    onDisconnected();
    log('Connection to RN closed');
  };
  initialize(socket);

  return {
    close: function () {
      onDisconnected();
    },
  };
}

type ServerOptions = {
  key?: string,
  cert?: string,
};

type LoggerOptions = {
  surface?: ?string,
};

function startServer(
  port: number = 8097,
  host: string = 'localhost',
  httpsOptions?: ServerOptions,
  loggerOptions?: LoggerOptions
): { close(): void } {
  registerDevToolsEventLogger(loggerOptions?.surface ?? 'standalone');

  const useHttps = !!httpsOptions;
  const httpServer = useHttps
    ? require('https').createServer(httpsOptions)
    : require('http').createServer();
  const server = new Server({ server: httpServer, maxPayload: 1e9 });
  let connected: WebSocket | null = null;
  server.on('connection', (socket: WebSocket) => {
    if (connected !== null) {
      connected.close();
      log.warn('Only one connection allowed at a time.', 'Closing the previous connection');
    }
    connected = socket;
    socket.onerror = (error) => {
      connected = null;
      onDisconnected();
      log.error('Error with websocket connection', error);
    };
    socket.onclose = () => {
      connected = null;
      onDisconnected();
      log('Connection to RN closed');
    };
    initialize(socket);
  });

  server.on('error', (event: $FlowFixMe) => {
    onError(event);
    log.error('Failed to start the DevTools server', event);
    startServerTimeoutID = setTimeout(() => startServer(port), 1000);
  });

  httpServer.on('request', (request: $FlowFixMe, response: $FlowFixMe) => {
    // Serve a file that immediately sets up the connection.
    const backendFile = readFileSync(join(__dirname, 'devtools/react/backend.js'));

    // The renderer interface doesn't read saved component filters directly,
    // because they are generally stored in localStorage within the context of the extension.
    // Because of this it relies on the extension to pass filters, so include them wth the response here.
    // This will ensure that saved filters are shared across different web pages.
    const savedPreferencesString = `
      window.__REACT_DEVTOOLS_COMPONENT_FILTERS__ = ${JSON.stringify(getSavedComponentFilters())};`;

    response.end(
      savedPreferencesString +
        '\n;' +
        backendFile.toString() +
        '\n;' +
        'ReactDevToolsBackend.initialize();' +
        '\n' +
        `ReactDevToolsBackend.connectToDevTools({port: ${port}, host: '${host}', useHttps: ${
          useHttps ? 'true' : 'false'
        }});
        `
    );
  });

  httpServer.on('error', (event: $FlowFixMe) => {
    onError(event);
    statusListener('Failed to start the server.', 'error');
    startServerTimeoutID = setTimeout(() => startServer(port), 1000);
  });

  httpServer.listen(port, () => {
    statusListener('The server is listening on the port ' + port + '.', 'server-connected');
  });

  return {
    close: function () {
      connected = null;
      onDisconnected();
      if (startServerTimeoutID !== null) {
        clearTimeout(startServerTimeoutID);
      }
      server.close();
      httpServer.close();
    },
  };
}

const Devtools = {
  connectToSocket,
  setStatusListener,
  setDisconnectedCallback,
  startServer,
  openProfiler,
};

export default Devtools;
