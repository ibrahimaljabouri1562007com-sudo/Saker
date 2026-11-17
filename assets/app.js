// صقر app shell: the Boss's three altitudes (Sky · Hover · Dive) over the stored facts.
// Every number comes from SakerCalc; nothing here does money math of its own.
// Data areas (the three numbers, firms, drawers) run left-to-right in BOTH languages (Ibrahim,
// 2026-11-08): Due · Paid · Remaining, and Firm/Contract on the left. Only the words translate.
(function () {
  'use strict';
  const C = window.SakerCalc, I = window.SakerI18n, V = window.SakerViewer, S = window.SakerStore;
  // the facts = the demo fridge + what the Admin added (SakerStore); re-indexed only when something changed
  let ix = C.index(S.data()), ixVersion = S.version;
  const fresh = () => { if (ixVersion !== S.version) { ix = C.index(S.data()); ixVersion = S.version; } };
  const today = C.todayBaghdad();
  const TY = +today.slice(0, 4), TM = +today.slice(5, 7);

  const store = {
    get(k, d) { try { return localStorage.getItem('saker.' + k) || d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('saker.' + k, v); } catch (e) { /* private mode */ } },
  };
  const session = {
    get() { try { return sessionStorage.getItem('saker.session'); } catch (e) { return null; } },
    set(v) { try { v ? sessionStorage.setItem('saker.session', v) : sessionStorage.removeItem('saker.session'); } catch (e) { /* private mode */ } },
  };
  const state = {
    user: S.remote ? null : session.get(),   // demo session · on the database: the real account (S.ready / S.signIn)
    lang: store.get('lang', 'ar'),
    role: store.get('role', 'boss'),
    y: TY, m: TM,                    // the month lens: today's month by default
    details: false, open: null,
    picker: false, py: TY,            // month/year picker
    reveal: false,                    // play the firms' entrance once, right after "Details"
  };
  const t = () => I[state.lang];

  // ── formatting (Western digits in both languages) ─────────────────────────
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const money = cents => (cents / 100).toLocaleString('en-US', cents % 100 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 });
  const date = iso => `${+iso.slice(8, 10)} ${t().months[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;
  const dmy = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;     // the drawer's dates: dd/mm/yy (Ibrahim, 2026-11-12)
  // the "opens its proof" mark: on every value that opens a document, visible without hovering
  const proofIcon = '<svg class="pf" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h6l3 3v8H4z M10 2.5v3h3 M6.5 9h4 M6.5 11h3"/></svg>';
  const monthLabel = () => `${t().months[state.m - 1]} ${state.y}`;
  const chev = d => `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="${d === 'l' ? 'M7.5 2l-4 4 4 4' : d === 'r' ? 'M4.5 2l4 4-4 4' : 'M2 4.5l4 4 4-4'}"/></svg>`;

  function statusChip(r) {
    const late = r.dpd > 0 && r.status !== 'paid';
    const days = late ? `<span class="chip-days">${esc(t().days(r.dpd))}</span>` : '';
    return `<span class="chip st-${r.status} b${r.bucket}${late ? ' late' : ''}" dir="${t().dir}"><i></i>${esc(t().st[r.status])}${days}</span>`;
  }
  // the firm's chip: its worst row; late is light red for 1–30 days, dark red beyond (the aging bucket)
  const firmChip = f => `<span class="chip st-${f.status} b${f.bucket}${f.status === 'due' && f.max_dpd > 0 ? ' late' : ''}" dir="${t().dir}"><i></i>${esc(t().st[f.status])}</span>`;

  // ── render ────────────────────────────────────────────────────────────────
  const $ = s => document.querySelector(s);

  function render() {
    const T = t();
    document.documentElement.lang = state.lang;
    document.body.dataset.role = state.role;                       // Look v2 shows the landscape behind the Boss only
    document.documentElement.dir = T.dir;
    if (!state.user) {
      document.title = T.brand;
      // on the database the password is checked for real (the 6-digit second step arrives in B6)
      window.SakerSignin.verify = S.remote ? (email, pw) => S.signIn(email, pw).then(m => { applyMe(m); return m; }) : null;
      window.SakerSignin.show(T, email => arrive(() => { state.user = email; if (!S.remote) session.set(email); window.SakerSignin.hide(); render(); }));
      return;
    }
    document.body.classList.toggle('is-boss-account', !!(S.remote && S.me && S.me.role === 'boss'));
    document.title = `${T.brand} · ${monthLabel()}`;
    $('#brand-name').textContent = state.lang === 'ar' ? 'صقر' : 'SAKER';
    $('#lang').textContent = state.lang === 'ar' ? 'EN' : 'ع';
    $('#lang').setAttribute('aria-label', state.lang === 'ar' ? 'English' : 'العربية');
    $('#role-label').textContent = T.build;
    $('#role-boss').textContent = T.boss;
    $('#role-admin').textContent = T.admin;
    $('#role-boss').classList.toggle('on', state.role === 'boss');
    $('#role-admin').classList.toggle('on', state.role === 'admin');
    $('#demo-tag').textContent = T.demo;
    $('#look').classList.toggle('on', document.documentElement.getAttribute('data-look') === '2');
    $('#signout').setAttribute('aria-label', T.si.signOut);
    $('#signout').title = T.si.signOut;
    $('#export').hidden = state.role !== 'boss';                   // the report is the Boss's view on paper
    $('#export').setAttribute('aria-label', T.rp.btn); $('#export').title = T.rp.btn;

    if (state.role === 'admin') {
      // the Admin's drawers use the Boss's own click map (Ibrahim, 2026-11-14): one engine, so the two can never differ
      window.SakerAdmin.render($('#main'), { T, esc, money, dmy, date, user: state.user, proofIcon, voucherHtml, no4,
        openDoc: (kind, instId, noteId, part) => { fresh(); openDoc(kind, instId, noteId, part); } });
      return;
    }
    window.SakerAdmin.leave();
    fresh();
    const M = C.month(ix, state.y, state.m, today);
    $('#main').innerHTML = sky(M) + (state.details ? hover(M) : '');
    state.reveal = false;
  }

  function picker() {
    const T = t();
    return `
      <div class="picker" role="dialog" aria-label="${esc(T.pickMonth)}" dir="${T.dir}">
        <div class="picker-year" dir="ltr">
          <button type="button" class="icon-btn" data-py="-1" aria-label="${esc(T.prevYear)}">${chev('l')}</button>
          <span>${state.py}</span>
          <button type="button" class="icon-btn" data-py="1" aria-label="${esc(T.nextYear)}">${chev('r')}</button>
        </div>
        <div class="picker-months">
          ${T.months.map((n, i) => `<button type="button" data-pm="${i + 1}" class="${state.py === state.y && i + 1 === state.m ? 'on' : ''} ${state.py === TY && i + 1 === TM ? 'now' : ''}">${esc(n)}</button>`).join('')}
        </div>
        <button type="button" class="picker-today" data-today="1">${esc(T.thisMonthBtn)}</button>
      </div>`;
  }

  function sky(M) {
    const T = t();
    const cell = (label, cents, cls) => `
      <div class="sky-cell ${cls}">
        <div class="sky-label" dir="${T.dir}">${esc(label)}</div>
        <div class="sky-num">${money(cents)}</div>
      </div>`;
    return `
      <section class="sky ${state.details ? 'compact' : ''}" aria-label="${esc(monthLabel())}">
        <span class="sky-falcon" aria-hidden="true"></span>
        <svg class="sky-arc" viewBox="0 0 1000 500" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
          <path d="M60 500 A440 440 0 0 1 940 500"/><path d="M500 52 v18"/>
        </svg>
        <div class="month-nav" dir="ltr">
          <button type="button" id="prev" class="icon-btn" aria-label="${esc(T.prev)}">${chev('l')}</button>
          <button type="button" id="month-pick" class="month-label" aria-haspopup="dialog" aria-expanded="${state.picker}" title="${esc(T.pickMonth)}">
            <span dir="${T.dir}">${esc(monthLabel())}</span>${chev('d')}
          </button>
          <button type="button" id="next" class="icon-btn" aria-label="${esc(T.next)}">${chev('r')}</button>
          ${state.picker ? picker() : ''}
        </div>
        <div class="sky-row" dir="ltr">
          ${cell(T.due, M.due_cents, 'is-due')}
          ${cell(T.paid, M.paid_cents, 'is-paid')}
          ${cell(T.remaining, M.remaining_cents, 'is-rem')}
        </div>
        <div class="sky-unit">${esc(T.usd)}</div>
        <button class="sky-more" type="button" id="toggle-details" aria-expanded="${state.details}">
          ${esc(state.details ? T.hideDetails : T.details)} ${chev('d')}
        </button>
        <svg class="horizon" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 92 C160 70 260 60 420 74 S700 98 860 70 S1080 52 1200 66"/>
          <path d="M0 108 C200 92 340 88 520 98 S820 112 1000 94 S1140 86 1200 92"/>
        </svg>
      </section>`;
  }

  function hover(M) {
    const T = t();
    if (!M.firms.length) return `<section class="hover"><p class="empty">${esc(T.empty)}</p></section>`;
    return `
      <section class="hover" dir="ltr" aria-label="${esc(T.firms)}">
        <div class="firm-grid hover-head">
          <span dir="${T.dir}">${esc(T.colFirm)} <b>${esc(T.firmsCount(M.firms.length))}</b></span>
          <span class="num" dir="${T.dir}">${esc(T.colDue)}</span>
          <span dir="${T.dir}">${esc(T.colStatus)}</span><span></span>
        </div>
        <ul class="firms ${state.reveal ? 'reveal' : ''}">
          ${M.firms.map((f, k) => `
            <li class="firm ${state.open === f.firm.id ? 'open' : ''}" style="--i:${k}">
              <button class="firm-bar firm-grid" type="button" data-firm="${f.firm.id}" aria-expanded="${state.open === f.firm.id}">
                <span class="firm-name" dir="auto">${esc(f.firm.name)}</span>
                <span class="firm-num">${money(f.due_cents)}</span>
                ${firmChip(f)}
                <svg class="firm-caret" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4.5l4 4 4-4"/></svg>
              </button>
              ${state.open === f.firm.id ? drawer(f) : ''}
            </li>`).join('')}
        </ul>
      </section>`;
  }

  function drawer(f) {
    const T = t();
    const month = f.rows.filter(r => r.group === 'month'), late = f.rows.filter(r => r.group === 'overdue');
    const rowHtml = r => {
      const k = r.installment.id;
      const n = ix.instsOf[r.contract.id].length;
      const note = r.notes[0];
      const showOf = r.group === 'overdue' && r.due_cents !== r.original_cents;
      return `
        <div class="row${r.status === 'overdue' ? ` is-late b${r.bucket}` : ''}" role="row">
          <button class="cell ref link" role="cell" data-open="contract" data-i="${k}" title="${esc(T.contract)}"><span class="v">${esc(r.contract.ref)}</span>${proofIcon}</button>
          <button class="cell amt link" role="cell" data-open="${r.paid_ever_cents > 0 ? 'compare' : 'clause'}" data-part="amount" data-i="${k}" title="${esc(T.installment(r.installment.seq, n))}">
            <span class="v">${money(r.due_cents)}</span>${proofIcon}${showOf ? `<small dir="${T.dir}">${esc(T.of)} ${money(r.original_cents)}</small>` : ''}${r.paid_cents > 0 && r.remaining_cents > 0 ? `<small dir="${T.dir}">${esc(T.stripLeft)} ${money(r.remaining_cents)}</small>` : ''}
          </button>
          <button class="cell date link" role="cell" data-open="clause" data-part="date" data-i="${k}" title="${esc(date(r.installment.due_on))}"><span class="v">${esc(dmy(r.installment.due_on))}</span>${proofIcon}</button>
          ${r.status === 'paid' && r.clickable_status
            ? `<button class="cell status link" role="cell" data-open="proof" data-i="${k}" title="${esc(T.transfer)}">${statusChip(r).replace(/<\/span>$/, proofIcon + '</span>')}</button>`
            : `<span class="cell status" role="cell">${statusChip(r)}</span>`}
          ${note
            ? `<button class="cell note link" role="cell" data-open="note" data-i="${k}" data-n="${note.id}" title="${esc(note.text)}">
                 <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h6l3 3v8H4z M10 2.5v3h3"/></svg><span dir="auto">${esc(note.text)}</span></button>`
            : `<span class="cell note none" role="cell">—</span>`}
        </div>`;
    };
    // no group labels (Ibrahim, 2026-11-12): this month's rows come first; overdue rows follow, marked by a soft
    // red tint and edge on the row itself — the status chip already says «متأخر»
    const group = (rows, cls) => rows.length ? `<div class="group ${cls}">${rows.map(rowHtml).join('')}</div>` : '';
    return `
      <div class="drawer" role="table">
        <div class="row row-head" role="row">
          <span role="columnheader" dir="${T.dir}">${esc(T.colRef)}</span>
          <span role="columnheader" class="num" dir="${T.dir}">${esc(T.colAmount)}</span>
          <span role="columnheader" dir="${T.dir}">${esc(T.colDate)}<small class="hint" dir="${T.dir}">${esc(T.dateHint)}</small></span>
          <span role="columnheader" dir="${T.dir}">${esc(T.colStatus)}</span>
          <span role="columnheader" dir="${T.dir}">${esc(T.colNote)}</span>
        </div>
        ${group(month, 'g-month')}
        ${group(late, 'g-late')}
      </div>`;
  }

  // ── the settlement voucher (سند تسوية), written by the system from its own record — never typed (2026-11-14) ──
  const no4 = n => String(n).padStart(4, '0');
  function voucherHtml(v) {
    const T = t(), d = S.data(), L = S.local;
    const find = (tbl, id) => d[tbl].find(r => r.id === id) || (L[tbl] || []).find(r => r.id === id) || {};
    const c = find('contracts', v.contract_id), firm = find('firms', v.firm_id);
    const n = d.installments.filter(i => i.contract_id === c.id).length;
    const rows = (v.lines || []).map(l => {
      const i = find('installments', l.installment_id), dep = find('payments', l.payment_id);
      return `<tr><td>${esc(T.installment(i.seq, n))}</td><td dir="ltr">${esc(dmy(i.due_on || ''))}</td>
        <td>${esc(T.cr.deposit)} <span dir="ltr">${esc(dep.bank_ref || '')} · ${esc(dmy(dep.received_on || ''))}</span></td><td class="n" dir="ltr">${money(l.cents)}</td></tr>`;
    }).join('');
    const pair = (k, val, ltr) => `<div><dt>${esc(k)}</dt><dd${ltr ? ' dir="ltr"' : ''}>${val}</dd></div>`;
    return `
      <article class="voucher v-${v.kind}" dir="${T.dir}">
        <header><span class="v-kind">${esc(v.kind === 'reversal' ? T.cr.vReversal : T.cr.vSettlement)}</span><b class="v-no" dir="ltr">№ ${no4(v.no)}</b></header>
        <dl>
          ${pair(T.cr.date, esc(date(v.issued_on)))}${pair(T.cr.firm, esc(firm.name || ''))}${pair(T.cr.contract, esc(c.ref || ''), true)}
          ${pair(T.cr.amount, money(v.amount_cents), true)}
          ${pair(T.cr.before, money(v.balance_before_cents), true)}${pair(T.cr.after, money(v.balance_after_cents), true)}
          ${v.reverses ? pair(T.cr.reverses, '№ ' + no4(find('vouchers', v.reverses).no || 0), true) : ''}
          ${v.reversed_by ? pair(T.cr.reversedBy, '№ ' + no4(find('vouchers', v.reversed_by).no || 0), true) : ''}
          ${pair(T.cr.by, esc((S.who ? S.who(v.created_by) : v.created_by) || ''), true)}${pair(T.cr.at, esc(String(v.created_at || '').replace('T', ' ')), true)}
        </dl>
        <table><tbody>${rows}</tbody></table>
        <footer>${esc(T.cr.foot)}</footer>
      </article>`;
  }

  // ── Look v2 (Ibrahim, 2026-11-17): the Boss view CONTINUES the sign-in ──────────────────────────────────────
  // The same landscape poster, at the same place, drawn once onto a canvas already softened (dim + blur) — never a
  // live blur on every frame. Signing in becomes an arrival: the falcon flies from the sign-in into the bar (a view
  // transition), the sharp land melts into the soft one, then the bar and the three words settle in. Only once, at
  // the sign-in; respects "reduce motion"; every later visit opens straight in place.
  const lookOn = () => document.documentElement.getAttribute('data-look') === '2';
  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let sceneKey = '';
  function paintScene() {
    const cv = document.getElementById('app-scene'), Tn = window.SakerTerrain, P = window.SAKER_POSTERS;
    if (!cv || !lookOn() || !Tn || !Tn.layout || !P || P.look !== Tn.LOOK) return;
    const W = innerWidth, H = innerHeight, key = `${W}x${H}`;
    if (sceneKey === key) return;
    sceneKey = key;
    const p = Tn.pickPoster(W, H); if (!p) return;
    const L = Tn.layout(W, H), img = new Image();
    img.decoding = 'async'; img.src = P.dir + p.f;                    // the sign-in's own poster (already in the cache)
    img.onload = () => {
      if (sceneKey !== key) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
      let h = W / p.a, top = L.cy - p.h * h;                          // the sign-in's placement (terrain.js placePoster)
      if (top > 0 || top + h < H) h = Math.max(L.cy / p.h, (H - L.cy) / (1 - p.h), h);
      const w = h * p.a; top = L.cy - p.h * h;
      const ctx = cv.getContext('2d'), soft = 'blur(5px) brightness(0.62) saturate(0.9)';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.filter = soft;
      const ok = ctx.filter === soft;                                  // a browser without canvas filters: soften by CSS
      ctx.drawImage(img, (W - w) / 2 - 14, top - 14, w + 28, h + 28);  // a little bleed: the blur leaves no dark rim
      cv.classList.toggle('css-soft', !ok); cv.classList.add('ready');
    };
  }
  addEventListener('resize', () => { clearTimeout(paintScene.t); paintScene.t = setTimeout(paintScene, 160); });
  // the falcon is three paths inside the sign-in lockup: lay a SQUARE copy of them exactly over it (the originals hidden),
  // so the flight is square → square (the bar's mark) and only scales and travels; the lettering fades with the sign-in
  function falconGhost() {
    const m = document.querySelector('.si-mark'), ps = m ? [...m.querySelectorAll('path')].slice(0, 3) : [];
    if (ps.length < 3) return () => {};
    const u = ps.map(p => p.getBBox()), r = ps.map(p => p.getBoundingClientRect());
    const ux0 = Math.min(...u.map(b => b.x)), uy0 = Math.min(...u.map(b => b.y));
    const ux1 = Math.max(...u.map(b => b.x + b.width)), uy1 = Math.max(...u.map(b => b.y + b.height));
    const rx0 = Math.min(...r.map(b => b.left)), ry0 = Math.min(...r.map(b => b.top));
    const rx1 = Math.max(...r.map(b => b.right)), ry1 = Math.max(...r.map(b => b.bottom));
    const k = (rx1 - rx0) / ((ux1 - ux0) || 1), s = Math.max(ux1 - ux0, uy1 - uy0) * 1.06;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    g.setAttribute('class', 'si-falcon-fly'); g.setAttribute('aria-hidden', 'true');
    g.setAttribute('viewBox', `${(ux0 + ux1 - s) / 2} ${(uy0 + uy1 - s) / 2} ${s} ${s}`);
    Object.assign(g.style, { left: `${(rx0 + rx1 - s * k) / 2}px`, top: `${(ry0 + ry1 - s * k) / 2}px`, width: `${s * k}px`, height: `${s * k}px` });
    ps.forEach(p => g.appendChild(p.cloneNode(true)));
    document.body.appendChild(g); ps.forEach(p => { p.style.visibility = 'hidden'; });
    return () => { g.remove(); ps.forEach(p => { p.style.visibility = ''; }); };
  }
  function arrive(update) {
    if (!lookOn() || reduced() || !document.startViewTransition) return update();
    paintScene();
    const land = falconGhost();
    document.startViewTransition(() => {
      land();
      update();
      document.body.classList.add('arriving');
      setTimeout(() => document.body.classList.remove('arriving'), 1800);
    });
  }

  // ── the click map: every number leads to its document ──────────────────────
  // The Boss sees what the Admin prepared (Ibrahim, 2026-11-12): the amount opens the amount's box, the date the
  // date's box (one box when the Admin highlighted both together); a reference placed on that field opens beside
  // the contract, side by side.
  function openDoc(kind, instId, noteId, part) {
    const T = t();
    const inst = ix.inst[instId], c = ix.contract[inst.contract_id];
    const n = ix.instsOf[c.id].length;
    const doc = id => ix.document[id];
    const anchor = id => (id && ix.anchor[id] ? { page: ix.anchor[id].page, box: ix.anchor[id].box } : null);
    const box = which => (which === 'date' ? inst.date_anchor_id : inst.amount_anchor_id) || inst.anchor_id || inst.date_anchor_id;
    const refsAt = target => {
      const ls = (ix.data.links || []).filter(l => l.contract_id === c.id && l.target === target && (target === 'contract' || l.installment_id === inst.id));
      return ls.map((l, k) => ({ label: ls.length > 1 ? `${T.attached} ${k + 1}` : T.attached, path: doc(l.document_id).file_path, anchor: anchor(l.anchor_id) }));
    };
    const base = { closeLabel: T.close, loadingLabel: T.loading, note: null };
    const sideBySide = (spec, left, right) => ({ ...spec, dir: T.dir, tabs: [], compare: { dir: T.dir, left, right, rightLabel: T.attached } });
    let spec;
    if (kind === 'contract') {
      const whole = { label: T.contract, path: doc(c.document_id).file_path, anchor: null }, refs = refsAt('contract');
      // the signing date lives here, one click deep, beside the contract itself (Ibrahim, 2026-11-13)
      spec = { ...base, title: c.ref, sub: c.signed_on ? `${T.contract} · ${T.signedOn(date(c.signed_on))}` : T.contract, tabs: [whole] };
      if (refs.length) spec = sideBySide(spec, whole, refs);
    } else if (kind === 'clause') {
      const which = part === 'date' ? 'date' : 'amount';
      const clause = { label: `${T.contract} · ${T.installment(inst.seq, n)}`, path: doc(c.document_id).file_path, anchor: anchor(box(which)) };
      const refs = refsAt(which);
      spec = { ...base, title: c.ref, sub: `${T.installment(inst.seq, n)} · ${money(inst.amount_cents)} · ${date(inst.due_on)}`,
        tabs: [{ ...clause, label: T.contract }] };
      if (refs.length) spec = sideBySide(spec, clause, refs);
    } else if (kind === 'proof' || kind === 'compare') {
      // the transfers behind this instalment, and the arithmetic they prove
      const pays = C.paymentsOf(ix, instId, today);
      const paid = pays.reduce((s, x) => s + x.applied_cents, 0), left = Math.max(0, inst.amount_cents - paid);
      const strip = [
        { label: T.stripInst, value: money(inst.amount_cents) },
        { label: T.stripPaid, value: money(paid), tone: 'paid' },
        { label: T.stripLeft, value: money(left), tone: left > 0 ? 'late' : 'paid' },
      ];
      // a transfer = its receipt; money from the firm's credit (2026-11-14) = the deposit's receipt + the firm's instruction
      // + the settlement voucher the system wrote, and one note line saying where it came from and what is left
      const seen = new Set(), transfers = [], vnos = [];
      const tab = (key, t) => { if (!seen.has(key)) { seen.add(key); transfers.push(t); } };
      for (const x of pays) {
        const p = x.payment;
        if (p.kind !== 'credit') { tab('p' + p.id, { label: `${T.transfer} · ${dmy(p.received_on)} · ${money(x.applied_cents)}`, path: doc(p.proof_document_id).file_path, anchor: anchor(p.proof_anchor_id) }); continue; }
        tab('r' + p.id, { label: `${T.cr.fromCredit} · ${p.bank_ref}`, path: doc(p.proof_document_id).file_path, anchor: anchor(p.proof_anchor_id) });
        tab('i' + p.id, { label: T.cr.instruction, path: doc(p.instruction_document_id).file_path, anchor: anchor(p.instruction_anchor_id) });
        const v = (ix.data.vouchers || []).find(w => w.id === x.allocation.voucher_id);
        if (v) { tab('v' + v.id, { label: `${T.cr.voucher} ${no4(v.no)}`, html: voucherHtml(v) }); vnos.push(no4(v.no)); }
      }
      if (vnos.length) base.note = { label: T.cr.noteLabel, text: T.cr.note([...new Set(vnos)].join('، '), money(S.creditOf(c.firm_id))) };
      const sub = `${T.installment(inst.seq, n)} · ${date(inst.due_on)}`;
      if (kind === 'proof') {
        // a PAID status: its proof is the transfer(s) — whole, so shown on their own, with the strip
        spec = { ...base, title: c.ref, sub, strip, dir: T.dir, tabs: transfers };
      } else {
        // the amount of a row that money came into: what was owed (the clause) beside what came in
        // (+ any reference the Admin placed on this amount, after the transfers)
        spec = { ...base, title: c.ref, sub, strip, dir: T.dir, tabs: [],
          compare: { dir: T.dir, left: { label: `${T.contract} · ${T.installment(inst.seq, n)}`, path: doc(c.document_id).file_path, anchor: anchor(box('amount')) },
                     right: transfers.concat(refsAt('amount')), rightLabel: T.transfer } };
      }
    } else if (kind === 'note') {
      const note = ix.data.notes.find(x => x.id === noteId);
      const a = ix.anchor[note.anchor_id];
      spec = { ...base, title: c.ref, sub: T.note, note: { label: T.note, text: note.text },
        tabs: [{ label: T.source, path: doc(a.document_id).file_path, anchor: anchor(note.anchor_id) }] };
    }
    V.open(spec);
  }

  // ── the report (PDF, 2026-11-17): the month on screen, counted to this moment — the same engine as the screen ──
  function exportReport() {
    fresh(); V.close(); state.picker = false;
    const now = new Date(), day = C.todayBaghdad(now);
    const hm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baghdad', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
    window.SakerReport.open({ T: t(), ix, M: C.month(ix, state.y, state.m, day), esc, money, dmy, date, month: monthLabel(), day, hm });
  }

  // "Details" as one motion: the sky folds down to its content, the firms rise in right under
  // the button, and the page only moves if the firms would otherwise start below the fold.
  function toggleDetails() {
    const before = $('.sky').offsetHeight;
    state.details = !state.details;
    state.open = null; state.picker = false; state.reveal = state.details;
    render();
    const sky = $('.sky'), after = sky.offsetHeight;
    sky.style.minHeight = before + 'px';
    void sky.offsetHeight;
    sky.style.transition = 'min-height 320ms cubic-bezier(0.2, 0.7, 0.2, 1)';
    sky.style.minHeight = after + 'px';
    setTimeout(() => {
      sky.style.transition = ''; sky.style.minHeight = '';
      const btn = $('#toggle-details');
      if (state.details && btn && btn.getBoundingClientRect().bottom > innerHeight * 0.55) {
        window.scrollTo({ top: scrollY + btn.getBoundingClientRect().top - 72, behavior: 'smooth' });
      }
    }, 330);
  }

  function setMonth(y, m) {
    state.y = y; state.m = m; state.open = null; state.picker = false;
    V.close(); render();
  }

  // ── events ────────────────────────────────────────────────────────────────
  document.addEventListener('click', e => {
    const el = e.target.closest('button');
    if (state.picker && !e.target.closest('.picker') && (!el || el.id !== 'month-pick')) {
      state.picker = false; render(); if (!el) return;
    }
    if (!el) return;
    if (el.id === 'toggle-details') return toggleDetails();
    if (el.id === 'month-pick') { state.picker = !state.picker; state.py = state.y; return render(); }
    if (el.dataset.py) { state.py += +el.dataset.py; return render(); }
    if (el.dataset.pm) return setMonth(state.py, +el.dataset.pm);
    if (el.dataset.today) return setMonth(TY, TM);
    if (el.id === 'prev' || el.id === 'next') {
      const k = state.y * 12 + (state.m - 1) + (el.id === 'next' ? 1 : -1);
      return setMonth(Math.floor(k / 12), (k % 12) + 1);
    }
    if (el.id === 'look') {                                     // Look v2 on / off (compare the two; remembered)
      const on = document.documentElement.getAttribute('data-look') !== '2';
      if (on) document.documentElement.setAttribute('data-look', '2'); else document.documentElement.removeAttribute('data-look');
      if (on) { sceneKey = ''; paintScene(); }
      try { localStorage.setItem('saker.look', on ? '2' : '1'); } catch (e) { /* private mode */ }
      el.classList.toggle('on', on); return;
    }
    if (el.id === 'export') return exportReport();
    if (el.id === 'signout') { if (S.remote) S.signOut(); state.user = null; session.set(null); state.details = false; state.open = null; V.close(); return render(); }
    if (el.id === 'si-lang') { state.lang = state.lang === 'ar' ? 'en' : 'ar'; store.set('lang', state.lang); return render(); }
    if (el.id === 'lang') { state.lang = state.lang === 'ar' ? 'en' : 'ar'; store.set('lang', state.lang); V.close(); return render(); }
    if (el.id === 'role-boss' || el.id === 'role-admin') { state.role = el.id === 'role-boss' ? 'boss' : 'admin'; store.set('role', state.role); V.close(); return render(); }
    if (el.dataset.firm) { state.open = state.open === el.dataset.firm ? null : el.dataset.firm; return render(); }
    if (el.dataset.open) openDoc(el.dataset.open, el.dataset.i, el.dataset.n, el.dataset.part);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && state.picker) { state.picker = false; render(); } });

  // on the database: the account decides the view (a Boss account never sees the Admin side or the build switch)
  function applyMe(m) {
    if (!m) return;
    if (m.role === 'boss') state.role = 'boss';
    if (m.lang && !store.get('lang', '')) state.lang = m.lang;
  }
  // on the database: wait to learn whether a session is already open (no sign-in flash when it is)
  if (S.remote) S.ready.then(m => { if (m) { applyMe(m); state.user = m.email; } render(); });
  else render();
  paintScene();                                                     // ready before any sign-in hands over
  window.__saker = { state, render, get ix() { fresh(); return ix; }, today };   // for inspection while we build
})();
