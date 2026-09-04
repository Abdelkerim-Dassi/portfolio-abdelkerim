# Abdelkerim Dassi — Portfolio

Personal portfolio site for Abdelkerim Dassi, AI Engineer & Data Scientist.
Live at [abdelkerimdassi.com](https://abdelkerimdassi.com).

## Stack

- Hand-written HTML / CSS / JS — no framework, no bundler
- A ~160-line Node build script (stdlib only, zero dependencies)
- Two Vercel serverless functions (`api/ask.js`, `api/comments.js`)
- Hosted on Vercel, auto-deploys on push to `master`

## Layout

```
src/            the 13 pages you actually edit
partials/       nav, footer, head — shared across every page
assets/         css, js, fonts, images, og cards, vendored leaflet
api/            serverless functions (stay at the repo root)
build.mjs       src/ + partials/ -> dist/
dist/           build output, gitignored, what Vercel serves
```

## Local development

```bash
npm run build     # src/ + partials/ -> dist/
npm run preview   # build, then serve dist/ on localhost
npm run qa        # Playwright smoke suite (QA_BASE to point it somewhere)
```

There is a build step, so opening `src/index.html` directly will not work —
the `<!--#include ...-->` markers are only expanded by `build.mjs`.

## What the build does

1. **Expands `<!--#include name-->`** from `partials/`, so the nav and footer
   exist in exactly one place instead of being copy-pasted into every page.
2. **Stamps `/assets/*.css` and `*.js` with a content hash.** Those files are
   served `immutable, max-age=31536000`, so a hand-typed `?v=` that someone
   forgets to bump means visitors are stuck on a stale file forever.
3. **Generates `sitemap.xml`** from the pages that actually exist, with real
   `lastmod` dates.
4. **Generates `feed.xml`** from each post's `<time datetime="...">`, so the
   feed cannot drift from the posts.

Adding a page means dropping an `.html` file in `src/` — the sitemap picks it up
automatically. Adding a post additionally needs a `<time datetime="YYYY-MM-DD">`
in its `.blog-meta` line for the feed to include it.

## Environment

See `.env.example`. `OPENAI_API_KEY` and a linked Vercel KV store are what the
two API routes need; everything else has a default.

## Fonts

Self-hosted in `assets/fonts/` (latin + latin-ext only) so first paint never
waits on `fonts.googleapis.com`. To refresh them, re-fetch the `css2` URL noted
at the top of `assets/fonts/fonts.css` and re-run the download.
