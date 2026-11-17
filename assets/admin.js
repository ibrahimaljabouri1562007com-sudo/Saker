// صقر Admin · slice 1 «إضافة» — a contract from its file to "finished", in one flow (Ibrahim, 2026-11-12):
//   firm (pick or type) + contract number + file  →  the workspace: the schedule beside the contract.
//   Drag a box around a clause → a small form right there (the total, or an installment's date + amount) → save.
//   The anchor is recorded by the same motion. A live counter (Admin only) shows the installments against the
//   total; «إنهاء العقد» runs the gate (calc.scheduleCheck): match → the Boss sees it; a gap → fix it (or, later,
//   document the reason); no total in the contract → it finishes on the sum. Until then it is a draft.
// Slice 2 (Ibrahim, 2026-11-12): «المبلغ / التاريخ» switches — a box shows the amount, the date, or both, so a
//   schedule whose dates sit apart from its amounts is still highlighted exactly; «+ إضافة مرجع» beside the
//   contract — a reference file placed where the Boss meets it (the contract · an installment's amount or date ·
//   the notes), highlighted on the file itself, and shown to the Boss side by side with the contract.
// All writes go through SakerStore (logged, never hard-deleted); the document engine is the Boss's own viewer.
(function (root) {
  'use strict';
  const S = root.SakerStore, C = root.SakerCalc, V = root.SakerViewer;
  const ses = {
    get(k) { try { return sessionStorage.getItem('saker.adm.' + k); } catch (e) { return null; } },
    set(k, v) { try { v ? sessionStorage.setItem('saker.adm.' + k, v) : sessionStorage.removeItem('saker.adm.' + k); } catch (e) { /* private */ } },
  };
  const A = {
    view: ses.get('cid') ? 'work' : 'home', cid: ses.get('cid'),
    form: { firm: '', ref: '', signed: '' }, file: null, err: {}, busy: false,
    pop: null,              // the open clause form: { page, box, instId | null, kind }
    ask: null,              // the gate's answer under «إنهاء العقد»: 'gap' | 'no-total' | 'empty' | null
    done: false, drawMode: false,
    docId: ses.get('doc'),  // the file on screen in the workspace: the contract or one of its references
    refAsk: null,           // a reference just dropped: { file, target, inst, err, busy } → «أين يظهر هذا المرجع؟»
    focusAfter: null,       // an anchor to bring into view once the file it lives on is drawn
    redraw: null,           // a saved box being redrawn: the form it came from (values kept) while the new box is dragged
  };
  let X, main, ws = null;   // X = the app's helpers (T, money, dmy, esc); ws = the open workspace's live parts

  const T = () => X.T.adm;
  const esc = s => X.esc(s == null ? '' : s);
  const money = c => X.money(c);
  const L = () => S.local;
  // reads see EVERY contract (the demo's + the Admin's own; removed rows are already left out); writes still go
  // through the store, and only the Admin's own rows are editable in phase A (own() tells them apart)
  const D = () => S.data();
  const own = (table, id) => L()[table].some(r => r.id === id);
  const contract = id => D().contracts.find(c => c.id === id);
  const firmOf = c => S.data().firms.find(f => f.id === c.firm_id);
  const instsOf = id => D().installments.filter(i => i.contract_id === id).sort((a, b) => a.seq - b.seq);
  const anchorOf = id => D().anchors.find(a => a.id === id);
  const noteOf = instId => D().notes.find(n => n.installment_id === instId);
  const parts = i => S.partsOf(i);
  const instById = id => D().installments.find(i => i.id === id);
  const docsOf = c => [D().documents.find(d => d.id === c.document_id)]
    .concat(D().documents.filter(d => d.contract_id === c.id && d.kind === 'outside'));
  const linksOf = cid => (D().links || []).filter(l => l.contract_id === cid);
  const onDoc = (id, docId) => { const a = id && anchorOf(id); return !!a && a.document_id === docId; };
  const notesOn = (cid, docId) => D().notes.filter(n => n.contract_id === cid && onDoc(n.anchor_id, docId));
  // the note typed in the installment's own form (its source = the contract clause), not a reference's note
  const inlineNote = (c, instId) => D().notes.find(n => n.installment_id === instId && (!n.anchor_id || onDoc(n.anchor_id, c.document_id)));
  const whereLabel = d => {
    const t = T(), i = d.ref_installment_id && instById(d.ref_installment_id);
    if (!d.ref_target) return t.where.note;              // a demo letter: a note's source
    return t.where[d.ref_target] + (i ? ' ' + i.seq : '');
  };
  const ico = {
    plus: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>',
    back: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3L5 8l5 5"/></svg>',
    file: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h6l3 3v8H4z M10 2.5v3h3"/></svg>',
    eye: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/></svg>',
    edit: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 13l1-3.5L11 2.5l2.5 2.5L6.5 12z"/></svg>',
    check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7"/></svg>',
    box: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 5V2.5H5 M11 2.5h2.5V5 M13.5 11v2.5H11 M5 13.5H2.5V11"/></svg>',
    search: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>',
    cal: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4h11v9.5h-11z M2.5 7h11 M5.5 2.5v3 M10.5 2.5v3"/></svg>',
    firm: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 13.5V5.5l5-3 5 3v8z M6 13.5v-4h4v4"/></svg>',
    wallet: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4.5h10a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-10z M2.5 4.5l8-2v2 M10.5 9h3"/></svg>',
    receipt: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 2.5h9v11l-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1-1.5 1z M6 6h4 M6 8.5h4"/></svg>',
    clip: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 4.5l-5 5a1.4 1.4 0 0 0 2 2l5.5-5.5a2.8 2.8 0 0 0-4-4L3.5 7.5a4.2 4.2 0 0 0 6 6l4-4"/></svg>',
  };

  // amounts: typed as people write them ("20,000", "20000.5", Arabic digits) → integer cents, never floats
  function cents(s) {
    const t = String(s || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[٫]/g, '.').replace(/[,\s،]/g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
    const [w, f = ''] = t.split('.');
    const v = parseInt(w, 10) * 100 + parseInt((f + '00').slice(0, 2), 10);
    return v > 0 ? v : null;
  }

  // dates: always typed day / month / year (the browser's own date box follows ITS locale — mm/dd on many
  // machines — and a swapped day and month is a wrong due date). "10/12/2026", "10-12-26", Arabic digits → ISO.
  function isoDate(s) {
    const t = String(s || '').trim().replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    const m = t.match(/^(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{2}|\d{4})$/);
    if (!m) return null;
    const d = +m[1], mo = +m[2], y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d || y < 2000 || y > 2100) return null;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  // amounts are grouped while typed ("36000" → "36,000"); the caret keeps its place among the digits
  function groupAmount(el) {
    const raw = el.value, at = el.selectionStart == null ? raw.length : el.selectionStart;
    const norm = s => s.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/٫/g, '.');
    const keep = s => norm(s).replace(/[^\d.]/g, '');
    let t = keep(raw);
    const dot = t.indexOf('.');
    let w = dot < 0 ? t : t.slice(0, dot), f = dot < 0 ? null : t.slice(dot + 1).replace(/\./g, '').slice(0, 2);
    w = w.replace(/^0+(?=\d)/, '');
    const out = w.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f === null ? '' : '.' + f);
    if (out === raw) return;
    const before = keep(raw.slice(0, at)).length;               // digits (and dot) left of the caret
    let pos = 0, n = 0;
    while (pos < out.length && n < before) { if (out[pos] !== ',') n++; pos++; }
    el.value = out;
    try { el.setSelectionRange(pos, pos); } catch (_) { /* not focusable */ }
  }
  // the date laws (Ibrahim, 2026-11-13): a contract is signed today or earlier, never in the future; an installment
  // may fall due years ahead, but never before the contract was signed (the same day is fine: a down payment)
  const today = () => C.todayBaghdad();
  function dueLaw(c, iso) {
    if (iso && c.signed_on && iso < c.signed_on) return T().dueBeforeSigned(X.date(c.signed_on));
    return '';
  }
  const dmyFull = iso => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
  const dateField = (name, value, bad) => `
    <input class="fld-in${bad ? ' bad' : ''}" name="${name}" inputmode="numeric" autocomplete="off" dir="ltr" value="${esc(value)}" placeholder="dd/mm/yyyy" data-date="1">
    <small class="fld-msg${bad ? ' bad' : ' ok'}" data-date-echo="${name}">${esc(bad || (isoDate(value) ? X.date(isoDate(value)) : X.T.dateHint))}</small>`;

  // ── render: the app calls this whenever the Admin view is on screen ─────────────────────────────
  function render(host, helpers) {
    X = helpers; main = host;
    S.setUser(X.user);
    if ((A.view === 'work' || A.view === 'pay') && !contract(A.cid)) { A.view = 'home'; A.cid = null; ses.set('cid', null); }
    if (A.view === 'pay' && !A.payF) A.view = 'home';                    // a reload leaves an unsaved payment behind
    if (A.view === 'credit' && !A.crF) A.view = 'home';
    document.body.classList.toggle('ws-on', A.view === 'work' || A.view === 'pay' || A.view === 'credit');
    if (A.view === 'home') return home();
    if (A.view === 'new') return newForm();
    if (A.view === 'pay') return payPage();
    if (A.view === 'credit') return crPage();
    return workspace();
  }
  function go(view, cid) {
    A.view = view; A.cid = cid || null; A.pop = null; A.ask = null; A.done = false; A.err = {};
    A.docId = null; A.refAsk = null; A.focusAfter = null; A.redraw = null; A.revConfirm = null;
    if (A.pane) { A.pane = null; V.close(); }
    if (view !== 'pay') payView = null;
    if (view !== 'credit') crView = null;
    ses.set('cid', view === 'work' ? cid : null); ses.set('doc', null);
    if (view === 'new') { A.form = { firm: '', ref: '', signed: '' }; A.file = null; }
    render(main, X);
    root.scrollTo(0, 0);
  }

  // ── home = search (Ibrahim, 2026-11-13): the Admin arrives with a date or a firm in mind. One text box (contract
  //    number · firm · amount · note · file name) + two filters — month/year (contracts with ≥1 installment due in it)
  //    and firm. Results look like the Boss's: contracts with closed drawers; a drawer holds the WHOLE schedule, the
  //    matching installments marked. «عقد جديد» sits beside the search: add and search on one screen.
  const Q = (() => { try { return JSON.parse(ses.get('q') || 'null'); } catch (e) { return null; } })() || { text: '', month: '', firm: '', open: null };
  const keepQ = () => ses.set('q', JSON.stringify(Q));
  let ixMemo = { v: -1, ix: null };
  const ixNow = () => (ixMemo.v === S.version && ixMemo.ix ? ixMemo.ix : (ixMemo = { v: S.version, ix: C.index(D()) }).ix);
  const fold = s => String(s == null ? '' : s).toLowerCase().replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[,،\s]/g, '');
  const units = c => (c % 100 ? (c / 100).toFixed(2) : String(c / 100));          // 1200000 → "12000"
  const RANK = { overdue: 6, due: 5, today: 4, partial: 3, current: 2, paid: 1 };   // the Boss's order (calc.month)

  // every contract (drafts first, then the Admin's latest, then the rest by firm) that passes the three filters,
  // with the installments that matched (by the month, or by an amount / note typed in the box)
  function results() {
    const d = D(), text = fold(Q.text), byNum = /^\d+(\.\d{1,2})?$/.test(text);
    const docName = id => (d.documents.find(x => x.id === id) || {}).file_name;
    const order = c => (c.state === 'draft' ? 0 : own('contracts', c.id) ? 1 : 2);
    const list = d.contracts.slice().sort((a, b) => order(a) - order(b)
      || (order(a) < 2 ? String(b.created_at).localeCompare(String(a.created_at)) : 0)
      || firmOf(a).name.localeCompare(firmOf(b).name) || a.ref.localeCompare(b.ref));
    const out = [];
    for (const c of list) {
      if (Q.firm && c.firm_id !== Q.firm) continue;
      const insts = instsOf(c.id), hits = new Set();
      if (Q.month) {
        insts.filter(i => i.due_on.slice(0, 7) === Q.month).forEach(i => hits.add(i.id));
        if (!hits.size) continue;
      }
      if (text) {
        const docs = docsOf(c).filter(Boolean).map(x => x.file_name);
        const cHay = [c.ref, firmOf(c).name, ...docs, ...d.notes.filter(n => n.contract_id === c.id && !n.installment_id).map(n => n.text)].map(fold);
        const whole = cHay.some(h => h.includes(text)) || (byNum && c.total_cents && units(c.total_cents) === text);
        const iHits = insts.filter(i => (byNum && units(i.amount_cents) === text)
          || d.notes.some(n => n.installment_id === i.id && fold(n.text).includes(text)));
        if (!whole && !iHits.length) continue;
        if (Q.month) { if (!whole) { const m = new Set(iHits.map(i => i.id)); [...hits].forEach(id => { if (!m.has(id)) hits.delete(id); }); if (!hits.size) continue; } }
        else iHits.forEach(i => hits.add(i.id));
      }
      out.push({ c, insts, hits, docName });
    }
    return out;
  }

  // The search reads left → right in both languages, like the Boss's list (Ibrahim, 2026-11-13): the box on the left,
  // the filters on the right; then FIRM (closed, its name only) → its CONTRACTS (closed) → a contract opens exactly like
  // the Boss's drawer. One motion for both roles. (Admin-only click names: the Boss listens to clicks page-wide.)
  const chevL = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M7.5 2.5L4 6l3.5 3.5"/></svg>';
  const chevR = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5L8 6l-3.5 3.5"/></svg>';
  const chevD = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4.5l4 4 4-4"/></svg>';
  const mLabel = ym => `${X.T.months[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;

  function home() {
    const t = T(), d = D();
    const firmIds = new Set(d.contracts.map(c => c.firm_id));
    const firms = d.firms.filter(f => firmIds.has(f.id)).sort((a, b) => a.name.localeCompare(b.name));
    main.innerHTML = `
      <section class="adm srch" dir="ltr">
        <header class="adm-top">
          <h1 dir="${X.T.dir}">${esc(t.title)}</h1>
          <button type="button" class="adm-btn primary" data-a="new" dir="${X.T.dir}">${ico.plus}<span>${esc(t.newContract)}</span></button>
        </header>
        <form class="srch-bar" id="adm-search" role="search" novalidate>
          <label class="srch-box">${ico.search}<input name="text" type="search" autocomplete="off" dir="auto" value="${esc(Q.text)}" placeholder="${esc(t.searchHint)}" aria-label="${esc(t.searchHint)}"></label>
          <div class="srch-month"></div>
          <label class="srch-sel">${ico.firm}<select name="firm" aria-label="${esc(t.filterFirm)}" dir="auto">
            <option value="">${esc(t.allFirms)}</option>${firms.map(f => `<option value="${f.id}"${Q.firm === f.id ? ' selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label>
        </form>
        <div class="srch-results"></div>
      </section>`;
    paintMonth();
    paintResults();
  }

  // the month filter = the Boss's own calendar (a year, twelve months, «هذا الشهر»), plus «كل الأشهر» to clear it
  let pick = { open: false, y: +today().slice(0, 4) };
  function paintMonth() {
    const host = main.querySelector('.srch-month'); if (!host) return;
    const t = T(), now = today(), NY = +now.slice(0, 4), NM = +now.slice(5, 7);
    const sel = Q.month ? { y: +Q.month.slice(0, 4), m: +Q.month.slice(5, 7) } : null;
    host.innerHTML = `
      <button type="button" class="month-label srch-mbtn${Q.month ? ' on' : ''}" data-a="pick" aria-haspopup="dialog" aria-expanded="${pick.open}">
        ${ico.cal}<span dir="${X.T.dir}">${esc(Q.month ? mLabel(Q.month) : t.allMonths)}</span>${chevD}</button>
      ${pick.open ? `
      <div class="picker" role="dialog" aria-label="${esc(X.T.pickMonth)}" dir="${X.T.dir}">
        <div class="picker-year" dir="ltr">
          <button type="button" class="icon-btn" data-a="py" data-d="-1" aria-label="${esc(X.T.prevYear)}">${chevL}</button>
          <span>${pick.y}</span>
          <button type="button" class="icon-btn" data-a="py" data-d="1" aria-label="${esc(X.T.nextYear)}">${chevR}</button>
        </div>
        <div class="picker-months">
          ${X.T.months.map((n, i) => `<button type="button" data-a="pm" data-m="${i + 1}" class="${sel && sel.y === pick.y && sel.m === i + 1 ? 'on' : ''} ${pick.y === NY && i + 1 === NM ? 'now' : ''}">${esc(n)}</button>`).join('')}
        </div>
        <div class="srch-pick-foot">
          <button type="button" class="picker-today" data-a="pm-now">${esc(X.T.thisMonthBtn)}</button>
          <button type="button" class="picker-today" data-a="pm-all">${esc(t.allMonths)}</button>
        </div>
      </div>` : ''}`;
  }
  function setMonthQ(ym) { Q.month = ym; pick.open = false; keepQ(); paintMonth(); paintResults(); }

  // only the results are redrawn while typing (the box keeps its focus and caret)
  function paintResults() {
    const host = main.querySelector('.srch-results'); if (!host) return;
    const t = T(), list = results(), any = Q.text.trim() || Q.month || Q.firm;
    const byFirm = new Map();
    for (const r of list) { const id = r.c.firm_id; if (!byFirm.has(id)) byFirm.set(id, []); byFirm.get(id).push(r); }
    const groups = [...byFirm.entries()].map(([id, rs]) => ({ firm: D().firms.find(f => f.id === id), rs }))
      .sort((a, b) => a.firm.name.localeCompare(b.firm.name));
    host.innerHTML = `
      <div class="srch-count"><span dir="${X.T.dir}">${esc(t.firmsN(groups.length))} · ${esc(t.results(list.length))}</span>
        ${any ? `<button type="button" class="adm-link" data-a="clear" dir="${X.T.dir}">${esc(t.clear)}</button>` : ''}</div>
      ${groups.length ? `<ul class="firms adm-firms">${groups.map(firmLi).join('')}</ul>` : `<p class="adm-empty" dir="${X.T.dir}">${esc(t.noResults)}</p>`}`;
  }

  // a firm: its name only, closed; open → its contracts, each closed
  function firmLi({ firm, rs }) {
    const open = Q.firmOpen === firm.id;
    return `
      <li class="firm${open ? ' open' : ''}">
        <div class="firm-bar adm-fbar">
          <button type="button" class="adm-fopen" data-a="firm-open" data-f="${firm.id}" aria-expanded="${open}"><span class="firm-name" dir="auto">${esc(firm.name)}</span></button>
          ${(() => { const bal = S.creditOf(firm.id); return `<button type="button" class="adm-mark cr-mark${bal > 0 ? ' has' : ''}" data-a="cr-pane" data-f="${firm.id}" title="${esc(T().cr.title)}" aria-label="${esc(T().cr.title)}">${ico.wallet}${bal > 0 ? `<b dir="ltr">${money(bal)}</b>` : ''}</button>`; })()}
          <button type="button" class="adm-fcaret" data-a="firm-open" data-f="${firm.id}" tabindex="-1" aria-hidden="true"><svg class="firm-caret" viewBox="0 0 12 12"><path d="M2 4.5l4 4 4-4"/></svg></button>
        </div>
        ${open ? `<ul class="adm-cons">${rs.map(contractLi).join('')}</ul>` : ''}
      </li>`;
  }

  function contractLi({ c, insts, hits }) {
    const t = T(), ix = ixNow(), now = today(), open = Q.open === c.id, draft = c.state === 'draft';
    const st = insts.map(i => ({ i, s: C.instStatus(ix, i, now) }));
    const paid = st.reduce((a, x) => a + x.s.paid_cents, 0);
    let worst = 'paid', dpd = 0;
    for (const { s } of st) {
      if (s.status === 'paid') continue;
      const k = s.status;
      if (RANK[k] > RANK[worst]) worst = k;
      dpd = Math.max(dpd, s.dpd);
    }
    const chip = draft ? `<span class="adm-chip draft" dir="${X.T.dir}">${esc(t.draftChip)}</span>`
      : `<span class="chip st-${worst} b${C.bucketOf(dpd)}${worst === 'due' && dpd > 0 ? ' late' : ''}" dir="${X.T.dir}"><i></i>${esc(X.T.st[worst])}</span>`;
    const meta = draft ? esc(t.insts(insts.length))
      : `${esc(t.paidLbl)} <b class="num" dir="ltr">${money(paid)}</b> ${esc(t.of)} <b class="num" dir="ltr">${money(c.total_cents || 0)}</b>`;
    return `
      <li class="adm-con${open ? ' open' : ''}">
        <div class="adm-cbar">
          <button type="button" class="adm-copen" data-a="toggle" data-c="${c.id}" aria-expanded="${open}">
            <span class="adm-cref">${esc(c.ref)}</span>
            <span class="adm-cmeta" dir="${X.T.dir}">${meta}</span>
          </button>
          ${(() => { const n = draft ? 0 : paymentsOf(c.id).length + L().vouchers.filter(v => v.kind === 'settlement' && v.contract_id === c.id).length;
            return n ? `<button type="button" class="adm-mark pay-mark" data-a="pays-pane" data-c="${c.id}" title="${esc(t.pay.payments)}" aria-label="${esc(t.pay.payments)}">${ico.receipt}<b dir="ltr">${n}</b></button>` : ''; })()}
          <button type="button" class="adm-cend" data-a="toggle" data-c="${c.id}" tabindex="-1" aria-hidden="true">${chip}<svg class="firm-caret" viewBox="0 0 12 12"><path d="M2 4.5l4 4 4-4"/></svg></button>
        </div>
        ${open ? drawerOf(c, st, hits) : ''}
      </li>`;
  }

  // a contract's drawer = the Boss's drawer (same columns, order, chips, late tint); its first column is the installment
  function drawerOf(c, st, hits) {
    const t = T(), B = X.T, draft = c.state === 'draft', n = st.length;
    // every cell clicks exactly like the Boss's (his own openDoc): the amount → its box, or the clause beside the
    // transfer once money came in; the date → its box; «مسدد» → the transfer; the note → its source. The installment
    // column is a label; only «فتح العقد» opens the workspace.
    const pf = X.proofIcon;
    const row = ({ i, s }) => {
      const note = noteOf(i.id), late = s.dpd > 0 && s.status !== 'paid';
      const doc = (kind, extra) => `data-a="doc" data-k="${kind}" data-i="${i.id}"${extra || ''}`;
      const chipHtml = `<span class="chip st-${s.status} b${s.bucket}${late ? ' late' : ''}" dir="${B.dir}"><i></i>${esc(B.st[s.status])}${late ? `<span class="chip-days">${esc(B.days(s.dpd))}</span>` : ''}</span>`;
      const status = draft ? '<span class="cell status" role="cell"><span class="srch-dash">—</span></span>'
        : s.status === 'paid' && s.paid_cents > 0
          ? `<button type="button" class="cell status link" role="cell" ${doc('proof')} title="${esc(B.transfer)}">${chipHtml.replace(/<\/span>$/, pf + '</span>')}</button>`
          : `<span class="cell status" role="cell">${chipHtml}</span>`;
      return `
        <div class="row${s.status === 'overdue' && !draft ? ` is-late b${s.bucket}` : ''}${hits.has(i.id) ? ' is-hit' : ''}" role="row">
          <span class="cell ref" role="cell"><span class="v" dir="${B.dir}">${esc(B.installment(i.seq, n))}</span></span>
          <button type="button" class="cell amt link" role="cell" ${doc(s.paid_cents > 0 ? 'compare' : 'clause', ' data-part="amount"')} title="${esc(B.installment(i.seq, n))}"><span class="v">${money(i.amount_cents)}</span>${pf}${!draft && s.paid_cents > 0 && s.remaining_cents > 0 ? `<small dir="${B.dir}">${esc(B.stripLeft)} ${money(s.remaining_cents)}</small>` : ''}</button>
          <button type="button" class="cell date link" role="cell" ${doc('clause', ' data-part="date"')} title="${esc(X.date(i.due_on))}"><span class="v">${esc(X.dmy(i.due_on))}</span>${pf}</button>
          ${status}
          ${note ? `<button type="button" class="cell note link" role="cell" ${doc('note', ` data-n="${note.id}"`)} title="${esc(note.text)}">${ico.file}<span dir="auto">${esc(note.text)}</span></button>`
            : '<span class="cell note none" role="cell">—</span>'}
        </div>`;
    };
    return `
      <div class="adm-con-tools" dir="${B.dir}">
        <button type="button" class="adm-btn small" data-a="open" data-c="${c.id}">${ico.file}<span>${esc(t.openContract)}</span></button>
        ${draft ? '' : `<button type="button" class="adm-btn small primary" data-a="pay" data-c="${c.id}">${ico.plus}<span>${esc(t.pay.btn)}</span></button>`}
        ${c.signed_on ? `<span class="srch-signed">${esc(B.signedOn(X.date(c.signed_on)))}</span>` : ''}
        ${A.flash && A.flash.cid === c.id ? `<span class="pay-flash">${ico.check}<span>${esc(A.flash.text)}</span></span>` : ''}
      </div>
      <div class="drawer" role="table">
        <div class="row row-head" role="row">
          <span role="columnheader" dir="${B.dir}">${esc(t.colInst)}</span>
          <span role="columnheader" class="num" dir="${B.dir}">${esc(B.colAmount)}</span>
          <span role="columnheader" dir="${B.dir}">${esc(B.colDate)}<small class="hint" dir="${B.dir}">${esc(B.dateHint)}</small></span>
          <span role="columnheader" dir="${B.dir}">${esc(B.colStatus)}</span>
          <span role="columnheader" dir="${B.dir}">${esc(B.colNote)}</span>
        </div>
        ${n ? st.map(row).join('') : `<p class="adm-empty small" dir="${B.dir}">${esc(t.noInst)}</p>`}
      </div>
      `;
  }

  // an installment clicked in a drawer → its contract's workspace, that installment's box brought into view
  function openInst(cid, instId) {
    const i = instById(instId), p = i && parts(i);
    go('work', cid);
    A.focusAfter = p ? p.amount_anchor_id || p.date_anchor_id : null;
  }

  // ── «تسجيل دفعة» — recording a payment (Ibrahim, 2026-11-14; cash application, the standard) ─────────────────────
  //   The receipt on the right, its amount line boxed (required — the Boss lands on it); on the left the amount, the
  //   date received, the bank reference, and the split: oldest unpaid first, automatically, changeable by hand.
  //   Gate: the split = the amount exactly · no installment above what it still owes · never above what the contract
  //   owes. Rules: finished contracts only · received ≤ today and ≥ the signing date · a bank reference once per firm.
  //   Mistakes are reversed («إلغاء الدفعة»), never overwritten.
  let payView = null;
  const paymentsOf = cid => D().payments.filter(p => p.contract_id === cid).sort((a, b) => a.received_on.localeCompare(b.received_on));
  const openList = c => instsOf(c.id).map(i => ({ i, owed: S.owedOf(i.id) })).filter(x => x.owed > 0);
  const splitSum = () => Object.values(A.payF.split).reduce((s, v) => s + (v || 0), 0);
  function autoSplit(c) {
    const P = A.payF, r = C.fifo(openList(c).map(x => ({ id: x.i.id, due_on: x.i.due_on, owed_cents: x.owed })), cents(P.amount) || 0);
    P.split = Object.fromEntries(r.split.map(x => [x.id, x.cents]));
  }
  function payStart(cid) {
    A.payF = { source: 'transfer', amount: '', date: '', ref: '', file: null, path: null, box: null, split: {}, manual: false, err: {}, busy: false };
    go('pay', cid);
  }

  function payPage() {
    const t = T().pay, c = contract(A.cid), P = A.payF;
    // the source (2026-11-14): when the firm holds credit, the Admin picks «تحويل جديد» or «من الرصيد تحت الحساب»
    const credit = S.creditOf(c.firm_id), fromCredit = P.source === 'credit' && credit > 0;
    if (P.source === 'credit' && !credit) P.source = 'transfer';
    const srcBtn = (k, label) => `<button type="button" role="radio" aria-checked="${P.source === k}" class="${P.source === k ? 'on' : ''}" data-a="pay-src" data-k="${k}">${esc(label)}</button>`;
    const deps = fromCredit ? S.deposits(c.firm_id).filter(p => !p.voided_at).map(p => ({ p, left: C.depositLeft(D(), p) })).filter(x => x.left > 0) : [];
    main.innerHTML = `
      <section class="ws pay" dir="ltr">
        <aside class="ws-side" dir="${X.T.dir}">
          <button type="button" class="adm-back" data-a="home">${ico.back}<span>${esc(T().backList)}</span></button>
          <header class="ws-head">
            <div class="ws-ref" dir="ltr">${esc(c.ref)}</div>
            <div class="ws-firm" dir="auto">${esc(firmOf(c).name)}</div>
            <span class="adm-chip pay-chip">${esc(t.title)}</span>
          </header>
          <form id="pay-form" class="pay-form" novalidate>
            ${credit > 0 ? `<div class="fld"><span class="fld-label">${esc(t.source)}</span>
              <div class="ws-kind pay-src" role="radiogroup">${srcBtn('transfer', t.srcNew)}${srcBtn('credit', t.srcCredit(money(credit)))}</div></div>` : ''}
            <label class="fld"><span class="fld-label">${esc(t.amount)}</span>
              <input class="fld-in num${P.err.amount ? ' bad' : ''}" name="amount" inputmode="decimal" autocomplete="off" dir="ltr" value="${esc(P.amount)}" placeholder="20,000">
              ${P.err.amount ? `<small class="fld-msg bad">${esc(P.err.amount)}</small>` : ''}</label>
            ${fromCredit ? `<p class="pay-today">${ico.check}<span>${esc(t.appliedToday(X.date(today())))}</span></p>` : `
            <div class="fld-row">
              <label class="fld"><span class="fld-label">${esc(t.received)}</span>${dateField('received', P.date, P.err.date)}</label>
              <label class="fld"><span class="fld-label">${esc(t.bankRef)}</span>
                <input class="fld-in${P.err.ref ? ' bad' : ''}" name="bankref" autocomplete="off" dir="ltr" value="${esc(P.ref)}" placeholder="${esc(t.bankRefHint)}">
                ${P.err.ref ? `<small class="fld-msg bad">${esc(P.err.ref)}</small>` : ''}</label>
            </div>`}
            <h3 class="ws-h3">${esc(t.split)}</h3>
            <div class="pay-split"></div>
            ${P.err.split ? `<p class="ws-gate bad">${esc(P.err.split)}</p>` : ''}
            <footer class="ws-foot">
              <p class="pay-need${P.err.file || P.err.box ? ' bad' : ''}">${esc(fromCredit ? '' : P.err.file || P.err.box || (!P.file ? t.fileNeeded : !P.box ? t.boxNeeded : ''))}</p>
              <button type="submit" class="adm-btn primary wide"${P.busy || (!fromCredit && (!P.file || !P.box)) ? ' disabled' : ''}>${ico.check}<span>${esc(P.busy ? T().saving : t.save)}</span></button>
            </footer>
          </form>
        </aside>
        <div class="ws-doc">
          ${fromCredit ? `
          <div class="ws-doc-bar pay-bar" dir="${X.T.dir}"><span class="ws-doc-name">${ico.file}<span>${esc(t.creditSide)}</span></span></div>
          <div class="cr-src" dir="${X.T.dir}">
            <p class="cr-proof">${esc(t.creditProof)}</p>
            <ul>${deps.map(x => `<li><span class="num" dir="ltr">${esc(X.dmy(x.p.received_on))}</span><b class="num" dir="ltr">${money(x.p.amount_cents)}</b>
              <span class="pay-ref" dir="ltr">${esc(x.p.bank_ref)}</span><small>${esc(T().cr.left(money(x.left)))}</small>
              <button type="button" class="adm-link" data-a="cr-doc" data-p="${x.p.id}">${esc(t.viewReceipt)}</button></li>`).join('')}</ul>
          </div>` : `
          <div class="ws-doc-bar pay-bar" dir="${X.T.dir}">
            <span class="ws-doc-name">${ico.file}<span>${esc(t.receipt)}</span></span>
            <span class="ws-doc-meta pay-meta">${P.file ? `<span dir="ltr">${esc(P.file.name)}</span> · ` : ''}${esc(!P.file ? t.dropHint : P.box ? t.boxDone : t.drawHint)}</span>
            ${P.file ? `<label class="adm-link">${esc(T().fileChange)}<input type="file" accept="application/pdf,.pdf" data-a="pay-file" hidden></label>` : ''}
          </div>
          ${P.file ? '<div class="ws-scroll can-draw pay-scroll"></div>'
            : `<label class="adm-file pay-drop" data-drop="pay">${ico.file}<span>${esc(t.drop)}</span><small>${esc(T().filePdf)}</small><input type="file" accept="application/pdf,.pdf" data-a="pay-file" hidden></label>`}`}
        </div>
      </section>`;
    paintSplit();
    if (!fromCredit && P.file) paintReceipt();
  }

  // the split: every installment still owing, oldest first; a tick or a typed amount switches to the Admin's own split
  function paintSplit() {
    const host = main.querySelector('.pay-split'); if (!host) return;
    const t = T().pay, P = A.payF, c = contract(A.cid), list = openList(c);
    if (!list.length) { host.innerHTML = `<p class="adm-empty small">${esc(t.nothingOwed)}</p>`; return; }
    host.innerHTML = `
      <ul class="pay-list">${list.map(({ i, owed }) => {
        const v = P.split[i.id] || 0;
        return `
        <li class="pay-li${v > 0 ? ' on' : ''}" data-i="${i.id}">
          <label class="pay-chk"><input type="checkbox" name="chk" value="${i.id}"${v > 0 ? ' checked' : ''}><span class="ws-seq">${i.seq}</span></label>
          <span class="pay-what"><b class="num" dir="ltr">${esc(X.dmy(i.due_on))}</b><small>${esc(t.owed)} <span class="num" dir="ltr">${money(owed)}</span></small></span>
          <input class="fld-in num pay-in" name="alloc" data-i="${i.id}" inputmode="decimal" autocomplete="off" dir="ltr" value="${v ? money(v) : ''}" placeholder="0" aria-label="${esc(t.allocFor(i.seq))}">
          <span class="pay-tag"></span>
        </li>`;
      }).join('')}</ul>
      <div class="pay-sum"></div>`;
    paintTotal();
  }
  function paintTotal() {
    const host = main.querySelector('.pay-sum'); if (!host) return;
    const t = T().pay, P = A.payF, c = contract(A.cid), list = openList(c), amt = cents(P.amount) || 0, sum = splitSum();
    const owedAll = list.reduce((s, x) => s + x.owed, 0);
    for (const li of main.querySelectorAll('.pay-li')) {
      const x = list.find(y => y.i.id === li.dataset.i), v = P.split[li.dataset.i] || 0;
      li.classList.toggle('on', v > 0); li.classList.toggle('bad', v > x.owed);
      li.querySelector('.pay-tag').textContent = v > x.owed ? t.tooMuch : v === x.owed ? t.full : v > 0 ? t.part : '';
      const box = li.querySelector('input[name=chk]'); if (box) box.checked = v > 0;
    }
    const state = !amt ? 'none' : amt > owedAll ? 'over' : sum === amt ? 'ok' : 'bad';
    host.className = 'pay-sum s-' + state;
    host.innerHTML = `
      <span>${state === 'over' ? esc(t.overContract(money(owedAll)))
        : `${esc(t.allocated)} <b class="num" dir="ltr">${money(sum)}</b> ${esc(T().of)} <b class="num" dir="ltr">${money(amt)}</b>${state === 'ok' ? ` ${ico.check}` : ''}`}</span>
      ${P.manual ? `<button type="button" class="adm-link" data-a="pay-auto">${esc(t.autoSplit)}</button>` : ''}`;
  }

  // the receipt: the same viewer; one box around the amount line (drag again to redraw it)
  function paintReceipt() {
    const P = A.payF, sc = main.querySelector('.pay-scroll'), my = { memo: null, sc };
    payView = my;
    V.paint({ path: P.path, anchor: null, onLaidOut: memo => { if (payView !== my) return; my.memo = memo; payMark(); } }, sc, () => payView === my, X.T.loading);
    let d = null;
    sc.addEventListener('pointerdown', e => {
      if (e.button !== 0 || payView !== my || !my.memo) return;
      const pageEl = e.target.closest('.page'); if (!pageEl) return;
      const r = pageEl.getBoundingClientRect();
      d = { pageEl, r, x0: e.clientX - r.left, y0: e.clientY - r.top, el: document.createElement('div'), id: e.pointerId };
      d.el.className = 'ws-sel'; pageEl.appendChild(d.el);
      try { sc.setPointerCapture(e.pointerId); } catch (err) { /* the drag still works inside the page */ }
      e.preventDefault();
    });
    sc.addEventListener('pointermove', e => {
      if (!d || e.pointerId !== d.id) return;
      const x1 = Math.max(0, Math.min(d.r.width, e.clientX - d.r.left)), y1 = Math.max(0, Math.min(d.r.height, e.clientY - d.r.top));
      d.box = [Math.min(d.x0, x1), Math.min(d.y0, y1), Math.abs(x1 - d.x0), Math.abs(y1 - d.y0)];
      Object.assign(d.el.style, { left: d.box[0] + 'px', top: d.box[1] + 'px', width: d.box[2] + 'px', height: d.box[3] + 'px' });
    });
    const end = e => {
      if (!d || e.pointerId !== d.id) return;
      const dd = d; d = null; dd.el.remove();
      if (!dd.box || dd.box[2] < 8 || dd.box[3] < 6) return;
      const [x, y, w, h] = dd.box;
      P.box = { page: my.memo.pages.findIndex(p => p.box === dd.pageEl) + 1, box: [x / dd.r.width, y / dd.r.height, w / dd.r.width, h / dd.r.height] };
      P.err.box = ''; payMark(); payReady();
    };
    sc.addEventListener('pointerup', end);
    sc.addEventListener('pointercancel', e => { if (d && e.pointerId === d.id) { d.el.remove(); d = null; } });
  }
  function payMark() {
    const my = payView, P = A.payF; if (!my || !my.memo) return;
    my.memo.wrap.querySelectorAll('.ws-mark').forEach(e => e.remove());
    if (!P.box) return;
    const p = my.memo.pages[P.box.page - 1]; if (!p) return;
    const [x, y, w, h] = P.box.box, W = p.vp.width, H = p.vp.height, m = document.createElement('div');
    m.className = 'ws-mark is-pay';
    Object.assign(m.style, { left: x * W + 'px', top: y * H + 'px', width: w * W + 'px', height: h * H + 'px' });
    m.innerHTML = `<span class="ws-tag words" dir="auto">${esc(T().pay.boxTag)}</span>`;
    p.box.appendChild(m);
  }
  function payReady() {                                     // the box decides whether «حفظ الدفعة» can be pressed
    const t = T().pay, P = A.payF;
    const btn = main.querySelector('#pay-form button[type=submit]'); if (btn) btn.disabled = P.busy || (P.source !== 'credit' && (!P.file || !P.box));
    const need = main.querySelector('.pay-need'); if (need) { need.textContent = !P.file ? t.fileNeeded : !P.box ? t.boxNeeded : ''; need.classList.remove('bad'); }
    const meta = main.querySelector('.pay-meta');
    if (meta && P.file) meta.innerHTML = `<span dir="ltr">${esc(P.file.name)}</span> · ${esc(P.box ? t.boxDone : t.drawHint)}`;
  }
  async function takePayFile(file) {
    const P = A.payF;
    try {
      const buf = await file.arrayBuffer(), pages = await V.pageCount(buf);
      P.file = { name: file.name, buf, pages }; P.path = S.stage(buf); P.box = null; P.err.file = '';
    } catch (e) { P.err.file = T().fileBad; }
    payPage();
  }
  function payInput(el) {
    const P = A.payF, c = contract(A.cid); if (!P) return;
    if (el.classList.contains('bad') && el.name !== 'received') {         // an error goes the moment its field is edited
      el.classList.remove('bad'); const m = el.parentNode.querySelector('.fld-msg.bad'); if (m) m.remove();
      if (el.name === 'amount') delete P.err.amount; if (el.name === 'bankref') delete P.err.ref;
    }
    if (el.name === 'amount') { P.amount = el.value; if (!P.manual) { autoSplit(c); paintSplit(); } else paintTotal(); }
    else if (el.name === 'received') P.date = el.value;
    else if (el.name === 'bankref') P.ref = el.value;
    else if (el.name === 'alloc') { groupAmount(el); P.split[el.dataset.i] = cents(el.value) || 0; P.manual = true; paintTotal(); }
  }
  function payTick(el) {                                    // a tick fills what the payment still has free, up to what it owes
    const P = A.payF, c = contract(A.cid), x = openList(c).find(y => y.i.id === el.value);
    const free = (cents(P.amount) || 0) - (splitSum() - (P.split[el.value] || 0));
    P.split[el.value] = el.checked ? Math.max(0, Math.min(x.owed, free)) : 0;
    P.manual = true; paintSplit();
  }
  async function savePay() {
    const t = T().pay, P = A.payF, c = contract(A.cid), e = (P.err = {});
    const fromCredit = P.source === 'credit', credit = S.creditOf(c.firm_id);
    const amt = cents(P.amount), iso = isoDate(P.date), list = openList(c), owedAll = list.reduce((s, x) => s + x.owed, 0);
    if (!amt) e.amount = T().badAmount;
    if (!fromCredit) {
      if (!iso) e.date = P.date.trim() ? T().badDateFmt : t.dateNeeded;
      else if (iso > today()) e.date = t.dateFuture;
      else if (c.signed_on && iso < c.signed_on) e.date = t.dateBeforeSigned(X.date(c.signed_on));
      if (!P.ref.trim()) e.ref = T().required;
      else if (S.bankRefTaken(c.firm_id, P.ref)) e.ref = t.refTaken;
      if (!P.file) e.file = t.fileNeeded; else if (!P.box) e.box = t.boxNeeded;
    }
    if (amt) {
      const over = list.find(x => (P.split[x.i.id] || 0) > x.owed);
      if (amt > owedAll) e.split = t.overContract(money(owedAll));
      else if (fromCredit && amt > credit) e.split = t.overCredit(money(credit));
      else if (over) e.split = t.overInst(over.i.seq);
      else if (splitSum() !== amt) e.split = t.splitBad(money(splitSum()), money(amt));
    }
    if (Object.keys(e).some(k => e[k])) return payPage();
    P.busy = true; payReady();
    const split = list.map(x => ({ id: x.i.id, cents: P.split[x.i.id] || 0 }));
    try {
      if (fromCredit) {
        const v = S.applyCredit({ contractId: c.id, amountCents: amt, split });   // the system writes the settlement voucher
        A.flash = { cid: c.id, text: t.savedCredit(money(amt), no4(v.no)) };
      } else {
        await S.recordPayment({ contractId: c.id, receivedOn: iso, amountCents: amt, bankRef: P.ref, fileName: P.file.name,
          buf: P.file.buf, pages: P.file.pages, page: P.box.page, box: P.box.box, split });
        A.flash = { cid: c.id, text: t.saved(money(amt)) };
      }
      Object.assign(Q, { firmOpen: c.firm_id, open: c.id }); keepQ();
      A.payF = null; payView = null;
      go('home');
    } catch (err) { P.busy = false; e.split = String(err.message || err); payPage(); }
  }

  // in a contract's drawer: its payments — transfers and uses of the firm's credit (each with its settlement voucher),
  // in date order; each can be reversed in two steps (a transfer is voided; a credit use gets a reversing entry)
  function payHistory(c) {
    const t = T().pay, B = X.T;
    const items = paymentsOf(c.id).map(p => ({ on: p.received_on, p }))
      .concat(L().vouchers.filter(v => v.kind === 'settlement' && v.contract_id === c.id).map(v => ({ on: v.on, v })))
      .sort((a, b) => a.on.localeCompare(b.on));
    const split = lines => lines.map(a => { const i = instById(a.installment_id); return `${T().instN(i ? i.seq : '?')} · ${money(a.amount_cents != null ? a.amount_cents : a.cents)}`; }).join('  ·  ');
    const twoStep = (id, act, yes) => A.revConfirm === id
      ? `<button type="button" class="adm-btn small danger" data-a="${yes}" data-p="${id}">${esc(t.reverseConfirm)}</button>
         <button type="button" class="adm-link" data-a="pay-rev-no">${esc(T().cancel)}</button>`
      : `<button type="button" class="adm-link pay-rev" data-a="${act}" data-p="${id}">${esc(t.reverse)}</button>`;
    const li = it => {
      if (it.p) {
        const p = it.p, al = split(D().allocations.filter(a => a.payment_id === p.id));
        return `
        <li class="pay-h">
          <span class="num" dir="ltr">${esc(X.dmy(p.received_on))}</span><b class="num" dir="ltr">${money(p.amount_cents)}</b>
          <span class="pay-ref" dir="ltr">${esc(p.bank_ref || '')}</span><small class="pay-al">${esc(al)}</small>
          <span class="pay-acts"><button type="button" class="adm-link" data-a="pay-view" data-p="${p.id}">${esc(t.viewReceipt)}</button>
            ${own('payments', p.id) ? twoStep(p.id, 'pay-rev', 'pay-rev-yes') : ''}</span>
        </li>`;
      }
      const v = it.v, back = v.reversed_by && L().vouchers.find(x => x.id === v.reversed_by);
      return `
        <li class="pay-h is-credit${back ? ' is-back' : ''}">
          <span class="num" dir="ltr">${esc(X.dmy(v.on))}</span><b class="num" dir="ltr">${money(v.amount_cents)}</b>
          <span class="pay-ref">${esc(t.viaCredit(no4(v.no)))}</span><small class="pay-al">${esc(back ? t.reversedBy(no4(back.no)) : split(v.lines))}</small>
          <span class="pay-acts"><button type="button" class="adm-link" data-a="cr-voucher" data-v="${v.id}">${esc(t.viewVoucher)}</button>
            ${back ? '' : twoStep(v.id, 'pay-rev', 'cr-use-yes')}</span>
        </li>`;
    };
    return `
      <div class="pay-hist" dir="${B.dir}">
        <h4>${esc(t.payments)} <b>${items.length || ''}</b></h4>
        ${items.length ? `<ul>${items.map(li).join('')}</ul>` : `<p class="adm-empty small">${esc(t.noPayments)}</p>`}
      </div>`;
  }
  function payViewDoc(pid) {
    A.pane = null;
    const p = D().payments.find(x => x.id === pid), c = contract(p.contract_id);
    const doc = D().documents.find(x => x.id === p.proof_document_id), a = anchorOf(p.proof_anchor_id);
    V.open({ title: c.ref, sub: `${X.T.transfer} · ${X.dmy(p.received_on)} · ${money(p.amount_cents)}`, closeLabel: X.T.close,
      loadingLabel: X.T.loading, note: null, tabs: [{ label: X.T.transfer, path: doc.file_path, anchor: a ? { page: a.page, box: a.box } : null }] });
  }

  // ── «رصيد تحت الحساب» — the firm's credit and its ledger (Ibrahim, 2026-11-14) ────────────────────────────────
  //   Inside an open firm: the balance (calculated, never typed) · «إضافة رصيد» · «كشف الحساب» = the credit's whole
  //   journey: deposits in (bank receipt + the firm's instruction), uses out (settlement vouchers), reversals back in
  //   (reversal vouchers); every line opens its proof. The first visible financial log of صقر.
  const no4 = n => String(n).padStart(4, '0');
  // ── the side panel (Ibrahim, 2026-11-14): the firm's credit and a contract's payments record open BESIDE the list
  //    (the panel the documents use), so the ladder firm → contracts → instalments never moves ──
  function crPaneHtml(firm) {
    const t = T().cr, bal = S.creditOf(firm.id);
    return `
      <section class="adm-pane" dir="${X.T.dir}">
        <div class="cr-top">
          <span class="cr-lbl">${esc(t.title)}</span><b class="cr-bal num" dir="ltr">${money(bal)}</b>
          <span class="cr-acts"><button type="button" class="adm-btn small" data-a="cr-add" data-f="${firm.id}">${ico.plus}<span>${esc(t.add)}</span></button></span>
        </div>
        ${A.paneFlash ? `<p class="pay-flash">${ico.check}<span>${esc(A.paneFlash)}</span></p>` : ''}
        <h4 class="pane-h">${esc(t.ledger)}</h4>
        ${ledgerHtml(firm)}
      </section>`;
  }
  function paysPaneHtml(c) {
    return `
      <section class="adm-pane" dir="${X.T.dir}">
        ${A.paneFlash ? `<p class="pay-flash">${ico.check}<span>${esc(A.paneFlash)}</span></p>` : ''}
        ${payHistory(c)}
      </section>`;
  }
  function paintPane() {
    const P = A.pane; if (!P) return;
    const base = { closeLabel: X.T.close, loadingLabel: X.T.loading, note: null };
    if (P.kind === 'cr') {
      const firm = D().firms.find(f => f.id === P.fid);
      V.open({ ...base, title: firm.name, sub: X.T.cr.title, tabs: [{ label: X.T.cr.title, html: crPaneHtml(firm) }] }, () => { A.pane = null; });
    } else {
      const c = contract(P.cid);
      V.open({ ...base, title: c.ref, sub: `${firmOf(c).name} · ${T().pay.payments}`, tabs: [{ label: T().pay.payments, html: paysPaneHtml(c) }] }, () => { A.pane = null; });
    }
  }
  const refresh = () => { paintResults(); paintPane(); };

  function ledgerHtml(firm) {
    const t = T().cr, d = D();
    const L = C.creditLedger(S.deposits(firm.id), S.vouchersOf(firm.id));
    if (!L.lines.length) return `<p class="adm-empty small">${esc(t.empty)}</p>`;
    const what = v => {
      const c = contract(v.contract_id), seqs = [...new Set((v.lines || []).map(l => (instById(l.installment_id) || {}).seq))].filter(Boolean);
      return `${c ? c.ref : ''} · ${T().colInst} ${seqs.join('، ')}`;
    };
    const row = l => {
      let label = '', open = '', extra = '';
      if (l.kind === 'deposit') {
        label = t.mDeposit(l.deposit.bank_ref || '') + (l.deposit.voided_at ? ` · ${t.voided}` : '');
        open = `data-a="cr-doc" data-p="${l.deposit.id}"`;
        const left = C.depositLeft(d, l.deposit), mine = own('payments', l.deposit.id);
        if (mine && !l.deposit.voided_at) {
          extra = left !== l.deposit.amount_cents ? `<small class="cr-note">${esc(left === 0 ? t.usedUp : `${t.left(money(left))} · ${t.inUse}`)}</small>`
            : A.revConfirm === l.deposit.id
              ? `<button type="button" class="adm-btn small danger" data-a="cr-dep-yes" data-p="${l.deposit.id}">${esc(t.reverseDep + '؟')}</button>
                 <button type="button" class="adm-link" data-a="pay-rev-no">${esc(T().cancel)}</button>`
              : `<button type="button" class="adm-link pay-rev" data-a="cr-dep-rev" data-p="${l.deposit.id}">${esc(t.reverseDep)}</button>`;
        }
      } else if (l.kind === 'deposit-reversed') {
        label = t.mDepositGone(l.deposit.bank_ref || ''); open = `data-a="cr-doc" data-p="${l.deposit.id}"`;
      } else if (l.kind === 'settlement') {
        label = t.mUse(no4(l.voucher.no), what(l.voucher)); open = `data-a="cr-voucher" data-v="${l.voucher.id}"`;
      } else {
        const of = S.vouchersOf(firm.id).find(v => v.id === l.voucher.reverses);
        label = t.mBack(no4(l.voucher.no), of ? no4(of.no) : '?'); open = `data-a="cr-voucher" data-v="${l.voucher.id}"`;
      }
      return `
        <tr class="cr-${l.kind}">
          <td class="date" dir="ltr">${esc(X.dmy(l.on))}</td>
          <td class="txt" dir="${X.T.dir}"><button type="button" class="adm-link cr-open" ${open}>${esc(label)}</button>${extra ? `<div class="cr-extra">${extra}</div>` : ''}</td>
          <td class="num in" dir="ltr">${l.in_cents ? money(l.in_cents) : ''}</td>
          <td class="num out" dir="ltr">${l.out_cents ? money(l.out_cents) : ''}</td>
          <td class="num bal" dir="ltr">${money(l.balance_cents)}</td>
        </tr>`;
    };
    return `
      <div class="cr-ledger" dir="ltr">
        <table>
          <colgroup><col class="c-date"><col class="c-what"><col class="c-n"><col class="c-n"><col class="c-n"></colgroup>
          <thead><tr>${t.cols.map((h, k) => `<th class="${k > 1 ? 'num' : 'txt'}"><span dir="${X.T.dir}">${esc(h)}</span></th>`).join('')}</tr></thead>
          <tbody>${L.lines.map(row).join('')}</tbody>
        </table>
      </div>`;
  }
  function crDoc(pid) {
    A.pane = null;                                      // a deposit's proof: the receipt, then the firm's instruction
    const p = S.deposits(D().payments.concat(L().payments).find(x => x.id === pid).firm_id).find(x => x.id === pid);
    const docOf = id => D().documents.find(x => x.id === id) || L().documents.find(x => x.id === id);
    const an = id => { const a = anchorOf(id) || L().anchors.find(x => x.id === id); return a ? { page: a.page, box: a.box } : null; };
    V.open({ title: T().cr.title, sub: `${X.T.cr.deposit} · ${p.bank_ref} · ${X.dmy(p.received_on)} · ${money(p.amount_cents)}`,
      closeLabel: X.T.close, loadingLabel: X.T.loading, note: null,
      tabs: [{ label: T().cr.receipt, path: docOf(p.proof_document_id).file_path, anchor: an(p.proof_anchor_id) },
             { label: T().cr.instruction, path: docOf(p.instruction_document_id).file_path, anchor: an(p.instruction_anchor_id) }] });
  }
  function crVoucher(vid) {
    A.pane = null;
    const v = L().vouchers.find(x => x.id === vid);
    V.open({ title: `${v.kind === 'reversal' ? X.T.cr.vReversal : X.T.cr.vSettlement} № ${no4(v.no)}`, sub: X.date(v.on),
      closeLabel: X.T.close, loadingLabel: X.T.loading, note: null, tabs: [{ label: X.T.cr.voucher, html: X.voucherHtml(v) }] });
  }

  // «إضافة رصيد»: amount · date received · bank ref + TWO documents, each boxed: the bank receipt (money) and the firm's
  // instruction (consent). Same layout as the payment workspace; the two files sit on two tabs.
  let crView = null;
  function crStart(fid) {
    const slot = () => ({ file: null, path: null, box: null });
    A.crF = { fid, amount: '', date: '', ref: '', docs: { receipt: slot(), instr: slot() }, tab: 'receipt', err: {}, busy: false };
    go('credit', null);
  }
  function crPage() {
    const t = T().cr, tp = T().pay, F = A.crF, firm = D().firms.find(f => f.id === F.fid), s = F.docs[F.tab];
    const ready = F.docs.receipt.box && F.docs.instr.box;
    const tabBtn = (k, label) => `<button type="button" class="ws-tab${F.tab === k ? ' on' : ''}" data-a="cr-tab" data-k="${k}">${F.docs[k].box ? ico.check : ico.file}<span>${esc(label)}</span></button>`;
    main.innerHTML = `
      <section class="ws pay" dir="ltr">
        <aside class="ws-side" dir="${X.T.dir}">
          <button type="button" class="adm-back" data-a="home">${ico.back}<span>${esc(T().backList)}</span></button>
          <header class="ws-head"><div class="ws-ref" dir="auto">${esc(firm.name)}</div><span class="adm-chip pay-chip">${esc(t.newTitle)}</span></header>
          <p class="adm-sub">${esc(t.newSub)}</p>
          <form id="cr-form" class="pay-form" novalidate>
            <label class="fld"><span class="fld-label">${esc(tp.amount)}</span>
              <input class="fld-in num${F.err.amount ? ' bad' : ''}" name="amount" inputmode="decimal" autocomplete="off" dir="ltr" value="${esc(F.amount)}" placeholder="50,000">
              ${F.err.amount ? `<small class="fld-msg bad">${esc(F.err.amount)}</small>` : ''}</label>
            <div class="fld-row">
              <label class="fld"><span class="fld-label">${esc(tp.received)}</span>${dateField('received', F.date, F.err.date)}</label>
              <label class="fld"><span class="fld-label">${esc(tp.bankRef)}</span>
                <input class="fld-in${F.err.ref ? ' bad' : ''}" name="bankref" autocomplete="off" dir="ltr" value="${esc(F.ref)}" placeholder="${esc(tp.bankRefHint)}">
                ${F.err.ref ? `<small class="fld-msg bad">${esc(F.err.ref)}</small>` : ''}</label>
            </div>
            <footer class="ws-foot">
              <p class="pay-need${F.err.docs ? ' bad' : ''}">${esc(F.err.docs || (ready ? '' : t.needBoth))}</p>
              <button type="submit" class="adm-btn primary wide"${F.busy || !ready ? ' disabled' : ''}>${ico.check}<span>${esc(F.busy ? T().saving : t.save)}</span></button>
            </footer>
          </form>
        </aside>
        <div class="ws-doc">
          <div class="ws-doc-bar" dir="${X.T.dir}">
            <nav class="ws-tabs">${tabBtn('receipt', t.receipt)}${tabBtn('instr', t.instruction)}</nav>
            <span class="ws-doc-meta cr-meta">${s.file ? `<span dir="ltr">${esc(s.file.name)}</span> · ` : ''}${esc(!s.file ? tp.dropHint : s.box ? tp.boxDone : (F.tab === 'receipt' ? t.drawReceipt : t.drawInstr))}</span>
            ${s.file ? `<label class="adm-link">${esc(T().fileChange)}<input type="file" accept="application/pdf,.pdf" data-a="cr-file" hidden></label>` : ''}
          </div>
          ${s.file ? '<div class="ws-scroll can-draw pay-scroll"></div>'
            : `<label class="adm-file pay-drop" data-drop="cr">${ico.file}<span>${esc(tp.drop)}</span><small>${esc(T().filePdf)}</small><input type="file" accept="application/pdf,.pdf" data-a="cr-file" hidden></label>`}
        </div>
      </section>`;
    if (s.file) crPaint(s, F.tab === 'receipt' ? t.boxReceipt : t.boxInstr);
  }
  // one file, one box (drag again to redraw it) — the same engine and gesture as the payment's receipt
  function crPaint(slot, tag) {
    const sc = main.querySelector('.pay-scroll'), my = { memo: null };
    crView = my;
    const mark = () => {
      if (!my.memo) return;
      my.memo.wrap.querySelectorAll('.ws-mark').forEach(e => e.remove());
      if (!slot.box) return;
      const p = my.memo.pages[slot.box.page - 1]; if (!p) return;
      const [x, y, w, h] = slot.box.box, W = p.vp.width, H = p.vp.height, m = document.createElement('div');
      m.className = 'ws-mark is-pay';
      Object.assign(m.style, { left: x * W + 'px', top: y * H + 'px', width: w * W + 'px', height: h * H + 'px' });
      m.innerHTML = `<span class="ws-tag words" dir="auto">${esc(tag)}</span>`;
      p.box.appendChild(m);
    };
    V.paint({ path: slot.path, anchor: null, onLaidOut: memo => { if (crView !== my) return; my.memo = memo; mark(); } }, sc, () => crView === my, X.T.loading);
    let d = null;
    sc.addEventListener('pointerdown', e => {
      if (e.button !== 0 || crView !== my || !my.memo) return;
      const pageEl = e.target.closest('.page'); if (!pageEl) return;
      const r = pageEl.getBoundingClientRect();
      d = { pageEl, r, x0: e.clientX - r.left, y0: e.clientY - r.top, el: document.createElement('div'), id: e.pointerId };
      d.el.className = 'ws-sel'; pageEl.appendChild(d.el);
      try { sc.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
      e.preventDefault();
    });
    sc.addEventListener('pointermove', e => {
      if (!d || e.pointerId !== d.id) return;
      const x1 = Math.max(0, Math.min(d.r.width, e.clientX - d.r.left)), y1 = Math.max(0, Math.min(d.r.height, e.clientY - d.r.top));
      d.box = [Math.min(d.x0, x1), Math.min(d.y0, y1), Math.abs(x1 - d.x0), Math.abs(y1 - d.y0)];
      Object.assign(d.el.style, { left: d.box[0] + 'px', top: d.box[1] + 'px', width: d.box[2] + 'px', height: d.box[3] + 'px' });
    });
    const end = e => {
      if (!d || e.pointerId !== d.id) return;
      const dd = d; d = null; dd.el.remove();
      if (!dd.box || dd.box[2] < 8 || dd.box[3] < 6) return;
      const [x, y, w, h] = dd.box;
      slot.box = { page: my.memo.pages.findIndex(p => p.box === dd.pageEl) + 1, box: [x / dd.r.width, y / dd.r.height, w / dd.r.width, h / dd.r.height] };
      A.crF.err.docs = ''; mark(); crReady();
    };
    sc.addEventListener('pointerup', end);
    sc.addEventListener('pointercancel', e => { if (d && e.pointerId === d.id) { d.el.remove(); d = null; } });
  }
  function crReady() {
    const t = T().cr, tp = T().pay, F = A.crF, s = F.docs[F.tab], ready = F.docs.receipt.box && F.docs.instr.box;
    const btn = main.querySelector('#cr-form button[type=submit]'); if (btn) btn.disabled = F.busy || !ready;
    const need = main.querySelector('#cr-form .pay-need'); if (need) { need.textContent = ready ? '' : t.needBoth; need.classList.remove('bad'); }
    const tb = main.querySelector(`.ws-tab[data-k="${F.tab}"]`); if (tb && s.box) tb.innerHTML = `${ico.check}<span>${esc(F.tab === 'receipt' ? t.receipt : t.instruction)}</span>`;
    const meta = main.querySelector('.cr-meta'); if (meta && s.file) meta.innerHTML = `<span dir="ltr">${esc(s.file.name)}</span> · ${esc(s.box ? tp.boxDone : (F.tab === 'receipt' ? t.drawReceipt : t.drawInstr))}`;
  }
  async function takeCrFile(file) {
    const F = A.crF, s = F.docs[F.tab];
    try { const buf = await file.arrayBuffer(), pages = await V.pageCount(buf); Object.assign(s, { file: { name: file.name, buf, pages }, path: S.stage(buf), box: null }); }
    catch (e) { F.err.docs = T().fileBad; }
    crPage();
  }
  function crInput(el) {
    const F = A.crF; if (!F) return;
    if (el.classList.contains('bad') && el.name !== 'received') { el.classList.remove('bad'); const m = el.parentNode.querySelector('.fld-msg.bad'); if (m) m.remove(); }
    if (el.name === 'amount') F.amount = el.value; else if (el.name === 'received') F.date = el.value; else if (el.name === 'bankref') F.ref = el.value;
  }
  async function saveCredit() {
    const t = T().cr, tp = T().pay, F = A.crF, e = (F.err = {});
    const amt = cents(F.amount), iso = isoDate(F.date);
    if (!amt) e.amount = T().badAmount;
    if (!iso) e.date = F.date.trim() ? T().badDateFmt : tp.dateNeeded; else if (iso > today()) e.date = tp.dateFuture;
    if (!F.ref.trim()) e.ref = T().required; else if (S.bankRefTaken(F.fid, F.ref)) e.ref = tp.refTaken;
    if (!F.docs.receipt.box || !F.docs.instr.box) e.docs = t.needBoth;
    if (Object.keys(e).some(k => e[k])) return crPage();
    F.busy = true; crReady();
    const pack = s => ({ fileName: s.file.name, buf: s.file.buf, pages: s.file.pages, page: s.box.page, box: s.box.box });
    try {
      await S.addCredit({ firmId: F.fid, receivedOn: iso, amountCents: amt, bankRef: F.ref, receipt: pack(F.docs.receipt), instruction: pack(F.docs.instr) });
      Object.assign(Q, { firmOpen: F.fid }); keepQ();
      A.crF = null; crView = null;
      go('home');
      A.pane = { kind: 'cr', fid: F.fid }; A.paneFlash = t.saved(money(amt)); paintPane();
    } catch (err) { F.busy = false; e.docs = String(err.message || err); crPage(); }
  }

  // ── new contract: firm · number · signed on · file ─────────────────────────────────────────────
  function newForm() {
    const t = T(), f = A.form, e = A.err;
    const known = f.firm.trim() && S.firmByName(f.firm);
    const firms = S.data().firms.map(x => `<option value="${esc(x.name)}"></option>`).join('');
    const fileBox = A.file
      ? `<div class="adm-file has"><span class="adm-file-ico">${ico.file}</span><span class="adm-file-name" dir="ltr">${esc(A.file.name)}</span>
           <span class="adm-file-meta">${esc(t.pages(A.file.pages))}</span>
           <label class="adm-link">${esc(t.fileChange)}<input type="file" accept="application/pdf,.pdf" data-a="file" hidden></label></div>`
      : `<label class="adm-file${e.file ? ' bad' : ''}" data-drop="1">${ico.file}<span>${esc(t.fileDrop)}</span><small>${esc(t.filePdf)}</small>
           <input type="file" accept="application/pdf,.pdf" data-a="file" hidden></label>`;
    main.innerHTML = `
      <section class="adm" dir="${X.T.dir}">
        <button type="button" class="adm-back" data-a="home">${ico.back}<span>${esc(t.backList)}</span></button>
        <form class="adm-card" id="adm-new" novalidate>
          <h1>${esc(t.newTitle)}</h1>
          <p class="adm-sub">${esc(t.newSub)}</p>
          <label class="fld">
            <span class="fld-label">${esc(t.firm)}</span>
            <input class="fld-in${e.firm ? ' bad' : ''}" name="firm" list="adm-firms" autocomplete="off" dir="auto" value="${esc(f.firm)}" placeholder="${esc(t.firmHint)}">
            <datalist id="adm-firms">${firms}</datalist>
            <small class="fld-msg${e.firm ? ' bad' : ''}" data-msg="firm">${esc(e.firm || (f.firm.trim() && !known ? t.firmNew : ''))}</small>
          </label>
          <div class="fld-row">
            <label class="fld">
              <span class="fld-label">${esc(t.ref)}</span>
              <input class="fld-in${e.ref ? ' bad' : ''}" name="ref" autocomplete="off" dir="ltr" value="${esc(f.ref)}" placeholder="CTR-2026-031">
              <small class="fld-msg bad">${esc(e.ref || '')}</small>
            </label>
            <label class="fld">
              <span class="fld-label">${esc(t.signed)} <i>${esc(t.optional)}</i></span>
              ${dateField('signed', f.signed, e.signed)}
            </label>
          </div>
          <div class="fld">
            <span class="fld-label">${esc(t.file)}</span>
            ${fileBox}
            <small class="fld-msg bad">${esc(e.file || '')}</small>
          </div>
          <div class="adm-actions">
            <button type="submit" class="adm-btn primary"${A.busy ? ' disabled' : ''}>${esc(A.busy ? t.saving : t.open)}</button>
            <button type="button" class="adm-btn" data-a="home">${esc(t.back)}</button>
          </div>
        </form>
      </section>`;
  }

  async function takeFile(file) {
    const t = T();
    A.err.file = '';
    try {
      const buf = await file.arrayBuffer();
      const pages = await V.pageCount(buf);
      A.file = { name: file.name, buf, pages };
    } catch (e) { A.file = null; A.err.file = t.fileBad; }
    keepForm(); newForm();
  }
  function keepForm() {
    const f = document.getElementById('adm-new');
    if (f) A.form = { firm: f.firm.value, ref: f.ref.value, signed: f.signed.value };
  }
  async function submitNew() {
    const t = T();
    keepForm();
    const f = A.form, e = (A.err = {});
    if (!f.firm.trim()) e.firm = t.required;
    if (!f.ref.trim()) e.ref = t.required; else if (S.refTaken(f.ref)) e.ref = t.refTaken;
    if (!A.file) e.file = t.required;
    if (f.signed.trim() && !isoDate(f.signed)) e.signed = t.badDateFmt;
    else if (isoDate(f.signed) > today()) e.signed = t.signedFuture;
    if (Object.keys(e).length) return newForm();
    A.busy = true; newForm();
    try {
      const c = await S.newContract({ firmName: f.firm, ref: f.ref, signedOn: isoDate(f.signed), fileName: A.file.name, buf: A.file.buf, pages: A.file.pages });
      A.busy = false; A.file = null;
      go('work', c.id);
    } catch (err) { A.busy = false; A.err.file = String(err.message || err); newForm(); }
  }

  // ── the workspace: the schedule (left) beside the contract (right), like the Boss's panel ───────
  function workspace() {
    const t = T(), c = contract(A.cid), docs = docsOf(c);
    const doc = docs.find(d => d.id === A.docId) || docs[0];
    A.docId = doc.id; ses.set('doc', doc.id);
    const isRef = doc.kind === 'outside', canDraw = isRef || c.state === 'draft';
    main.innerHTML = `
      <section class="ws" dir="ltr">
        <aside class="ws-side" dir="${X.T.dir}"></aside>
        <div class="ws-doc">
          <div class="ws-doc-bar" dir="${X.T.dir}">
            <nav class="ws-tabs">${tabsHtml(c, doc)}</nav>
            <span class="ws-doc-meta"><span dir="ltr">${esc(doc.file_name)}</span> · ${esc(t.pages(doc.pages))}</span>
            ${canDraw ? `<button type="button" class="adm-btn small ws-draw${A.drawMode ? ' on' : ''}" data-a="draw">${ico.box}<span>${esc(t.draw)}</span></button>` : ''}
          </div>
          <div class="ws-scroll${canDraw ? ' can-draw' : ''}${A.drawMode ? ' draw-mode' : ''}"></div>
          ${A.refAsk ? refAsk() : ''}
        </div>
      </section>`;
    const scroll = main.querySelector('.ws-scroll');
    const my = ws = { c, doc, isRef, canDraw, scroll, memo: null, side: main.querySelector('.ws-side') };
    side();
    paintDoc(my, 0);
    wireDraw(my);
  }
  // the files, laid out like an editor (Ibrahim, 2026-11-12): the contract is the main module, on its own;
  // the references sit beside it in one framed group «المراجع», each named by where the Boss meets it,
  // and «+ إضافة مرجع» closes the group (a new reference joins it)
  function tabsHtml(c, doc) {
    const t = T(), docs = docsOf(c), refs = docs.slice(1);
    const tab = (d, cls, label, icon) => `<button type="button" class="ws-tab ${cls}${d.id === doc.id ? ' on' : ''}" data-a="tab" data-d="${d.id}" title="${esc(d.file_name)}">${icon}<span>${esc(label)}</span></button>`;
    const add = `<label class="ws-tab add" data-drop="ref" title="${esc(t.addRef)}">${ico.plus}<span>${esc(t.addRef)}</span><input type="file" accept="application/pdf,.pdf" data-a="ref-file" hidden></label>`;
    return tab(docs[0], 'main', t.contractTab, ico.file)
      + (refs.length ? `<div class="ws-tabgroup" role="group" aria-label="${esc(t.refs)}">${refs.map(d => tab(d, 'ref', whereLabel(d), ico.clip)).join('')}${add}</div>` : add);
  }
  // the contract fits its column; after a window resize it is redrawn at the new width, at the same place
  function paintDoc(my, ratio) {
    V.paint({ path: my.doc.file_path, anchor: null, onLaidOut: memo => {
      if (ws !== my) return;
      my.memo = memo; marks(); if (A.pop) pop();
      if (ratio) my.scroll.scrollTop = ratio * my.scroll.scrollHeight;
      if (A.focusAfter) {                                   // a locate that had to switch files first
        const a = anchorOf(A.focusAfter); A.focusAfter = null;
        if (a) V.focus({ page: a.page, box: a.box }, memo, my.scroll, true);
      }
    } }, my.scroll, () => ws === my, X.T.loading);
  }
  let resizeT = 0;
  root.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      if (!ws || !ws.memo || !document.body.contains(ws.scroll)) return;
      const want = Math.max(200, Math.min(ws.scroll.clientWidth - 32 - 28, 760));    // the viewer's own fit rule
      if (Math.abs(want - ws.memo.width) < 1) return;
      const ratio = ws.scroll.scrollTop / Math.max(1, ws.scroll.scrollHeight);
      ws.memo = null; paintDoc(ws, ratio);
    }, 180);
  });

  function side() {
    if (!ws) return;
    const t = T(), c = contract(A.cid), insts = instsOf(c.id), chk = C.scheduleCheck(insts, c.total_cents);
    const draft = c.state === 'draft';
    const n = insts.length;
    const totalA = c.total_anchor_id ? anchorOf(c.total_anchor_id) : null;
    const pct = chk.total_cents ? Math.min(100, Math.round(chk.sum_cents / chk.total_cents * 100)) : 0;
    const meterState = chk.total_cents ? (chk.state === 'match' ? 'ok' : chk.state === 'over' ? 'over' : 'short') : 'none';
    const meterLine = !chk.total_cents ? '' : chk.state === 'match' ? `${ico.check}${esc(t.matched)}`
      : chk.state === 'empty' ? '' : `${esc(chk.gap_cents > 0 ? t.short : t.over)} <b class="num">${money(Math.abs(chk.gap_cents))}</b>`;
    const row = i => {
      const note = noteOf(i.id), p = parts(i);
      const miss = ['amount', 'date'].filter(k => !p[k + '_anchor_id']).map(k => `<em class="ws-miss">${esc(t.noBox[k])}</em>`).join('');
      return `
        <li class="ws-inst${A.pop && A.pop.instId === i.id ? ' on' : ''}" data-i="${i.id}">
          <button type="button" class="ws-inst-main" data-a="locate" data-i="${i.id}" title="${esc(t.locate)}">
            <span class="ws-seq">${i.seq}</span>
            <span class="ws-date num" dir="ltr">${esc(X.dmy(i.due_on))}</span>
            <span class="ws-amt num" dir="ltr">${money(i.amount_cents)}</span>
            ${note || miss ? `<span class="ws-note" dir="auto"${note ? ` title="${esc(note.text)}"` : ''}>${miss}${note ? esc(note.text) : ''}</span>` : ''}
          </button>
          ${draft ? `<button type="button" class="icon-btn ws-edit" data-a="edit" data-i="${i.id}" aria-label="${esc(t.edit)}" title="${esc(t.edit)}">${ico.edit}</button>` : ''}
        </li>`;
    };
    let gate = '';
    if (draft && A.ask === 'empty') gate = `<div class="ws-gate bad">${esc(t.gateEmpty)}</div>`;
    if (draft && A.ask === 'gap') gate = `<div class="ws-gate bad"><p>${esc(t.gateGap(money(chk.sum_cents), money(chk.total_cents), money(Math.abs(chk.gap_cents)), chk.gap_cents > 0))}</p><p class="ws-gate-fix">${esc(t.gateFix)}</p></div>`;
    if (draft && A.ask === 'no-total') gate = `<div class="ws-gate"><p>${esc(t.noTotalQ)}</p>
        <div class="adm-actions"><button type="button" class="adm-btn primary" data-a="finish-sum">${esc(t.noTotalYes(money(chk.sum_cents)))}</button>
        <button type="button" class="adm-btn" data-a="ask-close">${esc(t.noTotalBack)}</button></div></div>`;
    const tabsEl = main.querySelector('.ws-tabs');
    if (tabsEl) tabsEl.innerHTML = tabsHtml(c, ws.doc);
    ws.side.innerHTML = `
      <button type="button" class="adm-back" data-a="home">${ico.back}<span>${esc(t.backList)}</span></button>
      <header class="ws-head">
        <div class="ws-ref" dir="ltr">${esc(c.ref)}</div>
        <div class="ws-firm" dir="auto">${esc(firmOf(c).name)}</div>
        <span class="adm-chip ${c.state}">${esc(draft ? t.draftChip : t.activeChip)}</span>
      </header>
      ${A.done ? `<div class="ws-done">${ico.check}<div><b>${esc(t.done)}</b><p>${esc(t.doneSub)}</p></div></div>` : ''}
      <div class="ws-total${totalA ? ' set' : ''}">
        <span class="ws-total-label">${esc(t.total)}</span>
        ${c.total_cents
          ? `<button type="button" class="ws-total-val num" dir="ltr" data-a="locate-total"${totalA ? '' : ' disabled'} title="${esc(c.total_source === 'sum' ? t.totalFromSum : t.locate)}">${money(c.total_cents)}</button>`
          : `<span class="ws-total-none">${esc(t.totalUnset)}</span>`}
        ${c.total_source === 'sum' ? `<small>${esc(t.totalFromSum)}</small>` : ''}
      </div>
      ${draft ? `<div class="ws-meter m-${meterState}">
        <div class="ws-meter-nums"><span>${esc(t.sum)}</span><b class="num"><span dir="ltr">${money(chk.sum_cents)}</span>${chk.total_cents ? ` <i>${esc(t.of)}</i> <span dir="ltr">${money(chk.total_cents)}</span>` : ''}</b></div>
        ${chk.total_cents ? `<div class="ws-bar"><i style="width:${pct}%"></i></div><div class="ws-meter-line">${meterLine}</div>` : ''}
      </div>` : ''}
      <p class="ws-hint">${ico.box}<span>${esc(ws.isRef ? (ws.doc.ref_target === 'note' ? t.refHintNote : t.refHint)
        : draft ? (!c.total_cents && !n ? t.startHint : t.instHint) : t.readOnlyRefs)}</span></p>
      <h3 class="ws-h3">${esc(t.schedule)} <b>${n || ''}</b></h3>
      ${n ? `<ol class="ws-list">${insts.map(row).join('')}</ol>` : `<p class="adm-empty small">${esc(t.noInst)}</p>`}
      ${refsBlock(c)}
      ${draft ? `<footer class="ws-foot">${gate}<button type="button" class="adm-btn primary wide" data-a="finish">${ico.check}<span>${esc(t.finish)}</span></button></footer>` : `
        <footer class="ws-foot"><button type="button" class="adm-btn primary wide" data-a="new">${ico.plus}<span>${esc(t.another)}</span></button></footer>`}`;
  }

  // the saved boxes, drawn over the pages: on the contract the total and every installment (one box for both parts,
  // or «2 · المبلغ» / «2 · التاريخ» when they sit apart); on a reference its highlights and note sources
  function marks() {
    if (!ws || !ws.memo) return;
    const c = contract(A.cid), t = T(), docId = ws.doc.id, draft = c.state === 'draft';
    ws.memo.wrap.querySelectorAll('.ws-mark').forEach(e => e.remove());
    const put = (aid, label, cls, data, editable) => {
      const a = aid && anchorOf(aid);
      if (!a || !a.box || a.document_id !== docId) return;
      const p = ws.memo.pages[a.page - 1]; if (!p) return;
      const [x, y, w, h] = a.box, W = p.vp.width, H = p.vp.height;
      const m = document.createElement(editable ? 'button' : 'div');
      if (editable) { m.type = 'button'; Object.assign(m.dataset, data); }      // an editable mark opens its form
      const old = (A.redraw && A.redraw.anchorId === aid) || (A.pop && A.pop.moved && A.pop.anchorId === aid);
      m.className = 'ws-mark ' + cls + (old ? ' is-old' : '');                 // the box being replaced: faded
      Object.assign(m.style, { left: x * W + 'px', top: y * H + 'px', width: w * W + 'px', height: h * H + 'px' });
      m.innerHTML = `<span class="ws-tag${/[^\d\s·]/.test(label) ? ' words' : ''}" dir="auto">${esc(label)}</span>`;
      p.box.appendChild(m);
    };
    if (!ws.isRef) {
      if (c.total_anchor_id) put(c.total_anchor_id, t.kindTotal, 'is-total', { a: 'edit-total' }, draft);
      for (const i of instsOf(c.id)) {
        const p = parts(i);
        if (p.amount_anchor_id && p.amount_anchor_id === p.date_anchor_id) put(p.amount_anchor_id, String(i.seq), '', { a: 'edit', i: i.id, part: 'both' }, draft);
        else {
          put(p.amount_anchor_id, `${i.seq} · ${t.partTag.amount}`, '', { a: 'edit', i: i.id, part: 'amount' }, draft);
          put(p.date_anchor_id, `${i.seq} · ${t.partTag.date}`, '', { a: 'edit', i: i.id, part: 'date' }, draft);
        }
      }
    } else {
      for (const l of linksOf(c.id).filter(l => l.document_id === docId)) put(l.anchor_id, linkTag(l), 'is-ref', { a: 'edit-link', l: l.id }, true);
      for (const n of notesOn(c.id, docId)) put(n.anchor_id, t.note, 'is-ref is-note', { a: 'edit-note', n: n.id }, own('notes', n.id));
    }
  }
  const linkTag = l => {
    const t = T(), i = l.installment_id && instById(l.installment_id);
    return l.target === 'contract' ? t.where.contract : `${t.partTag[l.target]}${i ? ' ' + i.seq : ''}`;
  };

  // the references and the contract-wide notes, under the schedule
  function refsBlock(c) {
    const t = T(), refs = docsOf(c).slice(1);
    const cnotes = D().notes.filter(n => n.contract_id === c.id && !n.installment_id);
    const count = d => linksOf(c.id).filter(l => l.document_id === d.id).length + notesOn(c.id, d.id).length;
    return (refs.length ? `
      <h3 class="ws-h3">${esc(t.refs)} <b>${refs.length}</b></h3>
      <ul class="ws-refs">${refs.map(d => `
        <li><button type="button" class="ws-refitem${ws.doc.id === d.id ? ' on' : ''}" data-a="tab" data-d="${d.id}">
          ${ico.clip}<span class="ws-ref-where">${esc(whereLabel(d))}</span>
          <span class="ws-ref-file" dir="ltr">${esc(d.file_name)}</span><small>${esc(t.boxes(count(d)))}</small></button></li>`).join('')}
      </ul>` : '') + (cnotes.length ? `
      <h3 class="ws-h3">${esc(t.contractNotes)} <b>${cnotes.length}</b></h3>
      <ul class="ws-refs">${cnotes.map(n => `
        <li><button type="button" class="ws-refitem" data-a="locate-a" data-an="${n.anchor_id || ''}">${ico.file}<span class="ws-ref-where" dir="auto">${esc(n.text)}</span></button></li>`).join('')}
      </ul>` : '');
  }

  // «أين يظهر هذا المرجع؟» — asked once, right after a reference file is dropped
  function refAsk() {
    const t = T(), R = A.refAsk, c = contract(A.cid), insts = instsOf(c.id);
    if (!R.file) return `<div class="ws-refask" dir="${X.T.dir}"><div class="ws-refask-card"><p class="fld-msg bad">${esc(R.err)}</p>
      <div class="adm-actions"><button type="button" class="adm-btn" data-a="ref-cancel">${esc(t.back)}</button></div></div></div>`;
    const opts = ['contract', 'amount', 'date', 'status', 'note'].map(w => {
      const noInst = (w === 'amount' || w === 'date') && !insts.length, off = w === 'status' || noInst;
      return `<button type="button" class="ws-where-opt${R.target === w ? ' on' : ''}" data-a="where" data-w="${w}" role="radio" aria-checked="${R.target === w}"${off ? ' disabled' : ''}>
        <b>${esc(t.where[w])}</b><small>${esc(noInst ? t.needInsts : t.whereHint[w])}</small></button>`;
    }).join('');
    const needInst = R.target === 'amount' || R.target === 'date' || R.target === 'note';
    const sel = needInst ? `<label class="fld"><span class="fld-label">${esc(t.whichInst)}</span>
      <select class="fld-in" name="inst">
        ${R.target === 'note' ? `<option value=""${!R.inst ? ' selected' : ''}>${esc(t.wholeContract)}</option>` : ''}
        ${insts.map(i => `<option value="${i.id}"${R.inst === i.id ? ' selected' : ''}>${esc(t.instN(i.seq))} · ${esc(X.dmy(i.due_on))} · ${money(i.amount_cents)}</option>`).join('')}
      </select></label>` : '';
    return `<div class="ws-refask" dir="${X.T.dir}"><form class="ws-refask-card" id="ws-ref" novalidate>
      <h3>${esc(t.whereQ)}</h3>
      <p class="adm-sub">${esc(t.whereSub)}</p>
      <div class="ws-refask-file">${ico.clip}<span dir="ltr">${esc(R.file.name)}</span><small>${esc(t.pages(R.file.pages))}</small></div>
      <div class="ws-where" role="radiogroup">${opts}</div>
      ${sel}
      ${R.err ? `<small class="fld-msg bad">${esc(R.err)}</small>` : ''}
      <div class="adm-actions">
        <button type="submit" class="adm-btn primary"${R.busy ? ' disabled' : ''}>${esc(R.busy ? t.saving : t.go)}</button>
        <button type="button" class="adm-btn" data-a="ref-cancel">${esc(t.cancel)}</button>
      </div></form></div>`;
  }
  // the overlay stays put while the Admin picks: only the card's content changes (no replayed fade, no flash)
  function refAskPaint() {
    const old = main.querySelector('.ws-refask');
    if (!A.refAsk) { if (old) old.remove(); return; }
    if (!old) return main.querySelector('.ws-doc').insertAdjacentHTML('beforeend', refAsk());
    const tmp = document.createElement('div'); tmp.innerHTML = refAsk();
    const card = old.firstElementChild, next = tmp.firstElementChild.firstElementChild, top = card ? card.scrollTop : 0;
    if (card && card.tagName === next.tagName) { card.innerHTML = next.innerHTML; card.scrollTop = top; }
    else old.replaceChildren(next);
  }
  async function takeRef(file) {
    A.pop = null; pop();
    try {
      const buf = await file.arrayBuffer(), pages = await V.pageCount(buf);
      A.refAsk = { file: { name: file.name, buf, pages }, target: null, inst: null, err: '', busy: false };
    } catch (e) { A.refAsk = { file: null, err: T().fileBad }; }
    refAskPaint();
  }
  async function submitRef() {
    const t = T(), R = A.refAsk, c = contract(A.cid);
    const sel = main.querySelector('#ws-ref select[name=inst]');
    if (sel) R.inst = sel.value || null;
    if (!R.target) { R.err = t.pickWhere; return refAskPaint(); }
    if ((R.target === 'amount' || R.target === 'date') && !R.inst) { R.err = t.whichInst; return refAskPaint(); }
    R.busy = true; R.err = ''; refAskPaint();
    try {
      const d = await S.addReference(c.id, { fileName: R.file.name, buf: R.file.buf, pages: R.file.pages,
        target: R.target, installment_id: R.target === 'contract' ? null : R.inst });
      A.refAsk = null; A.docId = d.id; A.pop = null;
      workspace();
    } catch (err) { R.busy = false; R.err = String(err.message || err); refAskPaint(); }
  }

  // ── drawing a box around a clause (mouse/pen always; touch only in «تحديد بند» mode, so scrolling still works) ──
  function wireDraw(my) {
    let d = null;
    my.scroll.addEventListener('pointerdown', e => {
      if (e.button !== 0 || ws !== my || !my.memo || !my.canDraw || A.refAsk) return;
      if (e.target.closest('.ws-pop') || (!A.redraw && e.target.closest('.ws-mark'))) return;
      if (e.pointerType === 'touch' && !A.drawMode && !A.redraw) return;
      const pageEl = e.target.closest('.page'); if (!pageEl) return;
      const r = pageEl.getBoundingClientRect();
      d = { pageEl, r, x0: e.clientX - r.left, y0: e.clientY - r.top, el: document.createElement('div'), id: e.pointerId };
      d.el.className = 'ws-sel';
      pageEl.appendChild(d.el);
      try { my.scroll.setPointerCapture(e.pointerId); } catch (err) { /* the drag still works inside the page */ }
      e.preventDefault();
    });
    my.scroll.addEventListener('pointermove', e => {
      if (!d || e.pointerId !== d.id) return;
      const x1 = Math.max(0, Math.min(d.r.width, e.clientX - d.r.left)), y1 = Math.max(0, Math.min(d.r.height, e.clientY - d.r.top));
      d.box = [Math.min(d.x0, x1), Math.min(d.y0, y1), Math.abs(x1 - d.x0), Math.abs(y1 - d.y0)];
      Object.assign(d.el.style, { left: d.box[0] + 'px', top: d.box[1] + 'px', width: d.box[2] + 'px', height: d.box[3] + 'px' });
    });
    const end = e => {
      if (!d || e.pointerId !== d.id) return;
      const dd = d; d = null;
      dd.el.remove();
      if (!dd.box || dd.box[2] < 8 || dd.box[3] < 6) return;                 // a click, not a box
      const page = ws.memo.pages.findIndex(p => p.box === dd.pageEl) + 1;
      const [x, y, w, h] = dd.box;
      const c = contract(A.cid), box = [x / dd.r.width, y / dd.r.height, w / dd.r.width, h / dd.r.height];
      if (A.redraw) {                                   // the new place for a saved box: its form reopens there, values kept
        A.pop = { ...A.redraw, page, box, moved: true, err: {} }; A.redraw = null;
        redrawBanner(); marks(); pop(); side(); return;
      }
      A.pop = my.isRef ? { page, box, kind: 'ref', err: {} }
        : { page, box, instId: null, kind: !c.total_cents && !instsOf(c.id).length ? 'total' : 'inst',
            inc: { amount: true, date: true }, target: 'new', err: {} };
      A.ask = null;
      pop(); side();
    };
    my.scroll.addEventListener('pointerup', end);
    my.scroll.addEventListener('pointercancel', e => { if (d && e.pointerId === d.id) { d.el.remove(); d = null; } });
  }

  // the clause form, right beside the box it belongs to
  function pop() {
    if (!ws || !ws.memo) return;
    ws.memo.wrap.querySelectorAll('.ws-pop, .ws-sel.keep').forEach(e => e.remove());
    if (!A.pop) return;
    const P = A.pop;
    const p = ws.memo.pages[P.page - 1]; if (!p) return;
    const W = p.vp.width, H = p.vp.height, [x, y, w, h] = P.box;
    const sel = document.createElement('div');
    sel.className = 'ws-sel keep';
    Object.assign(sel.style, { left: x * W + 'px', top: y * H + 'px', width: w * W + 'px', height: h * H + 'px' });
    p.box.appendChild(sel);
    const f = document.createElement('form');
    f.className = 'ws-pop'; f.dir = X.T.dir; f.noValidate = true;
    f.innerHTML = P.kind === 'ref' ? refForm(P) : clauseForm(P);
    p.box.appendChild(f);
    // below the box; above it when there is no room; kept inside the page
    const fw = Math.min(310, W - 16);
    f.style.width = fw + 'px';
    f.style.left = Math.max(8, Math.min(W - fw - 8, x * W)) + 'px';
    const fh = f.offsetHeight, below = (y + h) * H + 10;
    f.style.top = (below + fh < H - 8 || y * H - fh - 10 < 8 ? below : y * H - fh - 10) + 'px';
    const r = f.getBoundingClientRect(), view = ws.scroll.getBoundingClientRect();
    if (r.bottom > view.bottom || r.top < view.top) V.glide(ws.scroll, ws.scroll.scrollTop + (r.top - view.top) - Math.max(16, (view.height - r.height) / 2));
    const first = f.querySelector('input[name=amount], textarea[name=note], input[name=date]');
    if (first && !P.noFocus) first.focus({ preventScroll: true });
    P.noFocus = false;
  }

  // installments still missing the box of one part ("the dates sit in a table on page 3")
  const missingPart = (c, part) => instsOf(c.id).filter(i => !parts(i)[part + '_anchor_id']);
  const onePart = P => (P.inc && P.inc.amount !== P.inc.date ? (P.inc.amount ? 'amount' : 'date') : null);

  // on the contract: the total, or an installment — with the two include switches «المبلغ» «التاريخ»
  function clauseForm(P) {
    const t = T(), c = contract(A.cid), isTotal = P.kind === 'total';
    const inc = P.inc || { amount: true, date: true };
    const one = !P.instId && !isTotal ? onePart(P) : null;
    const cands = one ? missingPart(c, one) : [];
    const attach = !P.instId && P.target && P.target !== 'new' ? instById(P.target) : null;
    const inst = P.instId ? instById(P.instId) : attach;
    const note = inst ? inlineNote(c, inst.id) : null;
    const v = P.values || {
      amount: inst ? money(inst.amount_cents) : isTotal && c.total_cents && P.editTotal ? money(c.total_cents) : '',
      date: inst ? dmyFull(inst.due_on) : '', note: note ? note.text : '' };
    const sw = k => `<button type="button" class="ws-sw${inc[k] ? ' on' : ''}" data-a="inc" data-p="${k}" aria-pressed="${!!inc[k]}"><i></i><span>${esc(k === 'amount' ? t.incAmount : t.incDate)}</span></button>`;
    return `
      ${P.instId || P.editTotal ? '' : `<div class="ws-kind" role="radiogroup">
        <button type="button" role="radio" aria-checked="${!isTotal}" data-a="kind" data-k="inst" class="${isTotal ? '' : 'on'}">${esc(t.kindInst)}</button>
        <button type="button" role="radio" aria-checked="${isTotal}" data-a="kind" data-k="total" class="${isTotal ? 'on' : ''}">${esc(t.kindTotal)}</button>
      </div>`}
      ${P.instId ? `<div class="ws-pop-title">${esc(t.kindInst)} ${inst.seq}</div>` : P.editTotal ? `<div class="ws-pop-title">${esc(t.kindTotal)}</div>` : ''}
      ${isTotal ? '' : `<div class="ws-inc"><span class="ws-inc-label">${esc(t.inc)}</span>${sw('amount')}${sw('date')}</div>
        ${P.err.inc ? `<small class="fld-msg bad ws-inc-msg">${esc(P.err.inc)}</small>` : ''}`}
      ${cands.length ? `<label class="fld"><span class="fld-label">${esc(t.forInst)}</span>
        <select class="fld-in" name="target">
          ${cands.map(i => `<option value="${i.id}"${P.target === i.id ? ' selected' : ''}>${esc(t.instN(i.seq))} · ${esc(X.dmy(i.due_on))} · ${money(i.amount_cents)}</option>`).join('')}
          <option value="new"${P.target === 'new' ? ' selected' : ''}>${esc(t.newInst)}</option>
        </select></label>` : ''}
      <label class="fld"><span class="fld-label">${esc(isTotal ? t.kindTotal : t.amount)}</span>
        <input class="fld-in num${P.err.amount ? ' bad' : ''}" name="amount" inputmode="decimal" autocomplete="off" dir="ltr" value="${esc(v.amount)}" placeholder="20,000">
        ${P.err.amount ? `<small class="fld-msg bad">${esc(P.err.amount)}</small>` : ''}</label>
      ${isTotal ? (c.total_cents && !P.editTotal ? `<small class="fld-msg">${esc(t.replaceTotal)}</small>` : '') : `
      <label class="fld"><span class="fld-label">${esc(t.dueOn)}</span>
        ${dateField('date', v.date, P.err.date)}</label>
      <label class="fld"><span class="fld-label">${esc(t.note)} <i>${esc(t.optional)}</i></span>
        <input class="fld-in" name="note" autocomplete="off" dir="auto" value="${esc(v.note)}"></label>`}
      ${redrawLine(P)}
      <div class="adm-actions">
        <button type="submit" class="adm-btn primary small">${esc(t.save)}</button>
        <button type="button" class="adm-btn small" data-a="pop-close">${esc(t.cancel)}</button>
        ${P.instId ? `<button type="button" class="adm-btn small danger" data-a="remove" data-i="${P.instId}">${esc(t.remove)}</button>` : ''}
        ${P.editTotal ? `<button type="button" class="adm-btn small danger" data-a="remove-total">${esc(t.remove)}</button>` : ''}
      </div>`;
  }

  // «إعادة رسم المربع»: only for a box already saved; after the new drag, a line says the move waits for «حفظ»
  const redrawLine = P => (!P.anchorId ? '' : P.moved
    ? `<small class="fld-msg ok ws-moved">${ico.box}<span>${esc(T().movedHint)}</span></small>`
    : `<button type="button" class="ws-redraw" data-a="redraw">${ico.box}<span>${esc(T().redraw)}</span></button>`);
  function redrawBanner() {
    const host = main.querySelector('.ws-doc'); if (!host) return;
    const b = host.querySelector('.ws-banner'); if (b) b.remove();
    if (A.redraw) host.insertAdjacentHTML('beforeend', `<div class="ws-banner" dir="${X.T.dir}">${ico.box}<span>${esc(T().redrawHint)}</span>
      <button type="button" class="adm-btn small" data-a="redraw-cancel">${esc(T().cancel)}</button></div>`);
  }
  function redrawCancel() { A.pop = A.redraw; A.redraw = null; redrawBanner(); marks(); pop(); side(); }

  // what a box on a reference stands for: its place (chosen on upload) + the note text, or the value it changes
  const refPlace = P => {
    const l = P.linkId && linksOf(A.cid).find(x => x.id === P.linkId), n = P.noteId && D().notes.find(x => x.id === P.noteId);
    if (l) return { target: l.target, instId: l.installment_id };
    if (n) return { target: 'note', instId: n.installment_id };
    return { target: ws.doc.ref_target, instId: ws.doc.ref_installment_id };
  };
  function refForm(P) {
    const t = T(), c = contract(A.cid), { target, instId } = refPlace(P), inst = instId && instById(instId);
    const note = P.noteId && D().notes.find(x => x.id === P.noteId);
    const mine = inst && own('installments', inst.id);          // a demo installment's values are not editable here
    const v = P.values || { note: note ? note.text : '', amount: inst ? money(inst.amount_cents) : '', date: inst ? dmyFull(inst.due_on) : '' };
    const where = t.where[target] + (inst ? ' · ' + t.instN(inst.seq) : target === 'note' ? ' · ' + t.wholeContract : '');
    let body = '';
    if (target === 'note') body = `<label class="fld"><span class="fld-label">${esc(t.noteText)}</span>
        <textarea class="fld-in ws-ta${P.err.note ? ' bad' : ''}" name="note" rows="3" dir="auto">${esc(v.note)}</textarea>
        ${P.err.note ? `<small class="fld-msg bad">${esc(P.err.note)}</small>` : ''}</label>`;
    else if (target === 'amount' && mine && c.state === 'draft') body = `<label class="fld"><span class="fld-label">${esc(t.newAmount)}</span>
        <input class="fld-in num${P.err.amount ? ' bad' : ''}" name="amount" inputmode="decimal" autocomplete="off" dir="ltr" value="${esc(v.amount)}">
        <small class="fld-msg${P.err.amount ? ' bad' : ''}">${esc(P.err.amount || t.valueHint)}</small></label>`;
    else if (target === 'date' && mine) body = `<label class="fld"><span class="fld-label">${esc(t.newDate)}</span>
        ${dateField('date', v.date, P.err.date)}<small class="fld-msg">${esc(t.valueHint)}</small></label>`;
    return `
      <div class="ws-pop-title ws-where-line"><span>${esc(t.showsAt)}</span><b>${esc(where)}</b></div>
      ${body}
      ${redrawLine(P)}
      <div class="adm-actions">
        <button type="submit" class="adm-btn primary small">${esc(t.save)}</button>
        <button type="button" class="adm-btn small" data-a="pop-close">${esc(t.cancel)}</button>
        ${P.linkId ? `<button type="button" class="adm-btn small danger" data-a="remove-link" data-l="${P.linkId}">${esc(t.remove)}</button>` : ''}
        ${P.noteId ? `<button type="button" class="adm-btn small danger" data-a="remove-note" data-n="${P.noteId}">${esc(t.remove)}</button>` : ''}
      </div>`;
  }
  const popValues = () => {
    const f = ws && ws.memo && ws.memo.wrap.querySelector('.ws-pop');
    if (!f) return null;
    const el = n => f.elements.namedItem(n);
    return { amount: el('amount') ? el('amount').value : '', date: el('date') ? el('date').value : '',
      note: el('note') ? el('note').value.trim() : '' };
  };

  function savePop() {
    const t = T(), P = A.pop, v = popValues(), c = contract(A.cid);
    P.values = v; P.err = {};
    if (P.kind === 'ref') return saveRef(P, v, c);
    const inc = P.inc || { amount: true, date: true };
    if (P.kind === 'inst' && !inc.amount && !inc.date) P.err.inc = t.incNone;
    const amt = cents(v.amount);
    if (!amt) P.err.amount = t.badAmount;
    const due = isoDate(v.date);
    if (P.kind === 'inst' && !due) P.err.date = v.date.trim() ? t.badDateFmt : t.badDate;
    else if (P.kind === 'inst' && dueLaw(c, due)) P.err.date = dueLaw(c, due);
    if (Object.keys(P.err).length) return pop();
    if (P.moved) S.moveAnchor(P.anchorId, P.page, P.box);           // the redrawn box takes its new place now
    if (P.kind === 'total') {
      const a = P.editTotal ? anchorOf(c.total_anchor_id) : S.anchor(c.document_id, P.page, P.box);
      S.setTotal(c.id, amt, a.id);
    } else if (P.instId) {
      // this box's parts follow the switches; a part switched off here is left without a box (unless it had its own)
      S.editInstallment(P.instId, { due_on: due, amount_cents: amt, note: v.note });
      const p = parts(instById(P.instId)), aid = P.anchorId;
      S.setParts(P.instId, {
        amount_anchor_id: inc.amount ? aid : p.amount_anchor_id === aid ? null : p.amount_anchor_id,
        date_anchor_id: inc.date ? aid : p.date_anchor_id === aid ? null : p.date_anchor_id });
    } else if (P.target && P.target !== 'new') {
      // the missing part of an installment already on the schedule
      S.editInstallment(P.target, { due_on: due, amount_cents: amt, note: v.note });
      const a = S.anchor(c.document_id, P.page, P.box), next = {};
      if (inc.amount) next.amount_anchor_id = a.id;
      if (inc.date) next.date_anchor_id = a.id;
      S.setParts(P.target, next);
    } else {
      const a = S.anchor(c.document_id, P.page, P.box);
      S.addInstallment(c.id, { due_on: due, amount_cents: amt, note: v.note,
        amount_anchor_id: inc.amount ? a.id : null, date_anchor_id: inc.date ? a.id : null });
    }
    A.pop = null; A.ask = null;
    pop(); marks(); side();
  }
  function saveRef(P, v, c) {
    const t = T(), { target, instId } = refPlace(P);
    const mine = instId && own('installments', instId);
    const hasAmt = target === 'amount' && mine && c.state === 'draft', hasDate = target === 'date' && mine;
    const amt = hasAmt ? cents(v.amount) : null, due = hasDate ? isoDate(v.date) : null;
    if (target === 'note' && !v.note) P.err.note = t.noteReq;
    if (hasAmt && !amt) P.err.amount = t.badAmount;
    if (hasDate && !due) P.err.date = v.date.trim() ? t.badDateFmt : t.badDate;
    else if (hasDate && dueLaw(c, due)) P.err.date = dueLaw(c, due);
    if (Object.keys(P.err).length) return pop();
    if (P.moved) S.moveAnchor(P.anchorId, P.page, P.box);
    const aid = P.anchorId || S.anchor(ws.doc.id, P.page, P.box).id;
    if (target === 'note') {
      if (P.noteId) S.editNote(P.noteId, v.note);
      else S.addNote(c.id, { installment_id: instId, text: v.note, anchor_id: aid });
    } else {
      if (!P.linkId) S.link(c.id, { document_id: ws.doc.id, anchor_id: aid, target, installment_id: instId });
      if (hasAmt) S.editValues(instId, { amount_cents: amt });
      if (hasDate) S.editValues(instId, { due_on: due });
    }
    A.pop = null;
    pop(); marks(); side();
  }

  // a box is edited on the file it lives on: switch to it first if another file is on screen
  function openOn(anchorId, popState) {
    const a = anchorOf(anchorId); if (!a) return;
    A.pop = { page: a.page, box: a.box, anchorId, err: {}, ...popState };
    A.ask = null;
    if (!ws || a.document_id !== ws.doc.id) { A.docId = a.document_id; return workspace(); }
    pop(); side();
  }
  function openEdit(instId, part) {
    const p = parts(instById(instId));
    part = part || (p.amount_anchor_id && p.amount_anchor_id === p.date_anchor_id ? 'both' : p.amount_anchor_id ? 'amount' : 'date');
    const aid = part === 'date' ? p.date_anchor_id : p.amount_anchor_id || p.date_anchor_id;
    if (aid) openOn(aid, { instId, kind: 'inst', inc: { amount: part !== 'date', date: part !== 'amount' } });
  }
  function openEditTotal() {
    const c = contract(A.cid);
    openOn(c.total_anchor_id, { instId: null, kind: 'total', editTotal: true });
  }
  function locate(anchorId) {
    if (!ws || !anchorId) return;
    const a = anchorOf(anchorId); if (!a) return;
    if (a.document_id !== ws.doc.id) { A.docId = a.document_id; A.pop = null; A.focusAfter = anchorId; return workspace(); }
    if (ws.memo) V.focus({ page: a.page, box: a.box }, ws.memo, ws.scroll, true);
  }

  function finish(onSum) {
    const c = contract(A.cid), chk = C.scheduleCheck(instsOf(c.id), c.total_cents);
    A.pop = null; pop();
    if (chk.state === 'empty') A.ask = 'empty';
    else if (chk.state === 'short' || chk.state === 'over') A.ask = 'gap';
    else if (chk.state === 'no-total' && !onSum) A.ask = 'no-total';
    else { S.finish(c.id); A.ask = null; A.done = true; return render(main, X); }
    side();
    const g = ws.side.querySelector('.ws-gate');
    if (g) g.scrollIntoView({ block: 'nearest' });
  }

  // ── events (one listener on <main>; <main> itself is never replaced) ───────────────────────────
  function wire(host) {
    const onClick = e => {
      if (pick.open && !e.target.closest('.srch-month')) { pick.open = false; paintMonth(); }   // a click elsewhere closes the calendar
      const b = e.target.closest('[data-a]');
      if (!b || !(host.contains(b) || b.closest('.adm-pane')) || b.tagName === 'INPUT' || b.tagName === 'SELECT') return;
      const a = b.dataset.a;
      if (a === 'new') return go('new');
      if (a === 'home') return go('home');
      if (a === 'open') return go('work', b.dataset.c);
      if (a === 'toggle') { Q.open = Q.open === b.dataset.c ? null : b.dataset.c; A.flash = null; A.revConfirm = null; keepQ(); return paintResults(); }
      if (a === 'firm-open') { const f = b.dataset.f; Q.firmOpen = Q.firmOpen === f ? null : f; Q.open = null; keepQ(); return paintResults(); }
      if (a === 'pick') { pick.open = !pick.open; pick.y = Q.month ? +Q.month.slice(0, 4) : +today().slice(0, 4); return paintMonth(); }
      if (a === 'py') { pick.y += +b.dataset.d; return paintMonth(); }
      if (a === 'pm') return setMonthQ(`${pick.y}-${String(b.dataset.m).padStart(2, '0')}`);
      if (a === 'pm-now') return setMonthQ(today().slice(0, 7));
      if (a === 'pm-all') return setMonthQ('');
      if (a === 'open-inst') return openInst(b.dataset.c, b.dataset.i);
      if (a === 'pay') { A.flash = null; return payStart(b.dataset.c); }
      if (a === 'pay-src') { A.payF.source = b.dataset.k; A.payF.err = {}; return payPage(); }
      if (a === 'cr-add') { A.flash = null; if (A.pane) { A.pane = null; V.close(); } return crStart(b.dataset.f); }
      if (a === 'cr-pane') { A.pane = { kind: 'cr', fid: b.dataset.f }; A.paneFlash = null; A.revConfirm = null; return paintPane(); }
      if (a === 'pays-pane') { A.pane = { kind: 'pays', cid: b.dataset.c }; A.paneFlash = null; A.revConfirm = null; return paintPane(); }
      if (a === 'cr-doc') return crDoc(b.dataset.p);
      if (a === 'cr-voucher') return crVoucher(b.dataset.v);
      if (a === 'cr-tab') { A.crF.tab = b.dataset.k; return crPage(); }
      if (a === 'cr-dep-rev') { A.revConfirm = b.dataset.p; return refresh(); }
      if (a === 'cr-dep-yes') {
        const p = L().payments.find(x => x.id === b.dataset.p);
        S.reverseDeposit(p.id); A.revConfirm = null; A.paneFlash = T().cr.depGone; return refresh();
      }
      if (a === 'cr-use-yes') {
        const v = L().vouchers.find(x => x.id === b.dataset.p), r = S.reverseApplication(v.id);
        A.revConfirm = null; A.paneFlash = T().pay.reversedCredit(no4(r.no)); return refresh();
      }
      if (a === 'pay-auto') { A.payF.manual = false; autoSplit(contract(A.cid)); return paintSplit(); }
      if (a === 'pay-view') return payViewDoc(b.dataset.p);
      if (a === 'pay-rev') { A.revConfirm = b.dataset.p; A.flash = null; return refresh(); }
      if (a === 'pay-rev-no') { A.revConfirm = null; return refresh(); }
      if (a === 'pay-rev-yes') {
        S.reversePayment(b.dataset.p); A.revConfirm = null; A.paneFlash = T().pay.reversed;
        return refresh();
      }
      if (a === 'doc') return X.openDoc(b.dataset.k, b.dataset.i, b.dataset.n, b.dataset.part);   // the Boss's document panel
      if (a === 'clear') { Object.assign(Q, { text: '', month: '', firm: '' }); keepQ(); return home(); }
      if (a === 'tab') { if (b.dataset.d === A.docId) return; A.docId = b.dataset.d; A.pop = null; A.redraw = null; return workspace(); }
      if (a === 'draw') { A.drawMode = !A.drawMode; b.classList.toggle('on', A.drawMode); ws && ws.scroll.classList.toggle('draw-mode', A.drawMode); return; }
      if (a === 'kind') { A.pop.values = popValues(); A.pop.kind = b.dataset.k; A.pop.err = {}; return pop(); }
      if (a === 'inc') {                                  // a switch: the box shows the amount, the date, or both
        const P = A.pop, c = contract(A.cid);
        P.values = popValues(); P.err = {};
        P.inc = { ...(P.inc || { amount: true, date: true }), [b.dataset.p]: !(P.inc || { amount: true, date: true })[b.dataset.p] };
        if (!P.instId) {
          const one = onePart(P), cands = one ? missingPart(c, one) : [];
          const next = cands.length ? (cands.some(i => i.id === P.target) ? P.target : cands[0].id) : 'new';
          if (next !== P.target) { P.target = next; if (next !== 'new') P.values = null; }   // an existing one shows its own values
        }
        P.noFocus = true;
        return pop();
      }
      if (a === 'pop-close') { A.pop = null; pop(); marks(); return side(); }
      if (a === 'redraw') { A.redraw = { ...A.pop, values: popValues(), moved: false }; A.pop = null; pop(); marks(); return redrawBanner(); }
      if (a === 'redraw-cancel') return redrawCancel();
      if (a === 'edit') return openEdit(b.dataset.i, b.dataset.part);
      if (a === 'edit-total') return openEditTotal();
      if (a === 'edit-link') { const l = linksOf(A.cid).find(x => x.id === b.dataset.l); return openOn(l.anchor_id, { kind: 'ref', linkId: l.id }); }
      if (a === 'edit-note') { const n = D().notes.find(x => x.id === b.dataset.n); return openOn(n.anchor_id, { kind: 'ref', noteId: n.id }); }
      if (a === 'remove') { S.removeInstallment(b.dataset.i); A.pop = null; pop(); marks(); return side(); }
      if (a === 'remove-total') { S.clearTotal(A.cid); A.pop = null; A.ask = null; pop(); marks(); return side(); }
      if (a === 'remove-link') { S.removeLink(b.dataset.l); A.pop = null; pop(); marks(); return side(); }
      if (a === 'remove-note') { S.removeNote(b.dataset.n); A.pop = null; pop(); marks(); return side(); }
      if (a === 'locate') { const p = parts(instById(b.dataset.i)); return locate(p.amount_anchor_id || p.date_anchor_id); }
      if (a === 'locate-total') return locate(contract(A.cid).total_anchor_id);
      if (a === 'locate-a') return locate(b.dataset.an);
      if (a === 'where') {
        const R = A.refAsk, s = main.querySelector('#ws-ref select[name=inst]');
        if (s) R.inst = s.value || null;
        R.target = b.dataset.w; R.err = '';
        const insts = instsOf(A.cid);
        if (R.target === 'contract') R.inst = null;
        else if (R.target !== 'note' && !insts.some(i => i.id === R.inst)) R.inst = insts[0] ? insts[0].id : null;
        return refAskPaint();
      }
      if (a === 'ref-cancel') { A.refAsk = null; return refAskPaint(); }
      if (a === 'finish') return finish(false);
      if (a === 'finish-sum') return finish(true);
      if (a === 'ask-close') { A.ask = null; return side(); }
    };
    host.addEventListener('click', onClick);
    document.addEventListener('click', e => { if (e.target.closest('.adm-pane')) onClick(e); });   // the pages in the side panel
    host.addEventListener('submit', e => {
      e.preventDefault();
      if (e.target.id === 'adm-new') return submitNew();
      if (e.target.id === 'ws-ref') return submitRef();
      if (e.target.id === 'pay-form') return savePay();
      if (e.target.id === 'cr-form') return saveCredit();
      if (e.target.classList.contains('ws-pop')) return savePop();
    });
    host.addEventListener('change', e => {
      if (e.target.dataset.a === 'file' && e.target.files[0]) { keepForm(); takeFile(e.target.files[0]); }
      if (e.target.dataset.a === 'ref-file' && e.target.files[0]) { takeRef(e.target.files[0]); e.target.value = ''; }
      if (e.target.dataset.a === 'pay-file' && e.target.files[0]) { takePayFile(e.target.files[0]); e.target.value = ''; return; }
      if (e.target.dataset.a === 'cr-file' && e.target.files[0]) { takeCrFile(e.target.files[0]); e.target.value = ''; return; }
      if (e.target.name === 'chk' && e.target.closest('#pay-form')) return payTick(e.target);
      if (e.target.closest('#adm-search') && e.target.name === 'firm') {
        Q[e.target.name] = e.target.value; keepQ(); return paintResults();
      }
      if (e.target.name === 'target' && A.pop && e.target.closest('.ws-pop')) {   // the installment this box completes
        A.pop.target = e.target.value; A.pop.values = null; A.pop.err = {}; A.pop.noFocus = true; pop();
      }
    });
    let typing = 0;
    host.addEventListener('input', e => {
      if (e.target.name === 'text' && e.target.closest('#adm-search')) {       // results follow the typing, the box keeps focus
        Q.text = e.target.value; keepQ(); clearTimeout(typing); typing = setTimeout(paintResults, 120); return;
      }
      if (e.target.name === 'amount') groupAmount(e.target);
      if (e.target.dataset.date) {                         // the date typed, read back in words: no day/month mix-up
        const echo = e.target.parentNode.querySelector(`[data-date-echo="${e.target.name}"]`), iso = isoDate(e.target.value);
        if (echo) { echo.className = 'fld-msg ok'; echo.textContent = iso ? X.date(iso) : X.T.dateHint; e.target.classList.remove('bad'); }
      }
      if (e.target.closest && e.target.closest('#pay-form')) payInput(e.target);
      if (e.target.closest && e.target.closest('#cr-form')) crInput(e.target);
      if (e.target.name === 'firm' && e.target.form && e.target.form.id === 'adm-new') {
        const m = host.querySelector('[data-msg=firm]');
        if (m && !m.classList.contains('bad')) m.textContent = e.target.value.trim() && !S.firmByName(e.target.value) ? T().firmNew : '';
      }
    });
    host.addEventListener('dragover', e => { const z = e.target.closest('[data-drop]'); if (z) { e.preventDefault(); z.classList.add('over'); } });
    host.addEventListener('dragleave', e => { const z = e.target.closest('[data-drop]'); if (z) z.classList.remove('over'); });
    host.addEventListener('drop', e => {
      const z = e.target.closest('[data-drop]'); if (!z) return;
      e.preventDefault(); z.classList.remove('over');
      const file = e.dataTransfer.files[0]; if (!file) return;
      if (z.dataset.drop === 'ref') return takeRef(file);
      if (z.dataset.drop === 'pay') return takePayFile(file);
      if (z.dataset.drop === 'cr') return takeCrFile(file);
      keepForm(); takeFile(file);
    });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || (!ws && !pick.open)) return;
      if (pick.open) { pick.open = false; return paintMonth(); }
      if (A.refAsk) { A.refAsk = null; return refAskPaint(); }
      if (A.redraw) return redrawCancel();                         // back to the form, the old box untouched
      if (A.pop) { A.pop = null; pop(); marks(); side(); }
    });
  }

  let wired = false;
  root.SakerAdmin = {
    render(host, helpers) { if (!wired) { wire(host); wired = true; } render(host, helpers); },
    leave() { ws = null; payView = null; crView = null; A.pop = null; document.body.classList.remove('ws-on'); },
    _state: A, _cents: cents, _isoDate: isoDate,
  };
})(window);
