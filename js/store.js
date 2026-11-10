/* Local-first data store.
 *
 * Everything is a "record": { id, type, date, t, del, d, ft? }
 *   type: 'stool' | 'vomit' | 'weight' | 'day' | 'cfg'
 *   t   : last-modified (ms). del: 1 = soft-deleted (so deletes sync).
 *   day/cfg records merge FIELD-BY-FIELD (ft = per-field timestamps) so two people
 *   editing different fields of the same day never overwrite each other.
 *   Other records are last-write-wins.
 */
const Store = (() => {
  const KEY = 'oakley.data.v1', LKEY = 'oakley.local.v1';
  const DEFAULT_CFG = { dog: 'Oakley', start: null, len: 30, food: 'Rachel Ray Nutrish Chicken', unit: 'lb',
    // slots: AM = breakfast (~8 AM), PM = dinner (~7 PM), DAY = once daily (time not set), PRN = as needed
    meds: [
      { id: 'prednisone', name: 'Prednisone', dose: '20mg 1.5 tablets', slots: ['DAY'], start: '', end: '' },
      { id: 'transform', name: 'Transform', dose: '50mg 2 tablets (twice daily)', slots: ['AM', 'PM'], start: '', end: '' },
      { id: 'metronidazole', name: 'Metronidazole', dose: '250mg 1 tablet (twice daily)', slots: ['AM', 'PM'], start: '', end: '' },
      { id: 'probiotic', name: 'Provable Probiotic sprinkle capsules', dose: '', slots: ['DAY'], start: '', end: '' },
      { id: 'fiber', name: 'Provable fiber supplement', dose: '', slots: ['DAY'], start: '', end: '' },
      { id: 'kelp', name: 'Sea kelp dental supplement', dose: '', slots: ['DAY'], start: '', end: '' }
    ] };
  let st = { records: {}, dirty: {} };
  let local = { user: '', url: '', token: '', theme: 'auto', lastSync: 0 };
  const listeners = [];

  function load() {
    try { Object.assign(st, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { }
    try { Object.assign(local, JSON.parse(localStorage.getItem(LKEY) || '{}')); } catch (e) { }
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(st)); }
    catch (e) { alert('Browser storage is full or blocked — export a backup now.'); }
  }
  const emit = kind => listeners.forEach(f => f(kind));
  const on = f => listeners.push(f);
  const stamp = prev => Math.max(Date.now(), (prev || 0) + 1);

  // ---- local-only settings (user name, sync URL/token, theme)
  const getLocal = () => local;
  function setLocal(p) { Object.assign(local, p); localStorage.setItem(LKEY, JSON.stringify(local)); emit('local'); }

  // ---- generic record ops
  function list(type) { return Object.values(st.records).filter(r => r.type === type && !r.del); }
  function get(id) { return st.records[id]; }
  function touch(rec, kind) {
    rec.t = stamp(rec.t); st.dirty[rec.id] = 1; persist(); emit(kind || 'edit');
  }
  function add(type, date, d) {
    const rec = { id: type + ':' + U.uid(), type, date, t: 0, del: 0, d };
    st.records[rec.id] = rec; touch(rec); return rec.id;
  }
  function update(id, patch) {
    const r = st.records[id]; if (!r) return;
    Object.assign(r.d, patch); if (patch.date) r.date = patch.date; touch(r);
  }
  function remove(id) { const r = st.records[id]; if (r) { r.del = 1; touch(r); } }
  function restore(id) { const r = st.records[id]; if (r) { r.del = 0; touch(r); } }

  // ---- field-merged records (day, cfg)
  function fieldRec(id, type, date) {
    return st.records[id] || (st.records[id] = { id, type, date, t: 0, del: 0, d: {}, ft: {} });
  }
  function setField(id, type, date, f, v, silent) {
    const r = fieldRec(id, type, date);
    r.d[f] = v; r.ft[f] = stamp(r.ft[f]); r.t = Math.max(r.t, r.ft[f]);
    st.dirty[id] = 1; persist(); emit(silent ? 'silent' : 'edit');
  }
  const day = date => (st.records['day:' + date] || {}).d || {};
  const setDay = (date, f, v, o = {}) => setField('day:' + date, 'day', date, f, v, o.silent);
  const cfg = () => Object.assign({}, DEFAULT_CFG, (st.records.cfg || {}).d || {});
  const setCfg = (f, v) => setField('cfg', 'cfg', '', f, v, false);
  const allDays = () => Object.values(st.records).filter(r => r.type === 'day' && !r.del);

  // ---- sync support
  const dirtyRecords = () => Object.keys(st.dirty).map(id => st.records[id]).filter(Boolean).map(r => JSON.parse(JSON.stringify(r)));
  function ackSent(sent) {
    sent.forEach(s => { const r = st.records[s.id]; if (r && r.t === s.t) delete st.dirty[s.id]; });
    persist();
  }
  function mergeRec(l, r) {
    if (!l) return r;
    if (l.type === 'day' || l.type === 'cfg') {
      const out = { id: l.id, type: l.type, date: l.date || r.date || '', del: 0, d: {}, ft: {}, t: Math.max(l.t, r.t) };
      const keys = new Set([...Object.keys(l.ft || {}), ...Object.keys(r.ft || {})]);
      [...keys].sort().forEach(k => {
        const lf = (l.ft || {})[k] || 0, rf = (r.ft || {})[k] || 0, src = lf >= rf ? l : r;
        out.d[k] = src.d[k]; out.ft[k] = Math.max(lf, rf);
      });
      return out;
    }
    return r.t > l.t ? r : l;
  }
  function mergeRemote(remote) {
    let changed = false;
    (remote || []).forEach(r => {
      if (!r || !r.id) return;
      r.del = r.del ? 1 : 0; r.d = r.d || {};
      const l = st.records[r.id], m = mergeRec(l, r);
      if (!l || U.canon(m) !== U.canon(l)) { st.records[r.id] = m; changed = true; }
      if (l && U.canon(m) !== U.canon(r)) st.dirty[r.id] = 1; // we hold newer info → push back
    });
    persist(); if (changed) emit('remote');
    return changed;
  }

  // ---- backup / restore
  const exportJSON = () => ({ app: 'oakley-trial', version: 1, exported: new Date().toISOString(), records: Object.values(st.records) });
  function importJSON(o) {
    if (!o || !Array.isArray(o.records)) throw new Error('Not a backup file');
    o.records.forEach(r => { if (r && r.id) st.dirty[r.id] = 1; });
    mergeRemote(o.records); persist(); emit('edit');
  }
  const stats = () => ({ records: Object.keys(st.records).length, pending: Object.keys(st.dirty).length });

  return { load, on, getLocal, setLocal, list, get, add, update, remove, restore, day, setDay, cfg, setCfg, allDays,
    dirtyRecords, ackSent, mergeRemote, exportJSON, importJSON, stats, DEFAULT_CFG };
})();
