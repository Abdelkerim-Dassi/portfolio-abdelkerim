/**
 * Static build for abdelkerimdassi.com — Node stdlib only, no dependencies.
 *
 *   src/**.html  +  partials/*.html   ->   dist/**.html
 *
 * Does five things the hand-maintained site could not do reliably:
 *   1. expands <!--#include name--> so nav/footer/head live in one place
 *   2. stamps /assets/* URLs with a content hash, so `immutable` caching is safe
 *   3. pairs every English page with its French twin: <!--#include hreflang--> emits
 *      the alternate tags, {{ALT_HREF}} points the nav language switch at the twin
 *   4. generates sitemap.xml with real lastmod dates and xhtml:link alternates
 *   5. generates feed.xml / fr/feed.xml from the posts themselves, so they cannot drift
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

/** src/blog/arabic-rag.html -> /blog/arabic-rag  (index.html -> /, fr/index.html -> /fr) */
const routeOf = file => {
  const r =
    '/' +
    relative(SRC, file).replace(/\\/g, '/').replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '');
  return r === '/' ? r : r.replace(/\/$/, '');
};

const pick = (html, re) => (html.match(re) || [, ''])[1];

const xmlEscape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ── 1. locales ──────────────────────────────────────────── */

/**
 * The whole site exists twice. French slugs are the French search terms, so the
 * routes are not a mechanical /fr/<english-slug> mirror — this table is the only
 * place the pairing lives. Add a page to one column, add it to the other.
 */
const LOCALE_PAIRS = [
  ['/', '/fr'],
  ['/work', '/fr/projets'],
  ['/about', '/fr/a-propos'],
  ['/stack', '/fr/stack'],
  ['/writing', '/fr/articles'],
  ['/contact', '/fr/contact'],
  ['/resume', '/fr/cv'],
  ['/case-studies/arabic-rag', '/fr/etudes-de-cas/rag-arabe'],
  ['/case-studies/edge-cctv', '/fr/etudes-de-cas/videosurveillance-edge'],
  ['/blog/rag-in-production', '/fr/blog/rag-en-production'],
  ['/blog/pip-poetry-uv', '/fr/blog/pip-poetry-uv'],
  ['/blog/arabic-rag', '/fr/blog/rag-arabe'],
  ['/blog/jetson-orin-nano', '/fr/blog/jetson-orin-nano'],
];

const twinOf = new Map(LOCALE_PAIRS.flatMap(([en, fr]) => [[en, fr], [fr, en]]));
const localeOf = route => (route === '/fr' || route.startsWith('/fr/') ? 'fr' : 'en');

/** English is x-default: it is the version a Gulf or US client should land on. */
function hreflangTags(route) {
  const twin = twinOf.get(route);
  if (!twin) return '';
  const [en, fr] = localeOf(route) === 'en' ? [route, twin] : [twin, route];
  return [
    `<link rel="alternate" hreflang="en" href="${ORIGIN}${en}">`,
    `<link rel="alternate" hreflang="fr" href="${ORIGIN}${fr}">`,
    `<link rel="alternate" hreflang="x-default" href="${ORIGIN}${en}">`,
  ].join('\n');
}

/* ── 2. partials ─────────────────────────────────────────── */

const partials = Object.fromEntries(
  readdirSync(join(ROOT, 'partials'))
    .filter(f => f.endsWith('.html'))
    .map(f => [f.replace(/\.html$/, ''), readFileSync(join(ROOT, 'partials', f), 'utf8').replace(/\n$/, '')])
);

function expandIncludes(html, file, route) {
  return html.replace(/<!--#include ([\w-]+)-->/g, (_, name) => {
    // `hreflang` is not a file: it is computed per page from LOCALE_PAIRS.
    if (name === 'hreflang') return hreflangTags(route);
    if (!(name in partials)) throw new Error(`${relative(ROOT, file)}: unknown partial "${name}"`);
    return partials[name];
  });
}

/* ── 3. content-hash asset URLs ──────────────────────────── */

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

/* ── 4. page metadata (drives sitemap + feed) ────────────── */

function metaOf(file, html) {
  const route = routeOf(file);
  return {
    route,
    file,
    locale: localeOf(route),
    title: pick(html, /<meta property="og:title" content="([^"]*)"/) || pick(html, /<title>([^<]*)<\/title>/),
    description: pick(html, /<meta name="description" content="([^"]*)"/),
    // <time datetime="2026-05-09"> is the machine-readable publication date
    date: pick(html, /<time[^>]+datetime="(\d{4}-\d{2}-\d{2})"/),
    isPost: /^\/(?:fr\/)?blog\//.test(route),
    noindex: /<meta name="robots" content="[^"]*noindex/.test(html),
  };
}

