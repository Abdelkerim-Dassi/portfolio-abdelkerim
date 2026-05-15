/* ── THEME TOGGLE ── */
(function () {
  const saved = localStorage.getItem('theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);

  document.querySelectorAll('.theme-toggle').forEach(b => {
    b.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
      window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: next } }));
    });
  });
})();

/* ── ACTIVE NAV LINK ── */
(function () {
  const path = location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll('.n-links a').forEach(a => {
    const href = a.getAttribute('href');
    if (!href) return;
    const norm = href.replace(/\.html$/, '').replace(/\/$/, '') || '/';
    if (norm === path || (norm !== '/' && path.startsWith(norm))) {
      a.classList.add('active');
    }
  });
})();

/* ── SCROLL REVEAL ── */
(function () {
  const els = document.querySelectorAll('.r');
  if (!els.length) return;

  // stagger list rows automatically
  document.querySelectorAll('.exp-row, .proj-row, .w-row, .cert, .skill-row').forEach((el, i) => {
    el.dataset.d = (i % 6) * 60;
  });
  document.querySelectorAll('.st').forEach((el, i) => {
    el.dataset.d = i * 80;
  });

  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const d = parseFloat(e.target.dataset.d || 0);
        e.target.style.transitionDelay = d + 'ms';
        e.target.classList.add('on');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.07 });

  els.forEach(el => io.observe(el));
})();

/* ── FOOTER YEAR ── */
(function () {
  document.querySelectorAll('.ft-l').forEach(el => {
    el.textContent = el.textContent.replace(/\d{4}/, new Date().getFullYear());
  });
})();

/* ── MOBILE NAV DRAWER ── */
(function () {
  const burger = document.querySelector('.nav-burger');
  if (!burger) return;
  burger.addEventListener('click', () => document.body.classList.toggle('nav-open'));
  document.addEventListener('click', e => {
    if (document.body.classList.contains('nav-open') &&
        !e.target.closest('.n-links') &&
        !e.target.closest('.nav-burger')) {
      document.body.classList.remove('nav-open');
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.body.classList.remove('nav-open');
  });
  document.querySelectorAll('.n-links a').forEach(a => {
    a.addEventListener('click', () => document.body.classList.remove('nav-open'));
  });
})();

/* ── BACK TO TOP ── */
(function () {
  const btn = document.getElementById('btt');
  if (!btn) return;
  window.addEventListener('scroll', () => {
    btn.classList.toggle('btt-visible', window.scrollY > 600);
  }, { passive: true });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
})();

/* ── READING PROGRESS BAR ── */
(function () {
  const bar = document.getElementById('reading-bar');
  if (!bar) return;
  window.addEventListener('scroll', () => {
    const pct = window.scrollY / (document.body.scrollHeight - window.innerHeight) * 100;
    bar.style.width = Math.min(pct, 100) + '%';
  }, { passive: true });
})();

/* ── TABLE OF CONTENTS ── */
(function () {
  const article = document.querySelector('.article');
  if (!article) return;
  const headings = article.querySelectorAll('h2');
  if (headings.length < 3) return;

  headings.forEach(h => {
    if (!h.id) {
      h.id = h.textContent.trim()
        .toLowerCase()
        .replace(/[^a-z0-9؀-ۿ]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }
  });

  const items = Array.from(headings).map(h =>
    `<a class="toc-link" href="#${h.id}">${h.textContent.trim()}</a>`
  ).join('');

  const toc = document.createElement('nav');
  toc.className = 'toc';
  toc.innerHTML = `<div class="toc-label">Contents</div><div class="toc-inner">${items}</div>`;
  article.before(toc);

  const mobileToc = document.createElement('details');
  mobileToc.className = 'toc-mobile';
  mobileToc.innerHTML = `<summary class="toc-mobile-label">Jump to section ↓</summary>${items}`;
  article.before(mobileToc);

  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        [toc, mobileToc].forEach(el => {
          el.querySelectorAll('.toc-link').forEach(l => l.classList.remove('active'));
          const active = el.querySelector(`.toc-link[href="#${e.target.id}"]`);
          if (active) active.classList.add('active');
        });
      }
    });
  }, { rootMargin: '-15% 0px -65% 0px' });

  headings.forEach(h => io.observe(h));
})();

/* ── SHARE COPY LINK ── */
(function () {
  document.querySelectorAll('.share-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(location.href).then(() => {
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 2000);
      });
    });
  });
})();

