/**
 * Static build for abdelkerimdassi.com — Node stdlib only, no dependencies.
 *
 *   src/**.html  +  partials/*.html   ->   dist/**.html
 *
 * Does four things the hand-maintained site could not do reliably:
 *   1. expands <!--#include name--> so nav/footer/head live in one place
 *   2. stamps /assets/* URLs with a content hash, so `immutable` caching is safe
 *   3. generates sitemap.xml with real lastmod dates
 *   4. generates feed.xml from the posts themselves, so it cannot drift
 */
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');
const ORIGIN = 'https://abdelkerimdassi.com';

/* ── helpers ─────────────────────────────────────────────── */

const walk = (dir, ext) =>
  readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p, ext) : p.endsWith(ext) ? [p] : [];
  });

/** src/blog/arabic-rag.html -> /blog/arabic-rag  (index.html -> /) */
const routeOf = file =>
  '/' + relative(SRC, file).replace(/\\/g, '/').replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '');

const pick = (html, re) => (html.match(re) || [, ''])[1];

const xmlEscape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ── 1. partials ─────────────────────────────────────────── */

const partials = Object.fromEntries(
  readdirSync(join(ROOT, 'partials'))
    .filter(f => f.endsWith('.html'))
    .map(f => [f.replace(/\.html$/, ''), readFileSync(join(ROOT, 'partials', f), 'utf8').replace(/\n$/, '')])
);

function expandIncludes(html, file) {
  return html.replace(/<!--#include ([\w-]+)-->/g, (_, name) => {
    if (!(name in partials)) throw new Error(`${relative(ROOT, file)}: unknown partial "${name}"`);
    return partials[name];
  });
}

/* ── 2. content-hash asset URLs ──────────────────────────── */

const hashes = new Map();
function assetHash(urlPath) {
  if (!hashes.has(urlPath)) {
    let h = '';
    try {
      h = createHash('md5').update(readFileSync(join(ROOT, urlPath.replace(/^\//, '')))).digest('hex').slice(0, 8);
    } catch {
      console.warn(`  ! missing asset referenced in HTML: ${urlPath}`);
    }
    hashes.set(urlPath, h);
  }
  return hashes.get(urlPath);
}

/** Only cache-bust code/style. Images are content-addressed by name already. */
const stampAssets = html =>
  html.replace(/(["'])(\/assets\/[\w./-]+\.(?:css|js))(?:\?v=[\w.]+)?\1/g, (m, q, p) => {
    const h = assetHash(p);
    return h ? `${q}${p}?v=${h}${q}` : m;
  });

/* ── 3. page metadata (drives sitemap + feed) ────────────── */

function metaOf(file, html) {
  return {
    route: routeOf(file),
    file,
    title: pick(html, /<meta property="og:title" content="([^"]*)"/) || pick(html, /<title>([^<]*)<\/title>/),
    description: pick(html, /<meta name="description" content="([^"]*)"/),
    // <time datetime="2026-05-09"> is the machine-readable publication date
    date: pick(html, /<time[^>]+datetime="(\d{4}-\d{2}-\d{2})"/),
    isPost: /^\/blog\//.test(routeOf(file)),
  };
}

const SITEMAP_PRIORITY = { '/': '1.0', '/work': '0.9', '/writing': '0.9', '/case-studies/arabic-rag': '0.9' };
const NOINDEX = new Set(['/404']);

function buildSitemap(pages) {
  const urls = pages
    .filter(p => !NOINDEX.has(p.route))
    .sort((a, b) => a.route.localeCompare(b.route))
    .map(p => {
      const lastmod = p.date || statSync(p.file).mtime.toISOString().slice(0, 10);
      const priority = SITEMAP_PRIORITY[p.route] || (p.isPost ? '0.7' : '0.8');
      return `  <url>\n    <loc>${ORIGIN}${p.route}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${priority}</priority>\n  </url>`;
    });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

function buildFeed(pages) {
  const posts = pages
    .filter(p => p.isPost && p.date)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (!posts.length) console.warn('  ! no dated posts found — feed.xml will be empty');

  const items = posts.map(p => {
    const pub = new Date(`${p.date}T09:00:00Z`).toUTCString();
    return `  <item>
    <title>${xmlEscape(p.title)}</title>
    <link>${ORIGIN}${p.route}</link>
    <guid isPermaLink="true">${ORIGIN}${p.route}</guid>
    <description>${xmlEscape(p.description)}</description>
    <pubDate>${pub}</pubDate>
  </item>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>Abdelkerim Dassi · Writing</title>
  <link>${ORIGIN}/writing</link>
  <description>Notes on shipping AI that actually goes live: RAG, agents, Spring AI / MCP.</description>
  <language>en</language>
  <atom:link href="${ORIGIN}/feed.xml" rel="self" type="application/rss+xml"/>
${items.join('\n')}
</channel>
</rss>
`;
}

/* ── run ─────────────────────────────────────────────────── */

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

const pages = [];

for (const file of walk(SRC, '.html')) {
  const raw = readFileSync(file, 'utf8');
  const html = stampAssets(expandIncludes(raw, file));
  pages.push(metaOf(file, html));

  const out = join(DIST, relative(SRC, file));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
}

// assets/og/template.html is the internal OG-card generator — never ship it
cpSync(join(ROOT, 'assets'), join(DIST, 'assets'), {
  recursive: true,
  filter: src => !src.split(/[\\/]/).slice(-3).join('/').endsWith('assets/og/template.html'),
});
for (const f of ['robots.txt', 'site.webmanifest']) cpSync(join(ROOT, f), join(DIST, f));

writeFileSync(join(DIST, 'sitemap.xml'), buildSitemap(pages));
writeFileSync(join(DIST, 'feed.xml'), buildFeed(pages));

console.log(`built ${pages.length} pages -> dist/`);
console.log(`  ${[...hashes].filter(([, h]) => h).map(([p, h]) => `${p.split('/').pop()}?v=${h}`).join('  ')}`);
