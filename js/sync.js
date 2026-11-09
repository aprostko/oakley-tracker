/* Optional sync with a Google Sheet via an Apps Script web app (see apps-script/Code.gs).
 * One POST per sync: sends our unsynced records, receives the full record set, merges.
 * Without a URL+token configured the app simply works locally. */
const Sync = (() => {
  let timer = null, busy = false, again = false, chain = 0;
  const status = { state: 'off', msg: 'Not connected (local only)', at: 0 };
  const subs = [];
  const set = (state, msg) => { status.state = state; status.msg = msg; if (state === 'ok') status.at = Date.now(); subs.forEach(f => f(status)); };

  async function run() {
    const { url, token } = Store.getLocal();
    if (!url || !token) return set('off', 'Not connected (local only)');
    if (busy) { again = true; return; }
    busy = true; set('syncing', 'Syncing…');
    try {
      const sent = Store.dirtyRecords();
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token, records: sent }) });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'Sync failed');
      Store.ackSent(sent);
      Store.mergeRemote(j.records);
      set('ok', 'Synced ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
      // merge produced data the server lacks (e.g. both phones edited the same day) → push it right away
      if (Store.stats().pending && chain < 3) { chain++; again = true; } else chain = 0;
    } catch (e) {
      set('error', navigator.onLine ? 'Sync error: ' + e.message : 'Offline — will sync later');
    } finally {
      busy = false;
      if (again) { again = false; schedule(chain ? 200 : 1500); }
    }
  }
  function schedule(ms = 1500) { clearTimeout(timer); timer = setTimeout(run, ms); }

  function init() {
    Store.on(k => { if (k === 'edit' || k === 'silent') schedule(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) run(); });
    window.addEventListener('online', run);
    setInterval(() => { if (!document.hidden) run(); }, 60000);
    run();
  }
  return { init, run, schedule, status, onStatus: f => subs.push(f) };
})();
