// صقر report (PDF) — the Boss's three altitudes on paper (Ibrahim, 2026-11-17).
//   page 1   = Level 1: the month it is ABOUT, the moment it shows («كما هي مسجّلة في …»), the three numbers;
//   page 2   = Level 2: the firms — firm · due · status · notes (where notes come from: to be decided, «—» until then);
//   page 3 + = Level 3: each firm's drawer (the Boss's own five columns), then the contract clips that prove it.
// Clips: the contract page around the Admin's own boxes, highlighted together (amount, date, the contract's total), each
// box numbered and the same number beside the cell it proves. Boxes close together share one clip; far apart (or on
// another page) get as many clips as needed — never more.
// The sheets on screen ARE the print: real A4 sheets, paginated here, so «حفظ PDF» (the browser's own print-to-PDF,
// perfect Arabic shaping) gives exactly what the Boss saw. Nothing here does money math: every number comes from
// SakerCalc.month, through the same helpers as the screen. The contract files are never modified.
(function (root) {
  'use strict';
  const PAGE_W = 1100, ZOOM_W = 2000;      // a contract page drawn whole (reduced on paper) / for the magnified bands
  const MIN_BAND = 0.5;                    // a magnified band's least width (page fraction), so all read at one size
  let el = null, savedTitle = '', job = 0;

  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function close() {
    if (!el) return;
    job++; el.remove(); el = null;
    document.body.classList.remove('rp-on');
    document.removeEventListener('keydown', onKey);
  }
  const onKey = e => { if (e.key === 'Escape') close(); };

  async function open(ctx) {
    close();
    const my = ++job, { T, esc } = ctx, R = T.rp;
    const title = R.title(ctx.month);
    el = document.createElement('div');
    el.className = 'rp'; el.dir = T.dir;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', title);
    el.innerHTML = `
      <div class="rp-bar">
        <span class="rp-bar-title">${esc(title)}</span>
        <button type="button" class="rp-save" disabled>${esc(R.save)}</button>
        <button type="button" class="rp-close" aria-label="${esc(R.close)}" title="${esc(R.close)}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13"/></svg></button>
      </div>
      <div class="rp-stage"><p class="rp-wait">${esc(R.building)}</p><div class="rp-sheets"></div></div>`;
    document.body.appendChild(el);
    document.body.classList.add('rp-on');
    document.addEventListener('keydown', onKey);
    el.querySelector('.rp-close').addEventListener('click', close);
    current = title;
    el.querySelector('.rp-save').addEventListener('click', async e => {
      const b = e.currentTarget, label = b.textContent;
      if (b.disabled) return;
      b.disabled = true; b.textContent = R.saving;
      try {
        const pdf = await makePdf(title);
        pdf.save(title.replace(/[\\/:*?"<>|]+/g, '-') + '.pdf');   // the file's name: the report's own heading
      } catch (err) {                                          // the libraries could not load (offline…): the print dialog
        savedTitle = document.title; document.title = title;
        window.addEventListener('afterprint', () => { document.title = savedTitle; }, { once: true });
        window.print();
      } finally { b.disabled = false; b.textContent = label; }
    });

    try { await document.fonts.ready; } catch (e) { /* fonts are a nicety */ }
    const firms = ctx.M.firms.map(f => plan(ctx, f));
    const clips = await Promise.all(firms.map(p => Promise.all(p.pages.map(g => evidence(ctx, g)))));
    if (my !== job) return;
    lay(ctx, firms, clips);
    el.querySelector('.rp-wait').remove();
    el.querySelector('.rp-save').disabled = false;
    fit(); window.addEventListener('resize', fit);
  }

  // «حفظ PDF» DOWNLOADS the file (Ibrahim, 2026-11-18: "make it download", not print). Each A4 sheet is drawn by the
  // browser into a picture (html2canvas — the Arabic shaped exactly as on screen) and the pictures become the pages of
  // one PDF (jsPDF), A4 edge to edge. Both libraries load only when the button is pressed (pinned versions).
  const LIBS = ['https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
                'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js'];
  const loadLib = src => new Promise((ok, no) => {
    if (document.querySelector(`script[src="${src}"]`) && (src.includes('html2canvas') ? root.html2canvas : root.jspdf)) return ok();
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('could not load ' + src));
    document.head.appendChild(s);
  });
  let current = '';
  async function makePdf(title) {
    await Promise.all(LIBS.map(loadLib));
    const box = el.querySelector('.rp-sheets'), zoom = box.style.zoom, stage = el.querySelector('.rp-stage'), top = stage.scrollTop;
    box.style.zoom = 1;                                        // drawn at full size, whatever the screen shows
    // a canvas rounds each letter's width at small sizes (Chrome: "Northwind" 63 px vs 60.8 px on the page), so long
    // words grew into the next one ("NorthwindTrading"). While the sheets are drawn, every word is written at 4× its
    // size and shrunk back: its width then matches the page to a fraction of a pixel. Restored right after.
    const P = root.CanvasRenderingContext2D.prototype, fill = P.fillText, K = 4;
    P.fillText = function (text, x, y, maxW) {
      const f = this.font, m = /(\d*\.?\d+)px/.exec(f);
      if (!m) return fill.call(this, text, x, y, maxW);
      this.save(); this.translate(x, y); this.scale(1 / K, 1 / K);
      this.font = f.replace(m[0], parseFloat(m[1]) * K + 'px');
      fill.call(this, text, 0, 0, maxW === undefined ? undefined : maxW * K);
      this.restore();
    };
    try {
      const pdf = new root.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
      const sheets = [...el.querySelectorAll('.rp-sheet')], paper = css('--paper') || '#ffffff';
      for (let i = 0; i < sheets.length; i++) {
        const c = await root.html2canvas(sheets[i], { scale: 2, backgroundColor: paper, useCORS: true, logging: false,
          scrollX: 0, scrollY: 0, windowWidth: document.documentElement.clientWidth });
        if (i) pdf.addPage('a4', 'portrait');
        pdf.addImage(c.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
      }
      pdf.setProperties({ title, creator: 'صقر' });
      return pdf;
    } finally { P.fillText = fill; box.style.zoom = zoom; stage.scrollTop = top; }
  }

  // screens narrower than a sheet see the sheets scaled down (the print is never scaled)
  function fit() {
    if (!el) { window.removeEventListener('resize', fit); return; }
    const w = el.querySelector('.rp-stage').clientWidth - 32, sheet = el.querySelector('.rp-sheet');
    if (sheet) el.querySelector('.rp-sheets').style.zoom = Math.min(1, w / sheet.offsetWidth);
  }

  // ── what each firm needs: its rows, the numbered boxes behind them, and the clips those boxes fall into ──
  let markNo = 0;
  function plan(ctx, f) {
    const { ix, T, money, dmy } = ctx, marks = new Map();   // anchor id → { n, label, what }
    const mark = (id, label, what) => {
      if (!id || !ix.anchor[id]) return null;
      if (!marks.has(id)) marks.set(id, { n: label ? null : ++markNo, label, what });
      return marks.get(id);
    };
    const rows = f.rows.map(r => {
      const i = r.installment, head = T.installment(i.seq, ix.instsOf[r.contract.id].length);
      // the same boxes the Boss's clicks open (app.js openDoc → box()): one box for both, or amount and date apart
      const amountId = i.amount_anchor_id || i.anchor_id || i.date_anchor_id;
      const dateId = i.date_anchor_id || i.anchor_id || i.date_anchor_id;
      if (amountId === dateId) { const m = mark(amountId, null, `${head} · ${money(i.amount_cents)} · ${dmy(i.due_on)}`); return { r, amount: m, date: m }; }
      return { r, amount: mark(amountId, null, `${head} · ${money(i.amount_cents)}`), date: mark(dateId, null, `${head} · ${dmy(i.due_on)}`) };
    });
    // the contract's total, marked with its instalments (what the Admin sees while preparing it)
    for (const c of new Set(f.rows.map(r => r.contract))) {
      if (c.total_anchor_id) mark(c.total_anchor_id, T.rp.total, c.total_cents != null ? money(c.total_cents) : '');
    }
    // one evidence block per contract PAGE that holds marks — the needed pages, never more
    const byPage = new Map();
    for (const [id, m] of marks) {
      const a = ix.anchor[id], k = `${a.document_id}|${a.page}`;
      if (!byPage.has(k)) {
        const doc = ix.document[a.document_id], c = ix.data.contracts.find(x => x.document_id === doc.id);
        byPage.set(k, { path: doc.file_path, page: a.page, ref: c ? c.ref : doc.file_name, boxes: [] });
      }
      byPage.get(k).boxes.push({ box: a.box, ...m });
    }
    const order = b => (b.n == null ? -1 : b.n);                      // the total first, then the numbers
    const pages = [...byPage.values()];
    pages.forEach(g => g.boxes.sort((a, b) => order(a) - order(b)));
    const first = g => Math.min(...g.boxes.map(b => (b.n == null ? 1e9 : b.n)));
    pages.sort((a, b) => first(a) - first(b));
    return { f, rows, pages };
  }

  // ── the evidence: the whole page (credible) beside the points magnified (readable) ──
  const rasters = new Map();
  const raster = (path, page, w) => {
    const k = `${path}|${page}|${w}`;
    if (!rasters.has(k)) rasters.set(k, window.SakerViewer.raster(path, page, w));
    return rasters.get(k);
  };
  // the classic highlighter: yellow laid OVER the text (multiply), so the words stay dark, a little wider than the box
  function marker(g, x, y, w, h) {
    const p = Math.max(2, h * 0.14);
    g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = css('--hl-paper');
    g.fillRect(x - p, y - p * 0.5, w + 2 * p, h + p); g.restore();
  }
  // a number (or «الإجمالي») in an ink circle, in the margin beside the mark — like a pen note
  function tag(g, text, x, y, w, h, size, W, font, dir, taken) {
    g.font = `600 ${size}px ${font}`;
    const th = size * 1.7, tw = Math.max(th, g.measureText(text).width + size * 1.1), gap = size * 0.45;
    const ty = y + h / 2 - th / 2;
    const free = tx => tx >= 4 && tx + tw <= W - 4 &&
      !taken.some(r => tx < r.x + r.w + 3 && tx + tw + 3 > r.x && ty < r.y + r.h + 3 && ty + th + 3 > r.y);
    const tries = [x - tw - gap, x + w + gap, x - 2 * tw - 2 * gap, x + w + tw + 2 * gap, x - 3 * tw - 3 * gap];
    const tx = tries.find(free) ?? Math.max(4, x - tw - gap);
    taken.push({ x: tx, y: ty, w: tw, h: th });
    g.fillStyle = css('--ink'); g.beginPath(); g.roundRect(tx, ty, tw, th, th / 2); g.fill();
    g.fillStyle = css('--paper'); g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = dir;
    g.fillText(text, tx + tw / 2, ty + th / 2 + size * 0.06);
  }
  // the marked line(s) only: the runs of text rows (under the box's width) that sit mostly inside the box —
  // a neighbouring line the box merely touches stays out, and no line is ever cut
  function lines(src, bx, bw, top, bottom) {
    const pc = src.getContext('2d', { willReadFrequently: true }), H = src.height, reach = (bottom - top) * 0.8;
    const y0 = Math.max(0, Math.floor(top - reach)), y1 = Math.min(H - 1, Math.ceil(bottom + reach));
    const d = pc.getImageData(bx, y0, Math.max(1, bw), y1 - y0 + 1).data, rowLen = Math.max(1, bw) * 4;
    const ink = r => { for (let i = r * rowLen, e = i + rowLen; i < e; i += 4) if (d[i] < 200 || d[i + 1] < 200 || d[i + 2] < 200) return true; return false; };
    const runs = [];
    for (let r = 0, s = -1; r <= y1 - y0 + 1; r++) {
      const on = r <= y1 - y0 && ink(r);
      if (on && s < 0) s = r;
      if (!on && s >= 0) { runs.push([y0 + s, y0 + r]); s = -1; }
    }
    const kept = runs.filter(([a, b]) => Math.min(b, bottom) - Math.max(a, top) >= (b - a) * 0.5);
    if (!kept.length) return [Math.max(0, Math.round(top)), Math.max(1, Math.round(bottom - top))];
    const a = Math.min(...kept.map(k => k[0])), b = Math.max(...kept.map(k => k[1]));
    return [a, Math.max(1, b - a)];
  }
  async function evidence(ctx, gp) {
    let page, zoom;
    try { [page, zoom] = await Promise.all([raster(gp.path, gp.page, PAGE_W), raster(gp.path, gp.page, ZOOM_W)]); }
    catch (e) { return null; }                                         // an unreadable file: the rows keep their numbers
    const dir = ctx.T.dir, font = dir === 'rtl' ? css('--font-ar') : css('--font-en');
    // the whole page, reduced: every mark in place, numbered in the margin
    const W = page.width, H = page.height, cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.drawImage(page, 0, 0);
    for (const b of gp.boxes) marker(g, b.box[0] * W, b.box[1] * H, b.box[2] * W, b.box[3] * H);
    const taken = [];
    for (const b of gp.boxes) tag(g, b.n ? String(b.n) : b.label, b.box[0] * W, b.box[1] * H, b.box[2] * W, b.box[3] * H, b.n ? 26 : 22, W, font, dir, taken);
    // the magnifier: each point's band at about the paper's own size (at least ~half the page wide, so all read alike)
    const ZW = zoom.width, ZH = zoom.height;
    const points = gp.boxes.map(b => {
      const [bx, by, bw, bh] = b.box, half = Math.max(bw + 0.05, MIN_BAND) / 2, cx = bx + bw / 2;
      const x0 = Math.max(0, Math.min(cx - half, 1 - 2 * half)), x1 = Math.min(1, x0 + 2 * half);
      const sx = Math.round(x0 * ZW), sw = Math.round((x1 - x0) * ZW);
      const [sy, sh] = lines(zoom, Math.round(bx * ZW), Math.round(bw * ZW), by * ZH, (by + bh) * ZH);
      const m = Math.max(14, Math.round(sh * 0.45)), c = document.createElement('canvas');
      c.width = sw; c.height = sh + 2 * m;
      const z = c.getContext('2d');
      z.fillStyle = css('--paper'); z.fillRect(0, 0, c.width, c.height);
      z.drawImage(zoom, sx, sy, sw, sh, 0, m, sw, sh);
      marker(z, bx * ZW - sx, by * ZH - sy + m, bw * ZW, bh * ZH);
      return { n: b.n, label: b.label, what: b.what, src: c.toDataURL('image/png'), w: sw, h: sh + 2 * m };
    });
    return { src: cv.toDataURL('image/jpeg', 0.92), w: W, h: H, points, caption: ctx.T.rp.clip(gp.ref, gp.page) };
  }

  // ── the sheets ──
  function lay(ctx, firms, clips) {
    const { T, esc, money, dmy } = ctx, R = T.rp;
    const host = el.querySelector('.rp-sheets');
    const sheets = [];
    let body = null;
    const sheet = (cover) => {
      const s = document.createElement('section');
      s.className = 'rp-sheet' + (cover ? ' rp-cover-sheet' : '');
      s.lang = document.documentElement.lang;
      s.innerHTML = `
        ${cover ? '' : `<header class="rp-run"><span class="rp-run-brand">${esc(T.brand)}</span><span>${esc(R.title(ctx.month))}</span></header>`}
        <div class="rp-body"></div>
        <footer class="rp-foot"><span>${esc(T.brand)} · ${esc(T.demo)}</span><span>${esc(R.asOfShort(ctx.date(ctx.day), ctx.hm))}</span><span class="rp-pg"></span></footer>`;
      host.appendChild(s); sheets.push(s);
      return (body = s.querySelector('.rp-body'));
    };
    const over = () => body.scrollHeight > body.clientHeight + 1;
    const frag = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
    // a block that must stay whole: here if it fits, else on a fresh sheet
    // (`cont` = the line that opens the fresh sheet, so a carried-over block still says whose it is)
    const place = (node, cont) => {
      body.appendChild(node);
      if (over() && body.children.length > 1) { node.remove(); sheet(); if (cont) body.appendChild(frag(cont)); body.appendChild(node); }
    };
    // a table: whole if it fits here or on a fresh sheet; a longer one continues on the next sheet with its head again
    const table = (headHtml, head, rows, cls) => {
      const make = (hh, rs) => frag(`<div class="rp-block">${hh}<table class="rp-table ${cls}" dir="ltr"><thead>${head}</thead><tbody>${rs.join('')}</tbody></table></div>`);
      const whole = make(headHtml, rows);
      body.appendChild(whole);
      if (!over()) return;
      whole.remove();
      if ([...body.children].some(c => !c.matches('.rp-h2'))) { sheet(); body.appendChild(whole); if (!over()) return; whole.remove(); }
      let part = make(headHtml, []); body.appendChild(part);
      for (const r of rows) {
        const tb = part.querySelector('tbody');
        tb.insertAdjacentHTML('beforeend', r);
        if (over() && tb.children.length > 1) {
          tb.lastElementChild.remove();
          sheet(); part = make(headHtml.replace('</h3>', ` <small>(${esc(R.cont)})</small></h3>`), [r]); body.appendChild(part);
        }
      }
    };
    const th = s => `<th dir="${T.dir}">${esc(s)}</th>`;
    const tone = (status, late) => `rp-st st-${status}${late ? ' late' : ''}`;

    // page 1 — Level 1: what month, as of when, the three numbers
    sheet(true);
    const lockup = (document.querySelector('.si-mark') || {}).innerHTML || '';
    body.appendChild(frag(`
      <div class="rp-cover">
        <svg class="rp-lockup" viewBox="0 0 496 307" role="img" aria-label="${esc(T.brand)}">${lockup}</svg>
        <h1 class="rp-h1">${esc(R.title(ctx.month))}</h1>
        <p class="rp-asof">${esc(R.asOf(ctx.month, ctx.date(ctx.day), ctx.hm))}</p>
        <div class="rp-sky" dir="ltr">
          <div><span dir="${T.dir}">${esc(T.due)}</span><b>${money(ctx.M.due_cents)}</b></div>
          <div class="is-paid"><span dir="${T.dir}">${esc(T.paid)}</span><b>${money(ctx.M.paid_cents)}</b></div>
          <div><span dir="${T.dir}">${esc(T.remaining)}</span><b>${money(ctx.M.remaining_cents)}</b></div>
        </div>
        <p class="rp-unit">${esc(T.usd)}</p>
      </div>`));

    if (firms.length) {
      // page 2 — Level 2: the firms
      sheet();
      body.appendChild(frag(`<h2 class="rp-h2">${esc(R.summary)}<small>${esc(T.firmsCount(firms.length))}</small></h2>`));
      const sumRows = firms.map(({ f }) => `
        <tr><td dir="auto" class="rp-firm-cell">${esc(f.firm.name)}</td><td class="num">${money(f.due_cents)}</td>
          <td><span class="${tone(f.status, f.status === 'due' && f.max_dpd > 0)}" dir="${T.dir}"><i></i>${esc(T.st[f.status])}</span></td>
          <td class="rp-none">—</td></tr>`);
      sumRows.push(`<tr class="rp-sum"><td dir="${T.dir}">${esc(T.due)}</td><td class="num">${money(ctx.M.due_cents)}</td><td></td><td></td></tr>`);
      table('', `<tr>${th(T.colFirm)}<th class="num" dir="${T.dir}">${esc(T.colDue)}</th>${th(T.colStatus)}${th(R.notes)}</tr>`, sumRows, 'rp-t4');

      // page 3 + — Level 3: each firm's drawer, then its clips
      sheet();
      body.appendChild(frag(`<h2 class="rp-h2">${esc(R.details)}</h2>`));
      const mk = m => (m && m.n ? `<span class="rp-mk">${m.n}</span>` : '');
      const head = `<tr>${th(T.colRef)}<th class="num" dir="${T.dir}">${esc(T.colAmount)}</th>${th(T.colDate)}${th(T.colStatus)}${th(T.colNote)}</tr>`;
      firms.forEach(({ f, rows }, k) => {
        const lines = rows.map(({ r, amount, date }) => {
          const late = r.dpd > 0 && r.status !== 'paid';
          const showOf = r.group === 'overdue' && r.due_cents !== r.original_cents;
          const small = (showOf ? `<small dir="${T.dir}">${esc(T.of)} ${money(r.original_cents)}</small>` : '') +
            (r.paid_cents > 0 && r.remaining_cents > 0 ? `<small dir="${T.dir}">${esc(T.stripLeft)} ${money(r.remaining_cents)}</small>` : '');
          const note = r.notes[0];
          return `
            <tr class="${r.status === 'overdue' ? 'is-late' : ''}">
              <td class="ref">${esc(r.contract.ref)}</td>
              <td class="num">${money(r.due_cents)}${mk(amount)}${small}</td>
              <td class="date">${esc(dmy(r.installment.due_on))}${date && amount && date.n === amount.n ? '' : mk(date)}</td>
              <td><span class="${tone(r.status, late)}" dir="${T.dir}"><i></i>${esc(T.st[r.status])}${late ? ` · ${esc(T.days(r.dpd))}` : ''}</span></td>
              <td class="note" dir="auto">${note ? esc(note.text) : '<span class="rp-none">—</span>'}</td>
            </tr>`;
        });
        const fh = `<h3 class="rp-firm" dir="ltr"><span dir="auto">${esc(f.firm.name)}</span>
          <span class="rp-firm-due"><span dir="${T.dir}">${esc(R.firmTotal)}</span> ${money(f.due_cents)}</span>
          <span class="${tone(f.status, f.status === 'due' && f.max_dpd > 0)}" dir="${T.dir}"><i></i>${esc(T.st[f.status])}</span></h3>`;
        // each contract page that holds marks: the whole page (credible) beside its points magnified (readable)
        const pill = p => `<span class="rp-mk${p.n ? '' : ' rp-mk-word'}">${esc(p.n ? String(p.n) : p.label)}</span>`;
        const figs = clips[k].filter(Boolean).map((e, j) => `
          <div class="rp-ev-wrap">${j === 0 ? `<p class="rp-refs">${esc(R.refs)}</p>` : ''}
            <figure class="rp-ev" dir="ltr">
              <div class="rp-ev-page"><img src="${e.src}" width="${e.w}" height="${e.h}" alt="${esc(e.caption)}">
                <figcaption dir="${T.dir}">${esc(e.caption)}</figcaption></div>
              <ol class="rp-ev-points">${e.points.map(p => `
                <li><p class="rp-ev-what" dir="${T.dir}">${pill(p)}<span dir="${T.dir}">${esc(p.what)}</span></p>
                  <img src="${p.src}" width="${p.w}" height="${p.h}" alt=""></li>`).join('')}
              </ol>
            </figure></div>`);
        // one firm = its drawer + its clips, kept together: here if it fits, else on the next page; only a firm longer
        // than a whole page splits (its table first, then its clips one by one)
        const whole = frag(`<div class="rp-firm-block"><div class="rp-block">${fh}<table class="rp-table rp-t5" dir="ltr"><thead>${head}</thead><tbody>${lines.join('')}</tbody></table></div>${figs.join('')}</div>`);
        body.appendChild(whole);
        if (!over()) return;
        whole.remove();
        if ([...body.children].some(c => !c.matches('.rp-h2'))) { sheet(); body.appendChild(whole); if (!over()) return; whole.remove(); }
        table(fh, head, lines, 'rp-t5');
        const cont = `<p class="rp-cont" dir="ltr"><span dir="auto">${esc(f.firm.name)}</span> <small dir="${T.dir}">(${esc(R.cont)})</small></p>`;
        figs.forEach(x => place(frag(x), cont));
      });
    } else {
      body.appendChild(frag(`<p class="rp-asof">${esc(T.empty)}</p>`));
    }
    sheets.forEach((s, n) => { s.querySelector('.rp-pg').textContent = R.page(n + 1, sheets.length); });
  }

  root.SakerReport = { open: ctx => { markNo = 0; rasters.clear(); return open(ctx); }, close,
    // QA: the PDF the button would download, as bytes (no download)
    pdfBytes: async () => el && (await makePdf(current)).output('arraybuffer') };
})(window);
