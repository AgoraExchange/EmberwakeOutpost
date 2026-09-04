import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const base = process.env.VITE_BASE_PATH || '/EmberwakeOutpost/';
const port = Number(process.argv[2] ?? 4177);
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.map': 'application/json; charset=utf-8'
};

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (!url.pathname.startsWith(base)) { response.writeHead(302, { Location: base }); response.end(); return; }
  const relative = decodeURIComponent(url.pathname.slice(base.length)) || 'index.html';
  let file = path.resolve(root, relative);
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) file = path.join(root, 'index.html');
  response.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
  createReadStream(file).pipe(response);
}).listen(port, '127.0.0.1', () => console.log(`Subpath preview: http://127.0.0.1:${port}${base}`));
