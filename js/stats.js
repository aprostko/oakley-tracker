/* Derived statistics. Pure functions over Store data. */
const SCALE = [
  [1, 'Liquid'], [2, 'Mostly liquid'], [3, 'Pudding'], [4, 'Soft formed'], [5, 'Normal'], [6, 'Firm'], [7, 'Too hard']
];
const SCALE_NAME = Object.fromEntries(SCALE);
const LBS = 2.20462;

const Stats = (() => {
  // Distance from the "normal" band (4–5). 0 = in band; liquid = 3.
  const dev = s => s < 4 ? 4 - s : s > 5 ? s - 5 : 0;
  const KEYS = ['appetite', 'energy', 'nausea', 'gas', 'discomfort'];

  function build() {
    const cfg = Store.cfg(), today = U.today();
    const stools = Store.list('stool').map(r => ({ id: r.id, date: r.date, ...r.d })).filter(s => s.score)
      .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
    const vomits = Store.list('vomit').map(r => ({ id: r.id, date: r.date, ...r.d }))
      .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
    const conv = w => w.unit === cfg.unit ? +w.value : (cfg.unit === 'lb' ? w.value * LBS : w.value / LBS);
    const weights = Store.list('weight').map(r => ({ id: r.id, date: r.date, ...r.d, v: conv(r.d) }))
      .filter(w => !isNaN(w.v)).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
    const days = {}; Store.allDays().forEach(r => days[r.date] = r.d);
    const byDate = {}; stools.forEach(s => (byDate[s.date] = byDate[s.date] || []).push(s));
    const vByDate = {}; vomits.forEach(v => (vByDate[v.date] = vByDate[v.date] || []).push(v));
    const wByDate = {}; weights.forEach(w => (wByDate[w.date] = wByDate[w.date] || []).push(w));

    const all = [...stools, ...vomits, ...weights].map(x => x.date).concat(Object.keys(days)).sort();
    const start = cfg.start || all[0] || today;
    const len = +cfg.len || 30, end = U.add(start, len - 1);
    const n = Math.max(0, Math.min(len, U.diff(start, today) + 1));
    const trialDates = Array.from({ length: n }, (_, i) => U.add(start, i));
    const D = { cfg, today, stools, vomits, weights, days, byDate, vByDate, wByDate, start, len, end, trialDates };

    D.dayNumber = date => U.diff(start, date) + 1;
    D.rangeStools = k => stools.filter(s => s.date >= U.add(today, -(k - 1)) && s.date <= today);
    D.dayAvg = date => U.mean((byDate[date] || []).map(s => s.score));
    D.hasData = date => !!((byDate[date] || []).length || (vByDate[date] || []).length || (wByDate[date] || []).length
      || Object.values(days[date] || {}).some(v => v != null && v !== ''));
    D.effFood = date => (days[date] && days[date].food != null) ? days[date].food : cfg.food;

    // consecutive days (ending today, or yesterday if nothing logged yet today) with ≥1 stool and none liquid (≤2)
    D.streak = () => {
      let d = today, c = 0;
      if (!(byDate[d] || []).length) d = U.add(d, -1);
      while (d >= start) {
        const s = byDate[d];
        if (!s || !s.length || s.some(x => x.score <= 2)) break;
        c++; d = U.add(d, -1);
      }
      return c;
    };
    D.best = () => stools.length ? stools.reduce((b, s) => dev(s.score) < dev(b.score) || (dev(s.score) === dev(b.score) && Math.abs(s.score - 4.5) < Math.abs(b.score - 4.5)) ? s : b) : null;
    D.worst = () => stools.length ? stools.reduce((w, s) => dev(s.score) > dev(w.score) || (dev(s.score) === dev(w.score) && Math.abs(s.score - 4.5) > Math.abs(w.score - 4.5)) ? s : w) : null;
    D.metrics = dates => metrics(D, dates);
    D.outcome = () => outcome(D);
    D.chartDomain = () => {
      const f = all.filter(d => d >= U.add(start, -30));
      return [f.length && f[0] < start ? f[0] : start, f.length && f[f.length - 1] > end ? f[f.length - 1] : end];
    };
    return D;
  }

  function metrics(D, dates) {
    const st = dates.flatMap(d => D.byDate[d] || []);
    const sc = st.map(s => s.score);
    const logged = dates.filter(d => D.hasData(d)).length;
    const o = {
      dates, stools: st.length, logged,
      avg: U.mean(sc),
      formed: sc.length ? 100 * sc.filter(s => s >= 4 && s <= 5).length / sc.length : null,
      liquid: sc.length ? 100 * sc.filter(s => s <= 2).length / sc.length : null,
      mdev: sc.length ? U.mean(sc.map(dev)) : null,
      perDay: logged ? st.length / logged : null,
      vomit: dates.reduce((a, d) => a + (D.vByDate[d] || []).length, 0)
    };
    o.vomit7 = dates.length ? o.vomit / dates.length * 7 : null;
    KEYS.forEach(k => o[k] = U.mean(dates.map(d => (D.days[d] || {})[k])));
    const g = dates.map(d => (D.days[d] || {}).good).filter(v => v === true || v === false);
    o.goodN = g.length; o.good = g.length ? 100 * g.filter(Boolean).length / g.length : null;
    return o;
  }

  const trend = (a, b, higherBetter, th) => {
    if (a == null || b == null) return 'n/a';
    const d = b - a; if (Math.abs(d) < th) return 'stable';
    return (d > 0) === higherBetter ? 'improving' : 'worsening';
  };

  function outcome(D) {
    const dates = D.trialDates, n = dates.length;
    if (n < 10) return { ready: false, reason: `Day ${n} of the trial. The Week 1 vs latest-week comparison unlocks on day 10 (needs at least 3 days after Week 1).` };
    const w1 = metrics(D, dates.slice(0, 7)), rc = metrics(D, dates.slice(Math.max(7, n - 7)));
    if (w1.stools < 3 || rc.stools < 3) return { ready: false, reason: 'Need at least 3 stools logged in both Week 1 and the latest 7 days.' };

    const imp = w1.mdev > 0 ? 100 * (w1.mdev - rc.mdev) / w1.mdev : null; // % reduction in distance from normal
    const stoolTrend = imp == null ? 'stable' : imp >= 10 ? 'improving' : imp <= -10 ? 'worsening' : 'stable';
    const wts = D.weights.filter(w => w.date >= D.start);
    const wFirst = wts[0], wLast = wts[wts.length - 1];
    const wChg = wts.length >= 2 ? wLast.v - wFirst.v : null;
    const wPct = wChg != null ? 100 * wChg / wFirst.v : null;
    const wTrend = wPct == null ? 'n/a' : Math.abs(wPct) < 2 ? 'stable' : wPct > 0 ? 'gaining' : 'losing';
    const T = {
      stool: stoolTrend,
      formed: trend(w1.formed, rc.formed, true, 10), liquid: trend(w1.liquid, rc.liquid, false, 10),
      perDay: trend(w1.perDay, rc.perDay, false, 0.5),
      appetite: trend(w1.appetite, rc.appetite, true, 0.3), energy: trend(w1.energy, rc.energy, true, 0.3),
      nausea: trend(w1.nausea, rc.nausea, false, 0.3), gas: trend(w1.gas, rc.gas, false, 0.3),
      discomfort: trend(w1.discomfort, rc.discomfort, false, 0.3),
      vomit: trend(w1.vomit7, rc.vomit7, false, 1), good: trend(w1.good, rc.good, true, 10), weight: wTrend
    };
    const u = U.n1, p = U.pct;
    const sentences = [];
    if (imp != null) sentences.push(`Compared to Week 1, stool consistency ${imp >= 0 ? 'improved' : 'worsened'} by ${Math.abs(Math.round(imp))}% (average score ${u(w1.avg)} → ${u(rc.avg)}; formed stools ${p(w1.formed)} → ${p(rc.formed)}; liquid stools ${p(w1.liquid)} → ${p(rc.liquid)}).`);
    else sentences.push(`Week 1 stools were already in the normal range (average ${u(w1.avg)}); latest week average is ${u(rc.avg)}.`);
    if (w1.appetite != null && rc.appetite != null) sentences.push(`Appetite: ${T.appetite} (${u(w1.appetite)} → ${u(rc.appetite)} of 5).`);
    if (w1.energy != null && rc.energy != null) sentences.push(`Energy: ${T.energy} (${u(w1.energy)} → ${u(rc.energy)} of 5).`);
    if (wChg != null) sentences.push(`Weight: ${T.weight} (${u(wFirst.v)} → ${u(wLast.v)} ${D.cfg.unit}; ${wChg >= 0 ? '+' : ''}${u(wChg)} ${D.cfg.unit}, ${wPct >= 0 ? '+' : ''}${u(wPct)}%).`);
    sentences.push(`Vomiting: ${w1.vomit} episode${w1.vomit === 1 ? '' : 's'} in Week 1 vs ${rc.vomit} in the latest 7 days (${T.vomit}).`);
    if (w1.good != null && rc.good != null) sentences.push(`"Good days": ${p(w1.good)} in Week 1 vs ${p(rc.good)} in the latest week.`);

    const worse = ['appetite', 'energy', 'nausea', 'gas', 'discomfort', 'vomit', 'good'].filter(k => T[k] === 'worsening');
    let verdict, level;
    if (stoolTrend === 'improving') {
      verdict = worse.length ? 'Mostly yes — stool is improving, but some signs are not' : 'Yes — Oakley is improving on Nutrish'; level = worse.length ? 'warn' : 'good';
    } else if (stoolTrend === 'worsening') { verdict = 'No — stool consistency is getting worse'; level = 'bad'; }
    else { verdict = 'No clear change yet'; level = 'warn'; }
    return { ready: true, w1, rc, T, imp, sentences, verdict, level, wFirst, wLast, wChg, wPct, worse };
  }

  return { build, dev, KEYS };
})();
