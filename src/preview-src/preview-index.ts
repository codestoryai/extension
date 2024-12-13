/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { onceDocumentLoaded } from './events';


declare const serviceWorkerPath: string;

/*fetch('./sw.js')
  .then((response) => response.text())
  .then((text) => {
    console.log('[sw] fetched sw.js', text);
    const blob = new Blob([text], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    navigator.serviceWorker.register(url);
  });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('./sw.js')
    .then(function (registration) {
      console.log('[sw] Service worker registered with scope:', registration.scope);
    })
    .catch(function (error) {
      console.log('[sw] Service worker registration failed:', error);
    });
}*/

const vscode = acquireVsCodeApi();

function getSettings() {
  const element = document.getElementById('simple-browser-settings');
  if (element) {
    const data = element.getAttribute('data-settings');
    if (data) {
      return JSON.parse(data);
    }
  }

  throw new Error(`Could not load settings`);
}

const settings = getSettings();

const browserIframe = document.querySelector('iframe#browser') as HTMLIFrameElement;

const rootNodeId = 'root';
const rootDomNode = document.getElementById(rootNodeId);
if (!rootDomNode) {
  throw new Error(`Root node with id '${rootNodeId} not found.`);
}

const header = document.querySelector('.header')!;
const input = header.querySelector<HTMLInputElement>('.url-input')!;
const forwardButton = header.querySelector<HTMLButtonElement>('.forward-button')!;
const backButton = header.querySelector<HTMLButtonElement>('.back-button')!;
const reloadButton = header.querySelector<HTMLButtonElement>('.reload-button')!;
const openExternalButton = header.querySelector<HTMLButtonElement>('.open-external-button')!;
const inspectorButton = header.querySelector<HTMLButtonElement>('.inspector-button')!;

let isInspectorMode = false;
let iframeReady = false;

// Add more comprehensive iframe load handling
browserIframe.addEventListener('load', () => {
  //console.log('Iframe load event fired');
  setTimeout(() => {
    iframeReady = true;
    //console.log('Iframe marked as ready');
  }, 500); // Give it a small delay to ensure content is loaded
});

window.addEventListener('message', (e) => {
  switch (e.data.type) {
    case 'focus': {
      browserIframe.focus();
      break;
    }
    case 'didChangeFocusLockIndicatorEnabled': {
      toggleFocusLockIndicatorEnabled(e.data.enabled);
      break;
    }
  }
});

onceDocumentLoaded(() => {
  setInterval(() => {
    const iframeFocused = document.activeElement?.tagName === 'IFRAME';
    document.body.classList.toggle('iframe-focused', iframeFocused);
  }, 50);

  browserIframe.addEventListener('load', () => {
    // Noop
  });

  input.addEventListener('change', (e) => {
    const url = (e.target as HTMLInputElement).value;
    navigateTo(url);
  });

  forwardButton.addEventListener('click', () => {
    history.forward();
  });

  backButton.addEventListener('click', () => {
    history.back();
  });

  openExternalButton.addEventListener('click', () => {
    vscode.postMessage({
      type: 'openExternal',
      url: input.value,
    });
  });

  // Add debug logging for inspector mode toggle
  inspectorButton.addEventListener('click', () => {
    isInspectorMode = !isInspectorMode;
    console.log('Inspector mode toggled:', isInspectorMode);
    document.body.classList.toggle('inspector-mode', isInspectorMode);
  });

  reloadButton.addEventListener('click', () => {
    // This does not seem to trigger what we want
    // history.go(0);

    // This incorrectly adds entries to the history but does reload
    // It also always incorrectly always loads the value in the input bar,
    // which may not match the current page if the user has navigated
    navigateTo(input.value);
  });

  // Add inspector overlay
  const inspectorOverlay = document.createElement('div');
  inspectorOverlay.className = 'inspector-overlay';
  document.querySelector('.content')!.appendChild(inspectorOverlay);

  inspectorOverlay.addEventListener('click', (e) => {
    console.log('Overlay clicked:', { isInspectorMode, iframeReady });

    if (!isInspectorMode || !iframeReady) {
      console.log('Inspector not ready:', { isInspectorMode, iframeReady });
      return;
    }

    const rect = browserIframe.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    console.log('Click coordinates:', { x, y, src: browserIframe.src });

    vscode.postMessage({
      type: 'inspectElement',
      payload: {
        coordinates: { x, y },
        url: browserIframe.src,
      },
    });

    e.preventDefault();
    e.stopPropagation();
  });

  navigateTo(settings.url);
  input.value = settings.displayUrl || settings.url;

  toggleFocusLockIndicatorEnabled(settings.focusLockIndicatorEnabled);

  function navigateTo(rawUrl: string): void {
    try {
      console.log('Navigating to:', rawUrl);
      iframeReady = false; // Reset ready state when navigating
      const url = new URL(rawUrl);

      // Try to bust the cache for the iframe
      // There does not appear to be any way to reliably do this except modifying the url
      url.searchParams.append('vscodeBrowserReqId', Date.now().toString());

      browserIframe.src = url.toString();
    } catch {
      browserIframe.src = rawUrl;
    }

    vscode.setState({ url: rawUrl, displayUrl: settings.displayUrl });
  }
});

function toggleFocusLockIndicatorEnabled(enabled: boolean) {
  document.body.classList.toggle('enable-focus-lock-indicator', enabled);
}

/**
 * API exposed to webviews.
 *
 * @template StateType Type of the persisted state stored for the webview.
 */
export interface WebviewApi<StateType> {
  /**
   * Post a message to the owner of the webview.
   *
   * @param message Data to post. Must be JSON serializable.
   */
  postMessage(message: unknown): void;

  /**
   * Get the persistent state stored for this webview.
   *
   * @return The current state or `undefined` if no state has been set.
   */
  getState(): StateType | undefined;

  /**
   * Set the persistent state stored for this webview.
   *
   * @param newState New persisted state. This must be a JSON serializable object. Can be retrieved
   * using {@link getState}.
   *
   * @return The new state.
   */
  setState<T extends StateType | undefined>(newState: T): T;
}

declare global {
  /**
   * Acquire an instance of the webview API.
   *
   * This may only be called once in a webview's context. Attempting to call `acquireVsCodeApi` after it has already
   * been called will throw an exception.
   *
   * @template StateType Type of the persisted state stored for the webview.
   */
  // tslint:disable-next-line:no-unnecessary-generics
  function acquireVsCodeApi<StateType = unknown>(): WebviewApi<StateType>;
}
