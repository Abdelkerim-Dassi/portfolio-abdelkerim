(function () {
  const root = document.querySelector('[data-comments]');
  if (!root) return;

  const slug = root.getAttribute('data-comments');
  if (!slug || !/^[a-z0-9-]{1,80}$/.test(slug)) return;

  const list   = root.querySelector('.comments-list');
  const form   = root.querySelector('.comments-form');
  const status = root.querySelector('.comments-status');
  const submit = root.querySelector('.comments-submit');

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
    if (min < 1)   return 'just now';
    if (min < 60)  return min + 'm ago';
    const hr = Math.round(min / 60);
    if (hr < 24)   return hr + 'h ago';
    const day = Math.round(hr / 24);
    if (day < 30)  return day + 'd ago';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function render(comments) {
    if (!comments.length) {
      list.innerHTML = '<div class="comments-empty">No comments yet — be the first.</div>';
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
    list.innerHTML = '<div class="comments-loading">Loading…</div>';
    try {
      const r = await fetch('/api/comments?slug=' + encodeURIComponent(slug), { cache: 'no-store' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'load failed');
      render(data.comments || []);
    } catch (e) {
      list.innerHTML = '<div class="comments-error">Could not load comments. Try refreshing.</div>';
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
    if (payload.name.trim().length < 1)   { setStatus('Add your name.', 'err'); return; }
    if (payload.body.trim().length < 5)   { setStatus('Comment is too short.', 'err'); return; }

    submit.disabled = true;
    setStatus('Posting…');
    try {
      const r = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) {
        setStatus(data.error || 'Something went wrong.', 'err');
        return;
      }
      form.reset();
      setStatus('Thanks — posted.', 'ok');
      await load();
      setTimeout(() => setStatus(''), 2500);
    } catch (e) {
      setStatus('Network error. Try again.', 'err');
    } finally {
      submit.disabled = false;
    }
  }

  form.addEventListener('submit', post);
  load();
})();
