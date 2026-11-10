/* UI building blocks + all views. Views return DOM elements; App re-renders on data change. */
const UI = (() => {
  // ---------- snackbar & modal
  let snackTimer;
  function snack(msg, actions = []) {
    const el = document.getElementById('snack');
    el.replaceChildren(h('span', {}, msg), ...actions.map(a => h('button', { onclick: () => { el.classList.remove('show'); a.fn(); } }, a.label)));
    el.classList.add('show'); clearTimeout(snackTimer);
    snackTimer = setTimeout(() => el.classList.remove('show'), 7000);
  }
  function modal(title, body) {
    const root = document.getElementById('modal');
    const close = () => root.replaceChildren();
    root.replaceChildren(h('div', { class: 'backdrop', onclick: e => { if (e.target === e.currentTarget) close(); } },
      h('div', { class: 'sheet', role: 'dialog' },
        h('div', { class: 'sheet-head' }, h('h3', {}, title), h('button', { class: 'x', onclick: close, 'aria-label': 'Close' }, '✕')), body)));
    return close;
  }

  // ---------- controls
  function seg(opts, value, onpick, cls = '') {
    return h('div', { class: 'seg ' + cls }, opts.map(([v, label]) =>
      h('button', { type: 'button', class: value === v ? 'on' : '', onclick: () => onpick(value === v ? null : v) }, label)));
  }
  function toggle(label, on, fn) { return h('button', { type: 'button', class: 'tog' + (on ? ' on' : ''), onclick: () => fn(!on) }, (on ? '✓ ' : '') + label); }
  const badge = n => h('span', { class: 'badge s' + n }, n);
  const field = (label, ...c) => h('label', { class: 'field' }, h('span', {}, label), ...c);
  const card = (title, ...c) => h('section', { class: 'card' }, title ? h('h2', {}, title) : null, ...c);

  // ---------- stool editor (full details)
  const COLORS = ['Brown', 'Dark brown', 'Yellow', 'Green', 'Orange', 'Gray/pale', 'Black/tarry', 'Red-streaked'];
  function editStool(id, defaults) {
    const rec = id && Store.get(id);
    const d = Object.assign({ time: U.nowTime(), score: null, urgency: null, mucus: false, blood: false, color: '', notes: '' }, rec ? rec.d : defaults);
    let close;
    const body = h('div', { class: 'stack' });
    const draw = () => body.replaceChildren(
      field('Time', h('input', { type: 'time', value: d.time || '', onchange: e => d.time = e.target.value })),
      h('div', { class: 'field' }, h('span', {}, 'Consistency'),
        h('div', { class: 'scale' }, SCALE.map(([n, l]) => h('button', { type: 'button', class: 'sbtn s' + n + (d.score === n ? ' sel' : ''), onclick: () => { d.score = n; draw(); } }, h('b', {}, n), h('small', {}, l))))),
      h('div', { class: 'field' }, h('span', {}, 'Urgency'), seg([['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], d.urgency, v => { d.urgency = v; draw(); })),
      h('div', { class: 'row-tog' }, toggle('Mucus', d.mucus, v => { d.mucus = v; draw(); }), toggle('Blood', d.blood, v => { d.blood = v; draw(); })),
      h('div', { class: 'field' }, h('span', {}, 'Color'),
        h('div', { class: 'chips' }, COLORS.map(c => h('button', { type: 'button', class: 'chip' + (d.color === c ? ' on' : ''), onclick: () => { d.color = d.color === c ? '' : c; draw(); } }, c))),
        h('input', { type: 'text', placeholder: 'Other color notes', value: COLORS.includes(d.color) ? '' : d.color, onchange: e => d.color = e.target.value.trim() })),
      field('Notes', h('textarea', { rows: 2, onchange: e => d.notes = e.target.value.trim(), value: d.notes || '' })),
      h('div', { class: 'btnrow' },
        rec ? h('button', { class: 'btn danger', onclick: () => { Store.remove(id); close(); snack('Stool deleted', [{ label: 'Undo', fn: () => Store.restore(id) }]); } }, 'Delete') : null,
        h('button', { class: 'btn primary', onclick: () => {
          if (!d.score) return snack('Pick a consistency score');
          if (rec) Store.update(id, d); else Store.add('stool', App.date, Object.assign(d, { by: Store.getLocal().user }));
          close();
        } }, 'Save')));
    draw(); close = modal(rec ? 'Edit stool' : 'Add stool (details)', body);
  }

  function editVomit(id) {
    const rec = Store.get(id); if (!rec) return;
    const d = Object.assign({}, rec.d); let close;
    close = modal('Vomiting episode', h('div', { class: 'stack' },
      field('Time', h('input', { type: 'time', value: d.time || '', onchange: e => d.time = e.target.value })),
      field('Notes (content, color, after eating?)', h('textarea', { rows: 3, value: d.notes || '', onchange: e => d.notes = e.target.value.trim() })),
      h('div', { class: 'btnrow' },
        h('button', { class: 'btn danger', onclick: () => { Store.remove(id); close(); snack('Episode deleted', [{ label: 'Undo', fn: () => Store.restore(id) }]); } }, 'Delete'),
        h('button', { class: 'btn primary', onclick: () => { Store.update(id, d); close(); } }, 'Save'))));
  }

  // ---------- medications checklist (Log tab)
  const SLOTS = [['AM', '☀️ Breakfast (~8 AM)'], ['PM', '🌙 Dinner (~7 PM)'], ['DAY', 'Once daily'], ['PRN', 'As needed']];
  function medsCard(D, date, day, user, isToday) {
    const groups = SLOTS.map(([slot, label]) => {
      const items = D.meds.filter(m => (m.slots || []).includes(slot) && D.medActive(m, date));
      return items.length ? { slot, label, items } : null;
    }).filter(Boolean);
    let exp = 0, got = 0;
    groups.filter(g => g.slot !== 'PRN').forEach(g => g.items.forEach(m => { exp++; if (day['med:' + m.id + ':' + g.slot]) got++; }));
    return card('💊 Medications & supplements' + (exp ? ` · ${got}/${exp} given` : ''),
      groups.length ? groups.map(g => h('div', { class: 'medgrp' }, h('h3', {}, g.label), g.items.map(m => {
        const key = 'med:' + m.id + ':' + g.slot, v = day[key];
        return h('button', { class: 'medrow' + (v ? ' on' : ''), onclick: () => Store.setDay(date, key, v ? null : { by: user, time: isToday ? U.nowTime() : '' }) },
          h('span', { class: 'chk' }, v ? '✓' : ''),
          h('span', { class: 'grow' }, h('b', {}, m.name), m.dose ? h('small', {}, m.dose) : null),
          v ? h('small', { class: 'who' }, (v.by || '') + (v.time ? ' · ' + U.t12(v.time) : '')) : null);
      }))) : h('p', { class: 'muted' }, 'No medications set up for this day. Add them under More → Medications.'));
  }

  // ---------- LOG view
  const RATINGS = [
    ['appetite', 'Appetite', '1 none · 5 eager'], ['energy', 'Energy', '1 lethargic · 5 normal'],
    ['nausea', 'Nausea signs', '1 none · 5 severe'], ['gas', 'Gas', '1 none · 5 severe'], ['discomfort', 'Abdominal discomfort', '1 none · 5 severe']];
  const q = { urg: null, mucus: false, blood: false, time: null };

  function viewLog() {
    const D = Stats.build(), date = App.date, cfg = D.cfg, day = Store.day(date), isToday = date === D.today;
    const user = Store.getLocal().user;
    const root = h('div', { class: 'stack' });

    if (!cfg.start) {
      let sd = D.today;
      root.append(card('Start the trial', h('p', { class: 'muted' }, 'Day 1 of the diet trial:'),
        h('div', { class: 'btnrow' }, h('input', { type: 'date', value: sd, onchange: e => sd = e.target.value }),
          h('button', { class: 'btn primary', onclick: () => Store.setCfg('start', sd) }, 'Set start date'))));
    }

    // date navigator
    const dn = D.dayNumber(date);
    root.append(h('div', { class: 'datenav' },
      h('button', { class: 'btn', onclick: () => App.go(U.add(date, -1)), 'aria-label': 'Previous day' }, '◀'),
      h('div', { class: 'dn' }, h('b', {}, isToday ? 'Today' : U.long(date)), h('small', {}, (isToday ? U.long(date) + ' · ' : '') + (dn >= 1 && dn <= D.len ? `Trial day ${dn} of ${D.len}` : dn < 1 ? 'Before trial' : 'After trial'))),
      h('button', { class: 'btn', onclick: () => App.go(U.add(date, 1)), 'aria-label': 'Next day' }, '▶'),
      !isToday ? h('button', { class: 'btn small', onclick: () => App.go(D.today) }, 'Today') : null));

    // quick stool
    const stoolsToday = D.byDate[date] || [];
    const quick = n => {
      const time = q.time || (isToday ? U.nowTime() : '12:00');
      const id = Store.add('stool', date, { time, score: n, urgency: q.urg, mucus: q.mucus, blood: q.blood, color: '', notes: '', by: user });
      Object.assign(q, { urg: null, mucus: false, blood: false, time: null });
      snack(`Logged ${n} · ${SCALE_NAME[n]} · ${U.t12(time)}`, [{ label: 'Details', fn: () => editStool(id) }, { label: 'Undo', fn: () => Store.remove(id) }]);
    };
    root.append(card('💩 Log a stool — tap the score',
      h('div', { class: 'quickmods' },
        q.time ? h('span', { class: 'chip on timechip' }, '🕒', h('input', { type: 'time', value: q.time, onchange: e => { q.time = e.target.value || null; } }), h('button', { class: 'x', onclick: () => { q.time = null; App.render(); } }, '✕'))
          : h('button', { class: 'chip', onclick: () => { q.time = isToday ? U.nowTime() : '12:00'; App.render(); } }, '🕒 ' + (isToday ? 'Now' : 'Set time')),
        seg([['low', 'Urgent: low'], ['medium', 'med'], ['high', 'HIGH']], q.urg, v => { q.urg = v; App.render(); }, 'inline'),
        toggle('Mucus', q.mucus, v => { q.mucus = v; App.render(); }), toggle('Blood', q.blood, v => { q.blood = v; App.render(); })),
      h('div', { class: 'scale' }, SCALE.map(([n, l]) => h('button', { class: 'sbtn s' + n, onclick: () => quick(n) }, h('b', {}, n), h('small', {}, l))),
        h('button', { class: 'sbtn more', onclick: () => editStool(null, { time: q.time || U.nowTime(), urgency: q.urg, mucus: q.mucus, blood: q.blood }) }, h('b', {}, '✎'), h('small', {}, 'Details'))),
      stoolsToday.length ? h('div', { class: 'list' }, stoolsToday.map(s => h('button', { class: 'row', onclick: () => editStool(s.id) },
        h('span', { class: 'time' }, U.t12(s.time)), badge(s.score), h('span', { class: 'grow' }, SCALE_NAME[s.score]),
        s.urgency ? h('span', { class: 'tag' }, 'urg ' + s.urgency) : null, s.mucus ? h('span', { class: 'tag warn' }, 'mucus') : null, s.blood ? h('span', { class: 'tag bad' }, 'blood') : null,
        s.color || s.notes ? h('span', { class: 'tag' }, '✎') : null))) : h('p', { class: 'muted' }, 'No stools logged for this day.')));

    root.append(medsCard(D, date, day, user, isToday));

    // good day
    root.append(card('Was this a good day?', h('div', { class: 'seg big' },
      h('button', { class: day.good === true ? 'on yes' : '', onclick: () => Store.setDay(date, 'good', day.good === true ? null : true) }, '👍 Yes'),
      h('button', { class: day.good === false ? 'on no' : '', onclick: () => Store.setDay(date, 'good', day.good === false ? null : false) }, '👎 No'))));

    // ratings
    root.append(card('Daily ratings', RATINGS.map(([k, label, hint]) => h('div', { class: 'rate' },
      h('div', { class: 'rl' }, h('b', {}, label), h('small', {}, hint)),
      h('div', { class: 'seg five' }, [1, 2, 3, 4, 5].map(n => h('button', { class: day[k] === n ? 'on' : '', onclick: () => Store.setDay(date, k, day[k] === n ? null : n) }, n)))))));

    // vomiting
    const vs = D.vByDate[date] || [];
    root.append(card('Vomiting' + (vs.length ? ` · ${vs.length} today` : ''),
      h('button', { class: 'btn wide', onclick: () => { const id = Store.add('vomit', date, { time: isToday ? U.nowTime() : '12:00', notes: '', by: user }); snack('Vomiting episode logged', [{ label: 'Details', fn: () => editVomit(id) }, { label: 'Undo', fn: () => Store.remove(id) }]); } }, '＋ Log vomiting episode (now)'),
      vs.length ? h('div', { class: 'list' }, vs.map(v => h('button', { class: 'row', onclick: () => editVomit(v.id) }, h('span', { class: 'time' }, U.t12(v.time)), h('span', { class: 'grow' }, v.notes || 'No notes')))) : null));

    // weight
    const ws = D.wByDate[date] || []; let wv = '';
    root.append(card('Weight (' + cfg.unit + ')',
      h('div', { class: 'btnrow' }, h('input', { type: 'number', step: '0.1', inputmode: 'decimal', placeholder: 'e.g. 62.4', onchange: e => wv = e.target.value }),
        h('button', { class: 'btn primary', onclick: () => { if (!wv || isNaN(wv)) return snack('Enter a weight'); Store.add('weight', date, { value: +wv, unit: cfg.unit, time: U.nowTime(), by: user }); } }, 'Save')),
      ws.length ? h('div', { class: 'list' }, ws.map(w => h('div', { class: 'row static' }, h('span', { class: 'time' }, U.t12(w.time)), h('b', { class: 'grow' }, U.n1(w.v) + ' ' + cfg.unit),
        h('button', { class: 'x', onclick: () => { Store.remove(w.id); snack('Weight deleted', [{ label: 'Undo', fn: () => Store.restore(w.id) }]); } }, '✕')))) : null));

    // diet
    const txt = (f, label, ph, none) => {
      const val = day[f] != null ? day[f] : (f === 'food' ? cfg.food : '');
      const inp = h('input', { type: 'text', placeholder: ph || '', value: val, onchange: e => Store.setDay(date, f, e.target.value.trim(), { silent: true }) });
      return field(label, inp, none ? h('div', { class: 'chips' }, h('button', { class: 'chip' + (day[f] === 'None' ? ' on' : ''), onclick: () => Store.setDay(date, f, day[f] === 'None' ? '' : 'None') }, 'None')) : null);
    };
    root.append(card('Diet & meds',
      txt('food', 'Food fed', 'Rachel Ray Nutrish Chicken'), txt('amount', 'Amount fed', 'e.g. 1 cup AM + 1 cup PM'),
      h('div', { class: 'field' }, h('span', {}, 'Wet or dry'), seg([['dry', 'Dry'], ['wet', 'Wet'], ['both', 'Both']], day.form || null, v => Store.setDay(date, 'form', v))),
      txt('treats', 'Treats given', 'what / how many', true), txt('nonapproved', 'Non-approved foods eaten', 'table scraps, stolen food…', true),
      txt('meds', 'Other meds / supplements (non-routine)', 'name + dose'), field('Notes', h('textarea', { rows: 2, value: day.notes || '', onchange: e => Store.setDay(date, 'notes', e.target.value.trim(), { silent: true }) }))));
    return root;
  }

  // ---------- DASHBOARD
  const stat = (label, value, sub, cls = '') => h('div', { class: 'stat ' + cls }, h('small', {}, label), h('b', {}, value), sub ? h('small', { class: 'sub' }, sub) : null);
  function viewDash() {
    const D = Stats.build(), avg = k => U.mean(D.rangeStools(k).map(s => s.score));
    const best = D.best(), worst = D.worst(), allAvg = U.mean(D.stools.map(s => s.score));
    const root = h('div', { class: 'stack' });
    root.append(card('Current trend — average stool score',
      h('div', { class: 'stats three' }, [7, 14, 30].map(k => stat('Last ' + k + ' days', U.n1(avg(k)), D.rangeStools(k).length + ' stools'))),
      h('p', { class: 'muted small' }, 'Target is 4–5. Under 3 = liquid.')));
    root.append(h('div', { class: 'stats grid' },
      stat('Days without liquid stool', D.streak(), 'consecutive', D.streak() >= 3 ? 'good' : ''),
      stat('Average stool score', U.n1(allAvg), D.stools.length + ' stools total'),
      stat('Best stool', best ? best.score : '–', best ? SCALE_NAME[best.score] + ' · ' + U.short(best.date) : ''),
      stat('Worst stool', worst ? worst.score : '–', worst ? SCALE_NAME[worst.score] + ' · ' + U.short(worst.date) : ''),
      stat('Vomiting incidents', D.vomits.length, 'total', D.vomits.length ? 'warn' : '')));
    root.append(card('Stool score over time', Charts.stool(D), h('p', { class: 'legend small muted' }, 'Line = daily average · faint dots = each stool · green band = normal (4–5) · red band = liquid (1–2)')));
    root.append(h('div', { class: 'two' }, card('Appetite', Charts.rating(D, 'appetite', 'Appetite over time', 'c2')), card('Energy', Charts.rating(D, 'energy', 'Energy over time', 'c4'))));
    root.append(card('Weight (' + D.cfg.unit + ')', Charts.weight(D)));
    return root;
  }

  // ---------- OUTCOME
  const ARROW = { improving: '▲', worsening: '▼', stable: '●', 'n/a': '', gaining: '▲', losing: '▼' };
  function outcomeBlock(D, O) {
    if (!O.ready) return h('div', {}, h('div', { class: 'verdict warn' }, h('b', {}, 'Not enough data yet')), h('p', { class: 'muted' }, O.reason));
    const T = O.T, u = U.n1, p = U.pct, w1 = O.w1, rc = O.rc;
    const rows = [
      ['Avg stool score', u(w1.avg), u(rc.avg), T.stool], ['Formed stools (4–5)', p(w1.formed), p(rc.formed), T.formed], ['Liquid stools (1–2)', p(w1.liquid), p(rc.liquid), T.liquid],
      ['Stools per day', u(w1.perDay), u(rc.perDay), T.perDay], ['Appetite (1–5)', u(w1.appetite), u(rc.appetite), T.appetite], ['Energy (1–5)', u(w1.energy), u(rc.energy), T.energy],
      ['Nausea (1–5)', u(w1.nausea), u(rc.nausea), T.nausea], ['Gas (1–5)', u(w1.gas), u(rc.gas), T.gas], ['Discomfort (1–5)', u(w1.discomfort), u(rc.discomfort), T.discomfort],
      ['Vomiting / 7 days', u(w1.vomit7), u(rc.vomit7), T.vomit], ['Good days', p(w1.good), p(rc.good), T.good],
      ['Weight (' + D.cfg.unit + ')', O.wFirst ? u(O.wFirst.v) : '–', O.wLast ? u(O.wLast.v) : '–', T.weight]];
    return h('div', {}, h('div', { class: 'verdict ' + O.level }, h('b', {}, O.verdict)),
      h('ul', { class: 'sentences' }, O.sentences.map(s => h('li', {}, s))),
      h('div', { class: 'tablewrap' }, h('table', { class: 'tbl' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Measure'), h('th', {}, 'Week 1'), h('th', {}, 'Latest 7d'), h('th', {}, 'Trend'))),
        h('tbody', {}, rows.map(r => h('tr', {}, h('td', {}, r[0]), h('td', {}, r[1]), h('td', {}, r[2]), h('td', { class: 'tr ' + r[3] }, (ARROW[r[3]] || '') + ' ' + r[3])))))),
      h('p', { class: 'muted small' }, 'Stool "improvement %" = reduction in average distance from the normal range (scores 4–5), so it works whether loose or hard stools are the problem. Owner-recorded observations for discussion with your veterinarian — not a diagnosis.'));
  }
  function viewOutcome() {
    const D = Stats.build();
    return h('div', { class: 'stack' }, card('Is ' + D.cfg.dog + ' improving on ' + D.cfg.food.replace(/^Rachel Ray /, '') + '?', outcomeBlock(D, D.outcome())),
      card('Liquid-free streak', h('div', { class: 'stats' }, stat('Consecutive days', D.streak(), 'with stools logged and none liquid'))));
  }

  // ---------- TIMELINE
  function viewTimeline() {
    const D = Stats.build(), weeks = Math.ceil(D.trialDates.length / 7) || 1;
    let dates = [...new Set([...D.trialDates, ...Object.keys(D.days), ...Object.keys(D.byDate), ...Object.keys(D.vByDate)])].sort();
    if (App.week !== 'all') { const w = +App.week; dates = dates.filter(d => { const i = U.diff(D.start, d); return i >= w * 7 && i < w * 7 + 7; }); }
    const sel = h('select', { onchange: e => { App.week = e.target.value; e.target.blur(); App.render(); } },
      h('option', { value: 'all', selected: App.week === 'all' }, 'All weeks'),
      Array.from({ length: weeks }, (_, i) => h('option', { value: i, selected: String(App.week) === String(i) }, 'Week ' + (i + 1))));
    const root = h('div', { class: 'stack' }, h('div', { class: 'filter' }, h('span', {}, 'Show'), sel));
    dates.reverse().forEach(d => {
      const x = D.days[d] || {}, st = D.byDate[d] || [], vs = D.vByDate[d] || [], w = D.wByDate[d] || [];
      if (!D.hasData(d) && d > D.today) return;
      root.append(h('button', { class: 'card tl', onclick: () => App.go(d, 'log') },
        h('div', { class: 'tl-head' }, h('b', {}, U.long(d)), h('small', {}, 'Day ' + D.dayNumber(d)), h('span', { class: 'grow' }), x.good === true ? h('span', { class: 'gd yes' }, '👍') : x.good === false ? h('span', { class: 'gd no' }, '👎') : null),
        st.length ? h('div', { class: 'tl-stools' }, st.map(s => h('span', { class: 'badge s' + s.score, title: U.t12(s.time) }, s.score))) : h('small', { class: 'muted' }, 'No stools logged'),
        h('div', { class: 'tl-meta' },
          ['appetite', 'energy'].filter(k => x[k]).map(k => h('span', { class: 'tag' }, k.slice(0, 3) + ' ' + x[k])),
          vs.length ? h('span', { class: 'tag bad' }, '🤮 ' + vs.length) : null, w.length ? h('span', { class: 'tag' }, '⚖ ' + U.n1(w[w.length - 1].v) + D.cfg.unit) : null,
          x.treats && x.treats !== 'None' ? h('span', { class: 'tag warn' }, 'treats') : null, x.nonapproved && x.nonapproved !== 'None' ? h('span', { class: 'tag bad' }, 'non-approved: ' + x.nonapproved) : null,
          st.some(s => s.blood) ? h('span', { class: 'tag bad' }, 'blood') : null, st.some(s => s.mucus) ? h('span', { class: 'tag warn' }, 'mucus') : null)));
    });
    if (root.children.length === 1) root.append(h('p', { class: 'muted' }, 'Nothing logged yet.'));
    return root;
  }

  // ---------- MORE (export, report, settings, sync)
  function viewMore() {
    const L = Store.getLocal(), cfg = Store.cfg(), root = h('div', { class: 'stack' });
    root.append(card('Vet report', h('p', { class: 'muted' }, 'One-page-style summary with charts, weekly table, vomiting and diet-deviation log.'),
      h('button', { class: 'btn primary wide', onclick: () => App.show('report') }, '🖨 Open printable vet summary')));
    root.append(card('Export data',
      h('div', { class: 'btngrid' },
        h('button', { class: 'btn', onclick: Exporter.csvStools }, 'Stools CSV'), h('button', { class: 'btn', onclick: Exporter.csvDaily }, 'Daily CSV'),
        h('button', { class: 'btn', onclick: Exporter.excel }, 'Excel workbook'), h('button', { class: 'btn', onclick: Exporter.json }, 'Backup (JSON)')),
      h('label', { class: 'btn wide file' }, 'Restore from backup…', h('input', { type: 'file', accept: '.json,application/json', onchange: async e => {
        try { Store.importJSON(JSON.parse(await e.target.files[0].text())); snack('Backup merged'); } catch (err) { snack('Could not read file: ' + err.message); }
      } }))));

    const syncLine = h('p', { class: 'syncline' }); const paintSync = () => { syncLine.textContent = Sync.status.msg + ` · ${Store.stats().pending} unsynced change(s)`; syncLine.className = 'syncline ' + Sync.status.state; };
    paintSync(); Sync.onStatus(paintSync);
    let url = L.url, token = L.token;
    root.append(card('Shared sync (Google Sheet)',
      h('p', { class: 'muted small' }, 'Both of you paste the same Web app URL and token (see README, 5-minute setup). Leave blank to use this device only.'),
      field('Web app URL', h('input', { type: 'url', placeholder: 'https://script.google.com/macros/s/…/exec', value: url, onchange: e => url = e.target.value.trim() })),
      field('Token', h('input', { type: 'text', value: token, autocapitalize: 'off', onchange: e => token = e.target.value.trim() })),
      h('div', { class: 'btnrow' },
        h('button', { class: 'btn primary', onclick: () => { Store.setLocal({ url, token }); Sync.run(); } }, 'Save & sync now'),
        h('button', { class: 'btn', disabled: !L.url, onclick: () => {
          const cfgLink = location.origin + location.pathname + '#cfg=' + btoa(JSON.stringify({ url: L.url, token: L.token }));
          (navigator.clipboard ? navigator.clipboard.writeText(cfgLink) : Promise.reject()).then(() => snack('Setup link copied — send it to Mary'), () => prompt('Copy this setup link:', cfgLink));
        } }, 'Copy setup link')), syncLine));

    // medication list editor (shared; stored in the trial settings record)
    const meds = (cfg.meds || []).map(m => Object.assign({}, m, { slots: [...(m.slots || [])] }));
    const saveMeds = () => Store.setCfg('meds', meds);
    root.append(card('Medications & supplements (shared)',
      h('p', { class: 'muted small' }, 'Slots: Breakfast ≈ 8 AM, Dinner ≈ 7 PM, Once daily (no set time), As needed. Dates are optional; they limit when a dose is expected.'),
      meds.map((m, i) => h('div', { class: 'medcfg' },
        field('Name', h('input', { type: 'text', value: m.name, onchange: e => { m.name = e.target.value.trim(); saveMeds(); } })),
        field('Dose', h('input', { type: 'text', value: m.dose || '', onchange: e => { m.dose = e.target.value.trim(); saveMeds(); } })),
        h('div', { class: 'chips' }, SLOTS.map(([s, l]) => toggle(l.replace(/ \(.*\)/, '').replace('☀️ ', '').replace('🌙 ', ''), m.slots.includes(s),
          on => { m.slots = on ? [...m.slots, s] : m.slots.filter(x => x !== s); saveMeds(); }))),
        h('div', { class: 'two' }, field('Start date', h('input', { type: 'date', value: m.start || '', onchange: e => { m.start = e.target.value; saveMeds(); } })),
          field('End date', h('input', { type: 'date', value: m.end || '', onchange: e => { m.end = e.target.value; saveMeds(); } }))),
        h('button', { class: 'btn danger small', onclick: () => { if (confirm('Remove ' + m.name + '? Past ticks stay in the data but leave the checklist and report.')) { meds.splice(i, 1); saveMeds(); } } }, 'Remove'))),
      h('button', { class: 'btn wide', onclick: () => { meds.push({ id: 'm' + U.uid(), name: 'New medication', dose: '', slots: ['AM'], start: '', end: '' }); saveMeds(); } }, '＋ Add medication or supplement')));

    root.append(card('Trial settings (shared)',
      field('Dog name', h('input', { type: 'text', value: cfg.dog, onchange: e => Store.setCfg('dog', e.target.value.trim() || 'Oakley') })),
      field('Trial start date (Day 1)', h('input', { type: 'date', value: cfg.start || '', onchange: e => Store.setCfg('start', e.target.value || null) })),
      field('Trial length (days)', h('input', { type: 'number', min: 7, max: 90, value: cfg.len, onchange: e => Store.setCfg('len', Math.max(7, +e.target.value || 30)) })),
      field('Default food', h('input', { type: 'text', value: cfg.food, onchange: e => Store.setCfg('food', e.target.value.trim()) })),
      h('div', { class: 'field' }, h('span', {}, 'Weight unit'), seg([['lb', 'lb'], ['kg', 'kg']], cfg.unit, v => Store.setCfg('unit', v || 'lb')))));
    root.append(card('This device',
      h('div', { class: 'field' }, h('span', {}, 'Who is logging?'), h('div', { class: 'chips' }, ['Andrew', 'Mary'].map(n => h('button', { class: 'chip' + (L.user === n ? ' on' : ''), onclick: () => Store.setLocal({ user: n }) }, n))),
        h('input', { type: 'text', placeholder: 'Other name', value: ['Andrew', 'Mary'].includes(L.user) ? '' : L.user, onchange: e => Store.setLocal({ user: e.target.value.trim() }) })),
      h('div', { class: 'field' }, h('span', {}, 'Theme'), seg([['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']], L.theme, v => Store.setLocal({ theme: v || 'auto' })))));
    return root;
  }

  // ---------- VET REPORT
  function viewReport() {
    const D = Stats.build(), O = D.outcome(), u = U.n1, p = U.pct, cfg = D.cfg;
    const n = D.trialDates.length, weeks = Math.ceil(n / 7);
    const avg = k => U.mean(D.rangeStools(k).map(s => s.score)), best = D.best(), worst = D.worst();
    const tbl = (head, rows) => h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, head.map(x => h('th', {}, x)))), h('tbody', {}, rows.map(r => h('tr', {}, r.map(c => h('td', {}, c))))));
    const root = h('div', { class: 'report' },
      h('div', { class: 'noprint btnrow' }, h('button', { class: 'btn', onclick: () => App.show('more') }, '← Back'), h('button', { class: 'btn primary', onclick: () => window.print() }, '🖨 Print / Save as PDF')),
      h('h1', {}, `${cfg.dog} — Diet Trial Summary`),
      h('p', { class: 'muted' }, `Food: ${cfg.food} · Trial start ${D.start} · Day ${Math.min(n, D.len)} of ${D.len} · Generated ${new Date().toLocaleDateString()} · Recorded by owners`),
      h('h2', {}, 'Snapshot'),
      tbl(['Avg stool 7d', 'Avg stool 14d', 'Avg stool 30d', 'Days w/o liquid stool', 'Best / worst', 'Vomiting episodes'],
        [[u(avg(7)), u(avg(14)), u(avg(30)), D.streak(), (best ? best.score : '–') + ' / ' + (worst ? worst.score : '–'), D.vomits.length]]),
      h('h2', {}, 'Is ' + cfg.dog + ' improving?'), outcomeBlock(D, O),
      h('h2', {}, 'Weekly breakdown'),
      tbl(['Week', 'Stools', 'Avg score', 'Formed %', 'Liquid %', 'Stools/day', 'Appetite', 'Energy', 'Vomiting', 'Good days'],
        Array.from({ length: weeks }, (_, i) => { const m = D.metrics(D.trialDates.slice(i * 7, i * 7 + 7)); return ['W' + (i + 1), m.stools, u(m.avg), p(m.formed), p(m.liquid), u(m.perDay), u(m.appetite), u(m.energy), m.vomit, p(m.good)]; })),
      h('div', { class: 'two' }, h('div', {}, h('h3', {}, 'Stool score'), Charts.stool(D)), h('div', {}, h('h3', {}, 'Weight (' + cfg.unit + ')'), Charts.weight(D))),
      h('div', { class: 'two' }, h('div', {}, h('h3', {}, 'Appetite'), Charts.rating(D, 'appetite', 'Appetite', 'c2')), h('div', {}, h('h3', {}, 'Energy'), Charts.rating(D, 'energy', 'Energy', 'c4'))));

    const ms = D.medSummary().filter(r => r.exp || r.prn);
    root.append(h('h2', {}, 'Medications & supplements'),
      D.medStart ? h('div', {},
        h('p', { class: 'muted small' }, `Dose checklist kept since ${D.medStart}. Adherence = doses ticked as given ÷ doses scheduled, completed days only (through yesterday).`),
        tbl(['Medication', 'Dose', 'Schedule', 'Given / scheduled', 'Adherence'], ms.map(r => [r.m.name, r.m.dose || '',
          (r.m.slots || []).map(s => ({ AM: 'breakfast', PM: 'dinner', DAY: 'once daily', PRN: 'as needed' }[s])).join(' + '),
          r.exp ? `${r.given} / ${r.exp}` : `${r.prn} given (as needed)`, r.exp ? p(100 * r.given / r.exp) : '–'])),
        (() => { const missed = ms.flatMap(r => r.missed.map(x => [x.date, r.m.name, { AM: 'breakfast', PM: 'dinner', DAY: 'once daily' }[x.slot]])); return missed.length ? h('div', {}, h('h3', {}, 'Doses not ticked'), tbl(['Date', 'Medication', 'Slot'], missed)) : h('p', {}, 'No missed doses recorded.'); })())
        : h('p', {}, 'No doses checked off yet.'));
    const dev = Object.keys(D.days).sort().filter(d => { const x = D.days[d]; return (x.treats && x.treats !== 'None') || (x.nonapproved && x.nonapproved !== 'None') || (x.meds && x.meds !== 'None'); });
    root.append(h('h2', {}, 'Diet adherence, treats & medications'),
      dev.length ? tbl(['Date', 'Treats', 'Non-approved foods', 'Meds / supplements'], dev.map(d => [d, D.days[d].treats || '', D.days[d].nonapproved || '', D.days[d].meds || '']))
        : h('p', {}, 'No treats, non-approved foods or medications recorded.'));
    root.append(h('h2', {}, 'Vomiting log'), D.vomits.length ? tbl(['Date', 'Time', 'Notes'], D.vomits.map(v => [v.date, U.t12(v.time), v.notes || ''])) : h('p', {}, 'None recorded.'));
    root.append(h('h2', {}, 'Stool log'), D.stools.length ? tbl(['Date', 'Time', 'Score', 'Urgency', 'Mucus', 'Blood', 'Color', 'Notes'],
      D.stools.map(s => [s.date, U.t12(s.time), s.score + ' ' + SCALE_NAME[s.score], s.urgency || '', s.mucus ? 'yes' : '', s.blood ? 'YES' : '', s.color || '', s.notes || ''])) : h('p', {}, 'None recorded.'));
    root.append(h('p', { class: 'muted small' }, 'Stool scale: 1 completely liquid · 2 mostly liquid · 3 pudding · 4 soft formed · 5 normal formed · 6 firm · 7 overly hard. Ratings 1–5. Owner observations; not a diagnosis.'));
    return root;
  }

  return { snack, modal, viewLog, viewDash, viewOutcome, viewTimeline, viewMore, viewReport, editStool };
})();
