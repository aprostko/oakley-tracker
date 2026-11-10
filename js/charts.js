/* Dependency-free SVG line/dot charts. Colours come from CSS classes so dark mode and print just work. */
const Charts = (() => {
  const W = 640, H = 230, L = 34, R = 12, T = 10, B = 26;

  /* o = { x:[startDate,endDate], y:[min,max], ticks:[..], bands:[{from,to,cls}],
           series:[{cls, line:bool, r:radius, points:[{date,y,title}]}], label } */
  function line(o) {
    const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': o.label || 'chart' });
    const [x0, x1] = o.x, nd = Math.max(1, U.diff(x0, x1)), [y0, y1] = o.y;
    const X = d => L + (U.diff(x0, d) / nd) * (W - L - R);
    const Y = v => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
    (o.bands || []).forEach(b => svg.append(sv('rect', { x: L, width: W - L - R, y: Y(b.to), height: Math.max(0, Y(b.from) - Y(b.to)), class: 'band ' + b.cls })));
    (o.ticks || []).forEach(t => svg.append(
      sv('line', { x1: L, x2: W - R, y1: Y(t), y2: Y(t), class: 'grid' }),
      sv('text', { x: L - 6, y: Y(t) + 4, class: 'axis', 'text-anchor': 'end' }, String(t))));
    for (let i = 0; i <= nd; i += nd > 35 ? 14 : 7) {
      const d = U.add(x0, i);
      svg.append(sv('line', { x1: X(d), x2: X(d), y1: H - B, y2: H - B + 4, class: 'grid' }),
        sv('text', { x: X(d), y: H - 8, class: 'axis', 'text-anchor': 'middle' }, U.short(d)));
    }
    let any = false;
    (o.series || []).forEach(s => {
      const pts = s.points.filter(p => p.y != null && p.date >= x0 && p.date <= x1).sort((a, b) => a.date.localeCompare(b.date));
      if (!pts.length) return; any = true;
      if (s.line && pts.length > 1) svg.append(sv('path', { d: pts.map((p, i) => (i ? 'L' : 'M') + X(p.date).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join(' '), class: 'ln ' + s.cls }));
      pts.forEach(p => svg.append(sv('circle', { cx: X(p.date).toFixed(1), cy: Y(p.y).toFixed(1), r: s.r || 3.5, class: 'dot ' + s.cls + (s.faint ? ' faint' : '') }, sv('title', {}, p.title || (U.short(p.date) + ': ' + U.n1(p.y))))));
    });
    if (!any) svg.append(sv('text', { x: W / 2, y: H / 2, class: 'axis', 'text-anchor': 'middle' }, 'No data yet'));
    return svg;
  }

  const stool = D => {
    const [a, b] = D.chartDomain();
    return line({
      label: 'Stool score over time', x: [a, b], y: [0.5, 7.5], ticks: [1, 2, 3, 4, 5, 6, 7],
      bands: [{ from: 2.5, to: 4.5, cls: 'good' }, { from: 5.5, to: 7.5, cls: 'bad' }],
      series: [
        { cls: 'c-faint', faint: true, r: 2.5, points: D.stools.map(s => ({ date: s.date, y: s.score, title: `${U.short(s.date)} ${U.t12(s.time)}: ${s.score} (${SCALE_NAME[s.score]})` })) },
        { cls: 'c1', line: true, points: [...new Set(D.stools.map(s => s.date))].map(d => ({ date: d, y: D.dayAvg(d), title: `${U.short(d)} daily average: ${U.n1(D.dayAvg(d))}` })) }]
    });
  };
  const rating = (D, key, label, cls) => {
    const [a, b] = D.chartDomain();
    return line({ label, x: [a, b], y: [0.5, 5.5], ticks: [1, 2, 3, 4, 5], series: [{ cls, line: true, points: Object.keys(D.days).map(d => ({ date: d, y: D.days[d][key] })) }] });
  };
  const weight = D => {
    const [a, b] = D.chartDomain(), v = D.weights.map(w => w.v);
    let lo = v.length ? Math.min(...v) : 0, hi = v.length ? Math.max(...v) : 1;
    const pad = Math.max(0.5, (hi - lo) * 0.2); lo = Math.floor((lo - pad) * 2) / 2; hi = Math.ceil((hi + pad) * 2) / 2;
    const step = (hi - lo) / 4;
    return line({ label: 'Weight', x: [a, b], y: [lo, hi], ticks: [0, 1, 2, 3, 4].map(i => +(lo + i * step).toFixed(1)),
      series: [{ cls: 'c3', line: true, points: D.weights.map(w => ({ date: w.date, y: w.v, title: `${U.short(w.date)}: ${U.n1(w.v)} ${D.cfg.unit}` })) }] });
  };
  return { line, stool, rating, weight };
})();
