import * as http from 'http';
import httpProxy from 'http-proxy';
import { parse, parseFragment, defaultTreeAdapter, serialize } from "parse5";

const pageRegex = /^\.?\/([^.]*$|[^.]+\.html)$/;

const makeScript = (location: string) => `<script src="${location}"></script>`;

export function proxy(port: number, reactDevtoolsPort = 8097): Promise<void> {
  const maxAttempts = 10;
  let attempt = 0;
  let listenPort = 8000;

  return new Promise<void>((resolve, reject) => {
    function tryListen() {
      // Create a new proxy and server on each attempt
      const proxy = httpProxy.createProxyServer({
        target: `http://localhost:${port}`,
        selfHandleResponse: true,
      });

      const server = http.createServer((req, res) => {
        proxy.web(req, res);
      });

      // Cleanup function to remove all listeners and close
      // the server and proxy before retrying or failing.
      function cleanup() {
        // Remove all listeners
        proxy.removeAllListeners();
        server.removeAllListeners();

        // Attempt to close the server and proxy. This ensures we free the port.
        try {
          server.close();
        } catch (e) {
          // Ignore errors during close
        }

        try {
          proxy.close();
        } catch (e) {
          // Ignore errors during close
        }
      }

      // Intercept the response
      proxy.on('proxyRes', (proxyRes, req, res) => {
        const bodyChunks: Uint8Array[] = [];

        function pipeThrough() {
          res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
          proxyRes.pipe(res);
        }

        proxyRes.on('data', (chunk) => {
          bodyChunks.push(chunk);
        });

        proxyRes.on('end', () => {
          const contentType = proxyRes.headers['content-type'] || '';
          const isHtml = contentType.toLowerCase().includes('text/html');
          const isPage = req.url && req.url.match(pageRegex);

          if (!isHtml || !isPage) {
            pipeThrough();
            return;
          }

          const originalBody = Buffer.concat(bodyChunks).toString('utf8');
          const document = parse(originalBody);
          const htmlNode = document.childNodes.find(node => node.nodeName === 'html');
          if (!htmlNode || !defaultTreeAdapter.isElementNode(htmlNode)) {
            console.log('No html node found');
            pipeThrough();
            return;
          }

          const headNode = htmlNode.childNodes.find(node => node.nodeName === 'head');
          if (!headNode || !defaultTreeAdapter.isElementNode(headNode)) {
            console.log('No head node found');
            pipeThrough();
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
          headers['content-length'] = Buffer.byteLength(modifiedBody).toString();

          (res as http.ServerResponse).writeHead(proxyRes.statusCode || 200, headers);
          (res as http.ServerResponse).end(modifiedBody);
        });
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
        resolve();
      });

      // Handle server "error" event (e.g., port in use)
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && attempt < maxAttempts) {
          // Cleanup current attempt
          cleanup();
          // Increment and retry
          attempt++;
          listenPort++;
          tryListen();
        } else {
          // No more retries or different error
          cleanup();
          reject(err);
        }
      });

      server.listen(listenPort);
    }

    tryListen();
  });
}
