import * as http from 'http';
import httpProxy from 'http-proxy';
import { parse, parseFragment, defaultTreeAdapter, serialize } from "parse5";

const pageRegex = /^\.?\/([^.]*$|[^.]+\.html)$/;

const makeScript = (location: string) => `<script src="${location}"></script>`;

// Cleanup function to remove all listeners and close
// the server and proxy before retrying or failing.
function cleanup(
  proxy: httpProxy<http.IncomingMessage, http.ServerResponse<http.IncomingMessage>>,
  server: http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>
) {
  // Remove all listeners
  proxy.removeAllListeners();
  server.removeAllListeners();

  // Attempt to close the server and proxy. This ensures we free the port.
  try {
    server.close();
  } catch (e) {
    console.error(e);
  }

  try {
    proxy.close();
  } catch (e) {
    console.error(e);
  }
}

function pipeThrough(serverResponse: http.ServerResponse<http.IncomingMessage>, proxyResponse: http.IncomingMessage) {
  serverResponse.writeHead(proxyResponse.statusCode || 200, proxyResponse.headers);
  proxyResponse.pipe(serverResponse);
}

function startInterceptingDocument(proxy: httpProxy<http.IncomingMessage, http.ServerResponse<http.IncomingMessage>>, reactDevtoolsPort: number) {
  // Intercept the response
  proxy.on('proxyRes', (proxyRes, req, res) => {
    const bodyChunks: Uint8Array[] = [];

    proxyRes.on('data', (chunk) => {
      bodyChunks.push(chunk);
    });

    proxyRes.on('end', () => {
      const contentType = proxyRes.headers['content-type'] || '';
      const isHtml = contentType.toLowerCase().includes('text/html');
      const isPage = req.url && req.url.match(pageRegex);

      if (!isHtml || !isPage) {
        const buffer = Buffer.concat(bodyChunks);
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        res.end(buffer);
        return;
      }

      const originalBody = Buffer.concat(bodyChunks).toString('utf8');
      const document = parse(originalBody);
      const htmlNode = document.childNodes.find(node => node.nodeName === 'html');
      if (!htmlNode || !defaultTreeAdapter.isElementNode(htmlNode)) {
        console.log('No html node found');
        pipeThrough(res, proxyRes);
        return;
      }

      const headNode = htmlNode.childNodes.find(node => node.nodeName === 'head');
      if (!headNode || !defaultTreeAdapter.isElementNode(headNode)) {
        console.log('No head node found');
        pipeThrough(res, proxyRes);
        return;
      }

      const scriptFragment = parseFragment(makeScript(`http://localhost:${reactDevtoolsPort}`));
      const scriptNode = scriptFragment.childNodes[0];
      const firstChild = defaultTreeAdapter.getFirstChild(headNode);
      if (firstChild) {
        defaultTreeAdapter.insertBefore(headNode, scriptNode, firstChild);
      } else {
        defaultTreeAdapter.appendChild(headNode, scriptNode);
      }

      const modifiedBody = serialize(document);

      const headers = { ...proxyRes.headers };
      delete headers['transfer-encoding'];
      delete headers['content-encoding'];
      headers['content-length'] = Buffer.byteLength(modifiedBody).toString();

      (res as http.ServerResponse).writeHead(proxyRes.statusCode || 200, headers);
      (res as http.ServerResponse).end(modifiedBody);
    });
  });
}

export function proxy(port: number, reactDevtoolsPort = 8097) {
  const maxAttempts = 10;
  let attempt = 0;
  let listenPort = 8000;

  function tryListen(resolve: (port: number) => void, reject: (reason?: any) => void) {
    // Create a new proxy and server on each attempt
    const proxy = httpProxy.createProxyServer({
      target: `http://localhost:${port}`,
      selfHandleResponse: true,
    });

    const server = http.createServer((req, res) => {
      proxy.web(req, res);
    });

    // Handle proxy errors
    proxy.on('error', (err, _req, res) => {
      console.error('Proxy error:', err);
      if (res instanceof http.ServerResponse) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('An error occurred while processing the proxy request.');
      }
    });

    // Handle server "listening" event
    server.once('listening', () => {
      console.log(`Proxy server listening on port ${listenPort}`);
      startInterceptingDocument(proxy, reactDevtoolsPort);
      resolve(listenPort);
    });

    // Handle server "error" event (e.g., port in use)
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && attempt < maxAttempts) {
        // Cleanup current attempt
        cleanup(proxy, server);
        // Increment and retry
        attempt++;
        listenPort++;
        tryListen(resolve, reject);
      } else {
        // No more retries or different error
        cleanup(proxy, server);
        reject(err);
      }
    });

    server.listen(listenPort);
  }

  return new Promise(tryListen);
}