const SITEMAP_PRIORITY = {
  '/': '1.0',
  '/fr': '1.0',
  '/contact': '0.9',
  '/fr/contact': '0.9',
  '/about': '0.9',
  '/fr/a-propos': '0.9',
  '/work': '0.9',
  '/fr/projets': '0.9',
  '/writing': '0.9',
  '/fr/articles': '0.9',
  '/case-studies/arabic-rag': '0.9',
  '/fr/etudes-de-cas/rag-arabe': '0.9',
};

function buildSitemap(pages) {
  const urls = pages
    .filter(p => !p.noindex)
    .sort((a, b) => a.route.localeCompare(b.route))
    .map(p => {
      const lastmod = p.date || statSync(p.file).mtime.toISOString().slice(0, 10);
      const priority = SITEMAP_PRIORITY[p.route] || (p.isPost ? '0.7' : '0.8');
      const twin = twinOf.get(p.route);
      // Both members of a pair must list both alternates, or Google ignores them.
      const alts = twin
        ? [p.route, twin]
            .map(r => `\n    <xhtml:link rel="alternate" hreflang="${localeOf(r)}" href="${ORIGIN}${r}"/>`)
            .join('')
        : '';
      return `  <url>\n    <loc>${ORIGIN}${p.route}</loc>${alts}\n    <lastmod>${lastmod}</lastmod>\n    <priority>${priority}</priority>\n  </url>`;
    });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;
}

const FEEDS = {
  en: {
    out: 'feed.xml',
    self: `${ORIGIN}/feed.xml`,
    link: `${ORIGIN}/writing`,
    title: 'Abdelkerim Dassi · Writing',
    description: 'Notes on shipping AI that actually goes live: RAG, agents, Spring AI / MCP.',
    language: 'en',
  },
  fr: {
    out: 'fr/feed.xml',
    self: `${ORIGIN}/fr/feed.xml`,
    link: `${ORIGIN}/fr/articles`,
    title: 'Abdelkerim Dassi · Articles',
    description: "Notes de terrain sur l'IA qui part vraiment en production : RAG, agents, Spring AI / MCP.",
    language: 'fr',
  },
};

function buildFeed(pages, locale) {
  const cfg = FEEDS[locale];
  const posts = pages
    .filter(p => p.isPost && p.date && p.locale === locale)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (!posts.length) console.warn(`  ! no dated ${locale} posts found — ${cfg.out} will be empty`);

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
  <title>${xmlEscape(cfg.title)}</title>
  <link>${cfg.link}</link>
  <description>${xmlEscape(cfg.description)}</description>
  <language>${cfg.language}</language>
  <atom:link href="${cfg.self}" rel="self" type="application/rss+xml"/>
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
  const route = routeOf(file);
  const raw = readFileSync(file, 'utf8');
  const html = stampAssets(expandIncludes(raw, file, route))
    // The nav language switch: to the twin when there is one, else to the other home.
    .replace(/\{\{ALT_HREF\}\}/g, twinOf.get(route) || (localeOf(route) === 'en' ? '/fr' : '/'));

  if (html.includes('{{')) console.warn(`  ! unreplaced token in ${relative(ROOT, file)}`);
  pages.push(metaOf(file, html));

  const out = join(DIST, relative(SRC, file));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
}

// Every pair must exist on disk, or hreflang points at a 404.
for (const [en, fr] of LOCALE_PAIRS) {
  for (const r of [en, fr]) {
    if (!pages.some(p => p.route === r)) console.warn(`  ! LOCALE_PAIRS lists ${r}, but no page builds to it`);
  }
}

// assets/og/template.html is the internal OG-card generator — never ship it
cpSync(join(ROOT, 'assets'), join(DIST, 'assets'), {
  recursive: true,
  filter: src => !src.split(/[\\/]/).slice(-3).join('/').endsWith('assets/og/template.html'),
});
for (const f of ['robots.txt', 'site.webmanifest']) cpSync(join(ROOT, f), join(DIST, f));

writeFileSync(join(DIST, 'sitemap.xml'), buildSitemap(pages));
for (const locale of Object.keys(FEEDS)) {
  const target = join(DIST, FEEDS[locale].out);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, buildFeed(pages, locale));
}

const byLocale = pages.reduce((a, p) => ({ ...a, [p.locale]: (a[p.locale] || 0) + 1 }), {});
console.log(`built ${pages.length} pages -> dist/  (en ${byLocale.en || 0}, fr ${byLocale.fr || 0})`);
console.log(`  ${[...hashes].filter(([, h]) => h).map(([p, h]) => `${p.split('/').pop()}?v=${h}`).join('  ')}`);
