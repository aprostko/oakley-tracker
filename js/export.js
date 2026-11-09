/* CSV / Excel (SpreadsheetML) / JSON export. */
const Exporter = (() => {
  const esc = v => { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const csv = rows => '﻿' + rows.map(r => r.map(esc).join(',')).join('\r\n');
  const yn = v => v === true ? 'yes' : v === false ? 'no' : '';

  function tables(D) {
    const dates = [...new Set([...Object.keys(D.days), ...D.stools.map(s => s.date), ...D.vomits.map(v => v.date), ...D.weights.map(w => w.date)])].sort();
    const daily = [['Date', 'Trial day', 'Food fed', 'Amount', 'Wet/Dry', 'Treats', 'Non-approved foods', 'Meds/supplements', 'Appetite (1-5)', 'Energy (1-5)', 'Nausea (1-5)', 'Gas (1-5)', 'Abdominal discomfort (1-5)', 'Good day?', 'Stool count', 'Avg stool score', 'Min stool', 'Max stool', 'Vomiting episodes', 'Weight (' + D.cfg.unit + ')', 'Notes']];
    dates.forEach(d => {
      const x = D.days[d] || {}, s = (D.byDate[d] || []).map(a => a.score), w = D.wByDate[d] || [];
      daily.push([d, D.dayNumber(d), D.effFood(d), x.amount, x.form, x.treats, x.nonapproved, x.meds, x.appetite, x.energy, x.nausea, x.gas, x.discomfort, yn(x.good),
        s.length, s.length ? U.n1(U.mean(s), 2) : '', s.length ? Math.min(...s) : '', s.length ? Math.max(...s) : '', (D.vByDate[d] || []).length,
        w.length ? U.n1(w[w.length - 1].v, 1) : '', x.notes]);
    });
    const stools = [['Date', 'Time', 'Score (1-7)', 'Description', 'Urgency', 'Mucus', 'Blood', 'Color', 'Notes', 'Logged by']];
    D.stools.forEach(s => stools.push([s.date, s.time, s.score, SCALE_NAME[s.score], s.urgency, yn(!!s.mucus), yn(!!s.blood), s.color, s.notes, s.by]));
    const vom = [['Date', 'Time', 'Notes', 'Logged by']];
    D.vomits.forEach(v => vom.push([v.date, v.time, v.notes, v.by]));
    const wt = [['Date', 'Time', 'Weight (' + D.cfg.unit + ')']];
    D.weights.forEach(w => wt.push([w.date, w.time, U.n1(w.v, 1)]));
    return { Daily: daily, Stools: stools, Vomiting: vom, Weights: wt };
  }

  function download(name, text, type) {
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
    document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  const stamp = () => U.today();
  const xe = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

  function excel(T) {
    const sheets = Object.entries(T).map(([name, rows]) => `<Worksheet ss:Name="${name}"><Table>` + rows.map((r, i) => '<Row>' + r.map(v => {
      const num = i > 0 && v !== '' && v != null && !isNaN(v) && typeof v !== 'boolean' && !/^0\d/.test(String(v));
      return `<Cell${i === 0 ? ' ss:StyleID="h"' : ''}><Data ss:Type="${num ? 'Number' : 'String'}">${xe(v)}</Data></Cell>`;
    }).join('') + '</Row>').join('') + '</Table></Worksheet>').join('');
    return '<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>' +
      '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
      '<Styles><Style ss:ID="h"><Font ss:Bold="1"/><Interior ss:Color="#DDEEE8" ss:Pattern="Solid"/></Style></Styles>' + sheets + '</Workbook>';
  }

  return {
    csvStools: () => download(`oakley-stools-${stamp()}.csv`, csv(tables(Stats.build()).Stools), 'text/csv'),
    csvDaily: () => download(`oakley-daily-${stamp()}.csv`, csv(tables(Stats.build()).Daily), 'text/csv'),
    excel: () => download(`oakley-trial-${stamp()}.xls`, excel(tables(Stats.build())), 'application/vnd.ms-excel'),
    json: () => download(`oakley-backup-${stamp()}.json`, JSON.stringify(Store.exportJSON(), null, 1), 'application/json')
  };
})();
