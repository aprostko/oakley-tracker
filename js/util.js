/* Small helpers: dates (local, 'YYYY-MM-DD' strings), formatting, DOM builders. */
const U = (() => {
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = s => { const [a, b, c] = s.split('-').map(Number); return new Date(a, b - 1, c); };
  const add = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return fmt(d); };
  const diff = (a, b) => Math.round((parse(b) - parse(a)) / 864e5); // b - a in days
  const today = () => fmt(new Date());
  const nowTime = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const t12 = s => {
    if (!s) return '';
    const [h, m] = s.split(':').map(Number);
    return ((h + 11) % 12 + 1) + ':' + pad(m) + ' ' + (h < 12 ? 'AM' : 'PM');
  };
  const short = s => { const d = parse(s); return (d.getMonth() + 1) + '/' + d.getDate(); };
  const long = s => parse(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  // Stable stringify (sorted keys) for change detection
  const canon = o => JSON.stringify(o, (k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.keys(v).sort().reduce((a, key) => (a[key] = v[key], a), {}) : v);
  const nums = a => a.filter(x => x != null && x !== '' && !isNaN(x)).map(Number);
  const mean = a => { a = nums(a); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; };
  const n1 = (x, d = 1) => (x == null || isNaN(x)) ? '–' : (Math.round(x * 10 ** d) / 10 ** d).toFixed(d);
  const pct = x => x == null ? '–' : Math.round(x) + '%';

  // DOM builder. Text is always set via text nodes (synced data is never parsed as HTML).
  const SVGNS = 'http://www.w3.org/2000/svg';
  function kids(e, list) {
    for (const k of list.flat(Infinity)) {
      if (k == null || k === false) continue;
      e.append(k.nodeType ? k : document.createTextNode(String(k)));
    }
  }
  function h(tag, props, ...children) {
    const e = document.createElement(tag);
    for (const k in props || {}) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (['value', 'checked', 'disabled', 'selected'].includes(k)) e[k] = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    kids(e, children);
    return e;
  }
  function sv(tag, props, ...children) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in props || {}) if (props[k] != null) e.setAttribute(k, props[k]);
    kids(e, children);
    return e;
  }
  return { pad, fmt, parse, add, diff, today, nowTime, t12, short, long, uid, canon, mean, n1, pct, h, sv };
})();
const h = U.h, sv = U.sv;
