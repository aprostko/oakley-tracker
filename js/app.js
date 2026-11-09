/* App shell: tabs, rendering, theme, first-run, setup-link handling. */
const App = (() => {
  const VIEWS = { log: UI.viewLog, dash: UI.viewDash, outcome: UI.viewOutcome, timeline: UI.viewTimeline, more: UI.viewMore, report: UI.viewReport };
  const TABS = [['log', '📝', 'Log'], ['dash', '📊', 'Dashboard'], ['outcome', '🎯', 'Outcome'], ['timeline', '🗓', 'Timeline'], ['more', '⋯', 'More']];
  const A = { view: 'log', date: U.today(), week: 'all', pending: false };

  function render() {
    const ae = document.activeElement, view = document.getElementById('view');
    if (ae && view.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.type !== 'button') { A.pending = true; return; }
    A.pending = false;
    const y = window.scrollY;
    view.replaceChildren(VIEWS[A.view]());
    window.scrollTo(0, y);
    const D = Stats.build(), dn = D.dayNumber(D.today);
    document.getElementById('title').textContent = D.cfg.dog + (dn >= 1 ? ` · Day ${Math.min(dn, D.len)}/${D.len}` : '');
    document.getElementById('tabs').replaceChildren(...TABS.map(([k, ic, label]) =>
      h('button', { class: A.view === k || (k === 'more' && A.view === 'report') ? 'on' : '', onclick: () => show(k) }, h('span', {}, ic), h('small', {}, label))));
    document.body.dataset.view = A.view;
    paintSync();
  }
  function show(v) { A.view = v; location.hash = v; window.scrollTo(0, 0); A.pending = false; document.activeElement && document.activeElement.blur(); render(); }
  function go(date, view) { A.date = date; if (view) A.view = view; document.activeElement && document.activeElement.blur(); render(); window.scrollTo(0, 0); }

  function paintSync() {
    const s = Sync.status, el = document.getElementById('sync');
    el.className = 'sync ' + s.state; el.title = s.msg;
    el.textContent = { off: '○ local', syncing: '⟳ syncing', ok: '● synced', error: '⚠ sync' }[s.state];
  }
  function applyTheme() {
    const t = Store.getLocal().theme, r = document.documentElement;
    t === 'auto' ? r.removeAttribute('data-theme') : r.setAttribute('data-theme', t);
  }

  function firstRun() {
    if (Store.getLocal().user) return;
    const close = UI.modal('Who is logging on this device?', h('div', { class: 'stack' },
      h('p', { class: 'muted' }, 'Stored on this device only. Stool entries are tagged with this name.'),
      h('div', { class: 'btngrid' }, ['Andrew', 'Mary'].map(n => h('button', { class: 'btn primary', onclick: () => { Store.setLocal({ user: n }); close(); } }, n)))));
  }

  function init() {
    Store.load();
    // setup link: #cfg=<base64 {url,token}>
    if (location.hash.startsWith('#cfg=')) {
      try { const c = JSON.parse(atob(location.hash.slice(5))); Store.setLocal({ url: c.url, token: c.token }); } catch (e) { }
      history.replaceState(null, '', location.pathname);
    }
    const hv = location.hash.slice(1); if (VIEWS[hv]) A.view = hv;
    window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (VIEWS[v] && v !== A.view) { A.view = v; render(); } });
    Store.on(k => { if (k === 'local') applyTheme(); if (k === 'edit' || k === 'remote' || k === 'local') render(); });
    document.addEventListener('focusout', () => setTimeout(() => { if (A.pending) render(); }, 150));
    Sync.onStatus(paintSync);
    applyTheme(); render(); firstRun(); Sync.init();
    if ('serviceWorker' in navigator && /^https:|^http:\/\/localhost/.test(location.href)) navigator.serviceWorker.register('sw.js').catch(() => { });
  }
  Object.assign(A, { render, show, go, init });
  return A;
})();
document.addEventListener('DOMContentLoaded', App.init);
