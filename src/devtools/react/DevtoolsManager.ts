// @ts-expect-error external
import Devtools from './dist/standalone.js';
import * as vscode from 'vscode';
import { proxy } from './proxy';
import { DevtoolsStatus, InspectedElementPayload } from './types';

export class ReactDevtoolsManager {
  private _onStatusChange = new vscode.EventEmitter<DevtoolsStatus>();
  onStatusChange = this._onStatusChange.event;

  private _onInspectedElementChange = new vscode.EventEmitter<InspectedElementPayload>();
  onInspectedElementChange = this._onInspectedElementChange.event;

  private _status: DevtoolsStatus = 'idle';
  get status() {
    return this._status;
  }

  private _insepectedElement: InspectedElementPayload | null = null;
  get inspectedElement() {
    return this._insepectedElement;
  }

  private _Devtools: Devtools;

  constructor() {
    this._Devtools = Devtools
      .setStatusListener(this.updateStatus.bind(this))
      .setDataCallback(this.updateInspectedElement.bind(this))
      .startServer(8097, 'localhost');
  }

  private updateStatus(_message: string, status: DevtoolsStatus) {
    this._status = status;
    console.log('Update from devtools ', status);
    this._onStatusChange.fire(status);
  }

  private updateInspectedElement(payload: InspectedElementPayload) {
    this._insepectedElement = payload;
    if (payload.type !== 'no-change') {
      console.log('inspected element', payload);
      this._onInspectedElementChange.fire(payload);
    }
  }

  proxy(port: number, reactDevtoolsPort = 8097) {
    if (this.status !== 'server-connected') {
      throw new Error('Devtools server is not connected, cannot proxy');
    }
    return proxy(port, reactDevtoolsPort);
  }

  startInspectingHost() {
    this._Devtools.startInspectingHost();
  }

  stopInspectingHost() {
    this._Devtools.stopInspectingHost();
  }
}

/*
 if (status === 'server-connected') {
        console.log('Devtools server connected', Devtools.currentPort);
        const proxyPort = await proxy(5173, Devtools.currentPort);
        console.log("Proxy server set up at ", proxyPort);
      } else if (status === 'devtools-connected') {
        console.log('Devtools connected');
        webviewView.webview.postMessage({
          type: 'react-devtools-connected',
          view: View.Task,
        });
      }
        */