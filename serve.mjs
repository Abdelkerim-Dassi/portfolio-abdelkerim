/**
 * Local preview server for dist/ — mimics the vercel.json routing rules
 * (cleanUrls, trailingSlash:false, 404.html) so `npm run qa` exercises the
 * same URLs production serves. Node stdlib only.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = join(dirname(fileURLToPath(import.meta.url)), 'dist');
const PORT = Number(process.env.PORT || 3000);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

const exists = async p => { try { return (await stat(p)).isFile(); } catch { return false; } };

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);

  // trailingSlash: false
  if (path.length > 1 && path.endsWith('/')) {
    res.writeHead(308, { Location: path.slice(0, -1) });
    return res.end();
  }

  const rel = normalize(path).replace(/^([/\\])+/, '');
  const candidates = path === '/'
    ? ['index.html']
    : [rel, `${rel}.html`, join(rel, 'index.html')];   // cleanUrls

  for (const c of candidates) {
    const file = join(DIST, c);
    if (!file.startsWith(DIST)) break;                 // no traversal
    if (!(await exists(file))) continue;
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Content-Length': body.length,
      'X-Content-Type-Options': 'nosniff',
    });
    return res.end(body);
  }

  const notFound = join(DIST, '404.html');
  const body = (await exists(notFound)) ? await readFile(notFound) : Buffer.from('404');
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': body.length });
  res.end(body);
}).listen(PORT, () => console.log(`serving dist/ on http://localhost:${PORT}`));
