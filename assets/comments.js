(function () {
  const root = document.querySelector('[data-comments]');
  if (!root) return;

  const slug = root.getAttribute('data-comments');
  if (!slug || !/^[a-z0-9-]{1,80}$/.test(slug)) return;

  const list   = root.querySelector('.comments-list');
  const form   = root.querySelector('.comments-form');
  const status = root.querySelector('.comments-status');
  const submit = root.querySelector('.comments-submit');

  // the French blog posts load this same script; follow the page language
  const FR = document.documentElement.lang === 'fr';
  const T = FR ? {
    now: "à l'instant", m: n => `il y a ${n} min`, h: n => `il y a ${n} h`, d: n => `il y a ${n} j`, locale: 'fr-FR',
    empty: 'Aucun commentaire pour le moment. Soyez le premier.', loading: 'Chargement…',
    loadErr: 'Impossible de charger les commentaires. Actualisez la page.', name: 'Indiquez votre nom.',
    short: 'Commentaire trop court.', posting: 'Envoi…', failed: 'Une erreur est survenue.',
    posted: "Merci, c'est publié.", network: 'Erreur réseau. Réessayez.',
  } : {
    now: 'just now', m: n => n + 'm ago', h: n => n + 'h ago', d: n => n + 'd ago', locale: 'en-US',
    empty: 'No comments yet. Be the first.', loading: 'Loading…',
    loadErr: 'Could not load comments. Try refreshing.', name: 'Add your name.',
    short: 'Comment is too short.', posting: 'Posting…', failed: 'Something went wrong.',
    posted: 'Thanks, posted.', network: 'Network error. Try again.',
  };

  function escape(s) {
    const div = document.createElement('div');
    div.textContent = String(s ?? '');
    return div.innerHTML;
  }

  function fmt(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const now = new Date();
    const ms  = now - d;
    const min = Math.round(ms / 60000);
    if (min < 1)   return T.now;
    if (min < 60)  return T.m(min);
    const hr = Math.round(min / 60);
    if (hr < 24)   return T.h(hr);
    const day = Math.round(hr / 24);
    if (day < 30)  return T.d(day);
    return d.toLocaleDateString(T.locale, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function render(comments) {
    if (!comments.length) {
      list.innerHTML = '<div class="comments-empty">' + T.empty + '</div>';
      return;
    }
    list.innerHTML = comments.map(c => {
      const name = escape(c.name);
      const body = escape(c.body);
      const ts   = escape(fmt(c.ts));
      return `
        <div class="comment">
          <div class="comment-meta">
            <strong class="comment-name">${name}</strong>
            <span class="comment-time">${ts}</span>
          </div>
          <div class="comment-body">${body}</div>
        </div>
      `;
    }).join('');
  }

  function setStatus(text, kind) {
    status.textContent = text || '';
    status.classList.remove('ok', 'err');
    if (kind) status.classList.add(kind);
  }

  async function load() {
    list.innerHTML = '<div class="comments-loading">' + T.loading + '</div>';
    try {
      const r = await fetch('/api/comments?slug=' + encodeURIComponent(slug), { cache: 'no-store' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'load failed');
      render(data.comments || []);
    } catch (e) {
      list.innerHTML = '<div class="comments-error">' + T.loadErr + '</div>';
    } finally {
      list.setAttribute('aria-busy', 'false');
    }
  }

  async function post(e) {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = {
      slug,
      name: (fd.get('name') || '').toString(),
      body: (fd.get('body') || '').toString(),
      hp:   (fd.get('hp')   || '').toString(),
    };
    if (payload.name.trim().length < 1)   { setStatus(T.name, 'err'); return; }
    if (payload.body.trim().length < 5)   { setStatus(T.short, 'err'); return; }

    submit.disabled = true;
    setStatus(T.posting);
    try {
      const r = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) {
        setStatus(data.error || T.failed, 'err');
        return;
      }
      form.reset();
      setStatus(T.posted, 'ok');
      await load();
      setTimeout(() => setStatus(''), 2500);
    } catch (e) {
      setStatus(T.network, 'err');
    } finally {
      submit.disabled = false;
    }
  }

  form.addEventListener('submit', post);
  load();
})();
