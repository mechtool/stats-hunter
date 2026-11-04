import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const root = process.argv[2] ?? 'dist/apps/frontend/browser';
const port = Number(process.argv[3] ?? 4200);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

async function tryRead(...paths) {
  for (const p of paths) {
    try {
      return await readFile(p);
    } catch {
      /* try next */
    }
  }
  return null;
}

createServer(async (req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const rel = urlPath.replace(/^\/+/, '');
  let body = null;

  if (urlPath === '/' || urlPath === '/index.html') {
    // SSG output keeps the CSR shell at index.csr.html
    body = await tryRead(join(root, 'index.csr.html'), join(root, 'index.html'));
  } else if (!extname(urlPath)) {
    // route path: prerendered <route>/index.html, then CSR shell fallback
    body = await tryRead(
      join(root, rel, 'index.html'),
      join(root, 'index.csr.html'),
      join(root, 'index.html'),
    );
  } else {
    body = await tryRead(join(root, rel));
  }

  if (!body) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }

  const ext = extname(urlPath).toLowerCase() || '.html';
  const type = MIME[ext] ?? 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  res.end(body);
}).listen(port, '0.0.0.0', () => {
  console.log(`app-template static server: http://localhost:${port}`);
});