/* ── GITHUB CONTRIBUTION GRAPH ── */
(function () {
  const root = document.getElementById('gh-chart');
  if (!root) return;

  const USER = 'Abdelkerim-Dassi';
  const API = `https://github-contributions-api.jogruber.de/v4/${USER}?y=last`;
  const PALETTE = {
    dark:  ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
    light: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39']
  };
  const CELL = 11, GAP = 3, DAY_LABEL_W = 28, MONTH_LABEL_H = 18;
  const DAY_LABELS = { 1: 'Mon', 3: 'Wed', 5: 'Fri' };

  let cached = null;

  function colors() {
    const t = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    return PALETTE[t];
  }

  function buildWeeks(contributions) {
    if (!contributions.length) return [];
    const map = new Map(contributions.map(c => [c.date, c]));
    const first = new Date(contributions[0].date + 'T00:00:00');
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    const lastStr = contributions[contributions.length - 1].date;
    const end = new Date(lastStr + 'T00:00:00');

    const weeks = [];
    const cur = new Date(start);
    while (cur <= end) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, '0');
        const day = String(cur.getDate()).padStart(2, '0');
        const ds = `${y}-${m}-${day}`;
        if (cur >= first && cur <= end) {
          week.push(map.get(ds) || { date: ds, count: 0, level: 0 });
        } else {
          week.push(null);
        }
        cur.setDate(cur.getDate() + 1);
      }
      weeks.push(week);
    }
    return weeks;
  }

  function fmtTitle(day) {
    if (!day) return '';
    const d = new Date(day.date + 'T00:00:00');
    const dateStr = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const c = day.count;
    if (c === 0) return `No contributions on ${dateStr}`;
    return `${c} contribution${c === 1 ? '' : 's'} on ${dateStr}`;
  }

  function render() {
    const legend = document.getElementById('gh-legend');
    const totalEl = document.getElementById('gh-total');
    if (!cached) return;

    const weeks = buildWeeks(cached.contributions);
    const pal = colors();
    const w = DAY_LABEL_W + weeks.length * (CELL + GAP);
    const h = MONTH_LABEL_H + 7 * (CELL + GAP);

    let svg = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMinYMin meet" xmlns="http://www.w3.org/2000/svg">`;

    svg += `<g class="gh-months">`;
    let lastMonth = -1;
    weeks.forEach((week, i) => {
      const firstReal = week.find(d => d) || null;
      if (!firstReal) return;
      const dt = new Date(firstReal.date + 'T00:00:00');
      const mo = dt.getMonth();
      if (mo !== lastMonth && dt.getDate() <= 7) {
        const x = DAY_LABEL_W + i * (CELL + GAP);
        const name = dt.toLocaleString('en-US', { month: 'short' });
        svg += `<text x="${x}" y="${MONTH_LABEL_H - 6}">${name}</text>`;
        lastMonth = mo;
      }
    });
    svg += `</g>`;

    svg += `<g class="gh-days">`;
    Object.entries(DAY_LABELS).forEach(([di, label]) => {
      const y = MONTH_LABEL_H + Number(di) * (CELL + GAP) + CELL - 2;
      svg += `<text x="0" y="${y}">${label}</text>`;
    });
    svg += `</g>`;

    svg += `<g class="gh-cells">`;
    weeks.forEach((week, wi) => {
      week.forEach((day, di) => {
        if (!day) return;
        const x = DAY_LABEL_W + wi * (CELL + GAP);
        const y = MONTH_LABEL_H + di * (CELL + GAP);
        const fill = pal[day.level] || pal[0];
        svg += `<rect class="gh-cell" x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" ry="2" fill="${fill}"><title>${fmtTitle(day)}</title></rect>`;
      });
    });
    svg += `</g></svg>`;

    root.innerHTML = svg;

    if (legend) {
      legend.hidden = false;
      legend.querySelectorAll('.gh-legend-cell').forEach(el => {
        el.style.background = pal[Number(el.dataset.lvl)];
      });
    }

    if (totalEl && cached.total) {
      const t = cached.total.lastYear ?? Object.values(cached.total)[0];
      if (t != null) totalEl.textContent = `${t.toLocaleString()} contributions in the last year — synced live from GitHub.`;
    }
  }

  function showError() {
    root.innerHTML = `<div class="gh-error">Couldn't load live activity. <a href="https://github.com/${USER}" target="_blank" rel="noopener">View on GitHub</a></div>`;
  }

  async function load() {
    try {
      const res = await fetch(API + `&_=${Date.now()}`);
      if (!res.ok) throw new Error('http ' + res.status);
      cached = await res.json();
      render();
    } catch (e) {
      showError();
    }
  }

  window.addEventListener('themechange', render);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
