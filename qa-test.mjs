import { chromium } from 'playwright';

const BASE = process.env.QA_BASE || 'https://abdelkerimdassi.com';
const PAGES = ['/', '/about', '/work', '/stack', '/writing', '/contact', '/resume',
  '/blog/rag-in-production', '/blog/pip-poetry-uv', '/blog/arabic-rag',
  '/blog/jetson-orin-nano', '/case-studies/arabic-rag'];

const results = [];
const pass = (n) => results.push(['PASS', n]);
const fail = (n, d) => results.push(['FAIL', n + (d ? ` — ${d}` : '')]);

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  permissions: ['clipboard-read', 'clipboard-write'],
});

// ── per-page: console errors, failed requests, reveal animations, footer ──
for (const path of PAGES) {
  const page = await ctx.newPage();
  const errors = [], failedReqs = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('requestfailed', r => { if (!r.url().includes('linkedin')) failedReqs.push(`${r.url()} ${r.failure()?.errorText}`); });
  await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 45000 });

  errors.length ? fail(`${path} JS/console errors`, errors.slice(0, 3).join(' | ')) : pass(`${path} no JS errors`);
  failedReqs.length ? fail(`${path} failed requests`, failedReqs.slice(0, 3).join(' | ')) : pass(`${path} all requests ok`);

  // reveal: scroll through page, .r elements should get .on
  // ('instant' — the site sets scroll-behavior:smooth, which lags plain scrollTo)
  await page.evaluate(async () => {
    for (let y = 0; y <= document.body.scrollHeight; y += 500) { window.scrollTo({ top: y, behavior: 'instant' }); await new Promise(r => setTimeout(r, 60)); }
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' });
  });
  await page.waitForTimeout(400);
  const reveal = await page.evaluate(() => {
    const r = [...document.querySelectorAll('.r, .st')];
    return { total: r.length, on: r.filter(el => el.classList.contains('on')).length };
  });
  (reveal.total === 0 || reveal.on === reveal.total)
    ? pass(`${path} reveal animations (${reveal.on}/${reveal.total})`)
    : fail(`${path} reveal animations`, `${reveal.on}/${reveal.total} revealed`);

  // back-to-top (only appears past scrollY 600 — short pages can't reach it)
  const btt = await page.evaluate(() => {
    const b = document.getElementById('btt');
    const maxScroll = document.body.scrollHeight - window.innerHeight;
    return b ? { vis: b.classList.contains('btt-visible'), reachable: maxScroll > 650 } : null;
  });
  if (!btt) fail(`${path} back-to-top exists`);
  else if (!btt.reachable) pass(`${path} back-to-top n/a (page too short)`);
  else if (!btt.vis) fail(`${path} back-to-top visible after scroll`);
  else {
    await page.click('#btt');
    // smooth scroll on a long page can take >900ms — poll until it settles
    const y = await page.evaluate(() => new Promise(resolve => {
      const t0 = performance.now();
      (function check() {
        if (window.scrollY < 100 || performance.now() - t0 > 5000) return resolve(window.scrollY);
        setTimeout(check, 200);
      })();
    }));
    y < 100 ? pass(`${path} back-to-top scrolls up`) : fail(`${path} back-to-top scrolls up`, `scrollY=${y}`);
  }

  // footer links present
  const ftCount = await page.locator('footer .ft-r a').count();
  ftCount >= 4 ? pass(`${path} footer links (${ftCount})`) : fail(`${path} footer links`, `only ${ftCount}`);

  await page.close();
}

