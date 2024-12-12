import fs from 'fs';
// @ts-expect-error external
import Devtools from 'cs-react-devtools-core/standalone.js';

export function startDevtools() {
  let options;
  try {
    if (process.env.KEY && process.env.CERT) {
      options = {
        key: fs.readFileSync(process.env.KEY),
        cert: fs.readFileSync(process.env.CERT),
      };
    }
  } catch (err) {
    console.error('Failed to process SSL options - ', err);
    options = undefined;
  }
  const host = process.env.HOST || 'localhost';
  const port = Number(process.env.PORT) || 8097;

  console.log(`Starting DevTools server on ${port}:${host}`);

  Devtools.startServer(port, host, options);
}