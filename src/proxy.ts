import * as http from 'http';
import httpProxy from 'http-proxy';
import { parse, parseFragment, defaultTreeAdapter, serialize } from "parse5";

const pageRegex = /^\.?\/([^.]*$|[^.]+\.html)$/;

const makeScript = (location: string) => `<script src="${location}"></script>`;

export function proxy(port: number, reactDevtoolsPort = 8097) {
  // Create a proxy server that forwards requests to http://localhost:3000
  // and allows us to handle the response before sending it to the client.
  const proxy = httpProxy.createProxyServer({
    target: `http://localhost:${port}`,
    selfHandleResponse: true, // Important for intercepting the response
  });

  // Create our proxy server on port 8000
  const server = http.createServer((req, res) => {
    // Forward the request to the target. The response will be intercepted in the 'proxyRes' event.
    proxy.web(req, res);
  });


  // Intercept the response
  proxy.on('proxyRes', (proxyRes, req, res) => {
    // We will collect the response body chunks here
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
        // If it's not HTML, just pipe the response through
        pipeThrough();
        return;
      }

      // Convert the collected chunks into a string
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

      // Set appropriate headers (consider content-type and content-length)
      // Copy original headers, but we may need to adjust content length after modification.
      // You can also copy from proxyRes if you want to preserve certain headers.
      const headers = { ...proxyRes.headers };

      console.log(modifiedBody);
      headers['content-length'] = Buffer.byteLength(modifiedBody).toString();

      // Write the headers and modified body to the response
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

  server.listen(8000, () => {
    console.log('Proxy server listening on port 8000');
  });
}