// ── homepage deep interactions ──
{
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });

  // theme toggle
  const t0 = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  await page.click('.theme-toggle');
  const t1 = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  t1 !== t0 ? pass(`theme toggle switches (${t0 ?? 'dark'} → ${t1})`) : fail('theme toggle', 'data-theme unchanged');
  await page.click('.theme-toggle');
  const t2 = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  t2 === t0 || (t0 === null && t2 === 'dark') ? pass('theme toggle switches back') : fail('theme toggle back', `now ${t2}`);

  // nav links hrefs
  for (const [text, href] of [['Home', '/'], ['Work', '/work'], ['Stack', '/stack'], ['Writing', '/writing'], ['Contact', '/contact']]) {
    const h = await page.getAttribute(`nav .n-links a:text-is("${text}")`, 'href');
    h === href ? pass(`nav link ${text} → ${href}`) : fail(`nav link ${text}`, `href=${h}`);
  }

  // ask widget: position bottom-right, open, chips, close, escape
  const fab = page.locator('#ask-fab');
  await fab.waitFor({ state: 'visible', timeout: 5000 });
  const box = await fab.boundingBox();
  (box.x > 640 && box.y > 450) ? pass(`ask fab bottom-right (x=${Math.round(box.x)}, y=${Math.round(box.y)})`) : fail('ask fab position', JSON.stringify(box));
  await fab.click();
  await page.waitForSelector('#ask-panel:not([hidden])', { timeout: 3000 }).then(() => pass('ask panel opens')).catch(() => fail('ask panel opens'));
  const greeting = await page.locator('.ask-msg').first().textContent();
  greeting.includes("I'm the AI") ? pass('ask greeting shown') : fail('ask greeting', greeting?.slice(0, 50));
  const chips = await page.locator('.ask-chip').count();
  chips === 3 ? pass('ask suggestion chips (3)') : fail('ask chips', `${chips}`);
  // panel styled (not raw text): has border + bg
  const styled = await page.evaluate(() => {
    const p = document.getElementById('ask-panel');
    const cs = getComputedStyle(p);
    return cs.position === 'absolute' && cs.borderTopWidth === '1px';
  });
  styled ? pass('ask panel CSS applied') : fail('ask panel CSS applied', 'computed style wrong — stale stylesheet?');
  // submit a question (expect answer OR our rate-limit message — both prove wiring)
  await page.fill('.ask-input', 'What stack does he use?');
  await page.click('.ask-send');
  await page.waitForFunction(() => {
    const msgs = [...document.querySelectorAll('.ask-msg.ask-assistant')];
    const last = msgs[msgs.length - 1];
    return last && last.textContent !== '…';
  }, { timeout: 30000 });
  const reply = await page.evaluate(() => [...document.querySelectorAll('.ask-msg.ask-assistant')].pop().textContent);
  (reply.length > 10) ? pass(`ask round-trip ok ("${reply.slice(0, 60)}…")`) : fail('ask round-trip', reply);
  await page.keyboard.press('Escape');
  const hidden = await page.evaluate(() => document.getElementById('ask-panel').hidden);
  hidden ? pass('ask panel closes on Escape') : fail('ask panel Escape close');
  await page.close();
}

// ── work page: leaflet map + project rows ──
{
  const page = await ctx.newPage();
  await page.goto(BASE + '/work', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.getElementById('map')?.scrollIntoView());
  await page.waitForTimeout(1500);
  const mapOk = await page.evaluate(() => document.querySelector('#map .leaflet-container, #map.leaflet-container') !== null);
  mapOk ? pass('work: leaflet map renders') : fail('work: leaflet map renders');
  const rows = await page.locator('a.proj-row').count();
  rows >= 5 ? pass(`work: project rows (${rows})`) : fail('work: project rows', `${rows}`);
  const cs = await page.getAttribute('a.proj-row[href="/case-studies/arabic-rag"]', 'href');
  cs ? pass('work: case-study row links to /case-studies/arabic-rag') : fail('work: case-study row link');
  await page.close();
}

// ── contact: calendly button ──
{
  const page = await ctx.newPage();
  await page.goto(BASE + '/contact', { waitUntil: 'networkidle' });
  const href = await page.getAttribute('.contact-cta a.btn', 'href');
  href === 'https://calendly.com/abdelkerimdassi/30min' ? pass('contact: calendly button href') : fail('contact: calendly href', href);
  const tgt = await page.getAttribute('.contact-cta a.btn', 'target');
  tgt === '_blank' ? pass('contact: calendly opens new tab') : fail('contact: calendly target', tgt);
  await page.close();
}

// ── blog: listen button + code copy ──
{
  const page = await ctx.newPage();
  await page.goto(BASE + '/blog/rag-in-production', { waitUntil: 'networkidle' });
  const listen = await page.locator('#listen-btn').count();
  listen ? pass('blog: listen button present') : fail('blog: listen button present');
  // code blocks live in the pip/poetry/uv post — rag-in-production has none
  await page.goto(BASE + '/blog/pip-poetry-uv', { waitUntil: 'networkidle' });
  const copyBtns = await page.locator('.code-copy').count();
  if (!copyBtns) fail('blog: code copy buttons injected');
  else {
    pass(`blog: code copy buttons (${copyBtns})`);
    await page.evaluate(() => document.querySelector('.code-copy').scrollIntoView({ block: 'center' }));
    await page.locator('.code-copy').first().click();
    await page.waitForTimeout(300);
    const label = await page.locator('.code-copy').first().textContent();
    label === 'Copied!' ? pass('blog: copy button copies') : fail('blog: copy button copies', `label="${label}"`);
  }
  await page.close();
}

