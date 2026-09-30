import { pathToFileURL } from 'node:url';
import { createServer } from './room-server.js';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createServer().then(({ port }) => console.log(`Room server listening on port ${port}`))
    .catch(error => { console.error(error); process.exitCode = 1; });
}