// ── mobile viewport: burger menu + compact fab ──
{
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await mctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const burgerVisible = await page.locator('.nav-burger').isVisible();
  burgerVisible ? pass('mobile: burger visible') : fail('mobile: burger visible');
  if (burgerVisible) {
    await page.tap('.nav-burger');
    await page.waitForTimeout(400);
    const open = await page.evaluate(() => document.body.classList.contains('nav-open'));
    open ? pass('mobile: burger opens nav') : fail('mobile: burger opens nav');
    if (open) {
      // the drawer must be visible, on top (not covered by the scrim), and navigable
      const link = page.locator('#primary-nav a[href="/work"]');
      (await link.isVisible()) ? pass('mobile: drawer link visible') : fail('mobile: drawer link visible');
      const hit = await page.evaluate(() => {
        const a = document.querySelector('#primary-nav a[href="/work"]');
        const r = a.getBoundingClientRect();
        const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return el === a || a.contains(el);
      });
      hit ? pass('mobile: drawer link hit-testable') : fail('mobile: drawer link hit-testable', 'covered by overlay');
      await link.tap();
      await page.waitForURL('**/work', { timeout: 10000 })
        .then(() => pass('mobile: drawer link navigates'))
        .catch(() => fail('mobile: drawer link navigates', page.url()));
      // re-open on home and confirm outside tap still closes
      await page.goto(BASE + '/', { waitUntil: 'networkidle' });
      await page.tap('.nav-burger');
      await page.waitForTimeout(400);
      await page.touchscreen.tap(40, 700); // outside drawer — doc-level handler closes
      await page.waitForTimeout(400);
      const closed = await page.evaluate(() => !document.body.classList.contains('nav-open'));
      closed ? pass('mobile: nav closes on outside tap') : fail('mobile: nav closes on outside tap');
    }
  }
  const fabBox = await page.locator('#ask-fab').boundingBox();
  (fabBox && fabBox.x > 195) ? pass('mobile: ask fab bottom-right compact') : fail('mobile: ask fab position', JSON.stringify(fabBox));
  const labelHidden = await page.evaluate(() => getComputedStyle(document.querySelector('.ask-fab-label')).display === 'none');
  labelHidden ? pass('mobile: fab collapses to icon') : fail('mobile: fab label should hide');
  await page.tap('#ask-fab');
  await page.waitForTimeout(300);
  const panelFits = await page.evaluate(() => {
    const r = document.getElementById('ask-panel').getBoundingClientRect();
    return r.left >= 0 && r.right <= window.innerWidth + 1
        && r.top >= 0 && r.bottom <= window.innerHeight + 1;
  });
  panelFits ? pass('mobile: ask panel fits viewport') : fail('mobile: ask panel overflows');
  await page.close();
  await mctx.close();
}

// ── 375px: no horizontal overflow anywhere; /contact content reveals ──
{
  const m375 = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
  for (const path of PAGES) {
    const page = await m375.newPage();
    await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 45000 });
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ov <= 1 ? pass(`${path} @375 no h-overflow`) : fail(`${path} @375 h-overflow`, `${ov}px`);
    await page.close();
  }
  const page = await m375.newPage();
  await page.goto(BASE + '/contact', { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    for (let y = 0; y <= document.body.scrollHeight; y += 400) { window.scrollTo({ top: y, behavior: 'instant' }); await new Promise(r => setTimeout(r, 60)); }
  });
  await page.waitForTimeout(600);
  const visible = await page.evaluate(() => {
    const c = document.querySelector('.contact-cols');
    return c && getComputedStyle(c).opacity === '1';
  });
  visible ? pass('mobile: /contact content visible') : fail('mobile: /contact content visible', '.contact-cols stuck at opacity 0');
  await page.close();
  await m375.close();
}

await browser.close();

let failed = 0;
for (const [s, n] of results) { if (s === 'FAIL') failed++; console.log(`${s === 'PASS' ? '✓' : '✗ FAIL'} ${n}`); }
console.log(`\n${results.length - failed}/${results.length} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
