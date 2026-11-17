// صقر document panel: opens a contract, receipt or letter beside the list, scrolls to the
// anchored place and draws the highlight over it. The file itself is never modified.
// Two modes:
//   • one document (tabs when there are several), as before;
//   • side by side (spec.compare): what was owed (the contract clause) beside what came in (the bank
//     transfer[s]) under a summary strip — a payment proof is never shown without the clause it pays.
(function (root) {
  'use strict';
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  const cache = {};
  let panel, body, head, tabsEl, noteEl, stripEl, token = 0, onClose = null;

  function lib() {
    if (root.pdfjsLib) return Promise.resolve(root.pdfjsLib);
    return new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = PDFJS + 'pdf.min.js';
      s.onload = () => { root.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; ok(root.pdfjsLib); };
      s.onerror = fail;
      document.head.appendChild(s);
    });
  }
  // a file the Admin uploaded in this browser ('local:<doc id>', phase A) comes from the store; the rest by URL
  const load = path => (cache[path] = cache[path] || lib().then(p => (path.startsWith('local:') && root.SakerStore
    ? root.SakerStore.file(path).then(buf => p.getDocument({ data: new Uint8Array(buf) }).promise)
    : p.getDocument(path).promise)));

  function build() {
    panel = document.createElement('aside');
    panel.className = 'panel';
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = `
      <header class="panel-head">
        <div class="panel-titles"><div class="panel-title"></div><div class="panel-sub"></div></div>
        <button class="panel-close" type="button"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13"/></svg></button>
      </header>
      <div class="panel-strip" hidden></div>
      <div class="panel-note" hidden></div>
      <nav class="panel-tabs" hidden></nav>
      <div class="panel-body"></div>`;
    document.body.appendChild(panel);
    head = panel.querySelector('.panel-head');
    body = panel.querySelector('.panel-body');
    tabsEl = panel.querySelector('.panel-tabs');
    noteEl = panel.querySelector('.panel-note');
    stripEl = panel.querySelector('.panel-strip');
    panel.querySelector('.panel-close').addEventListener('click', close);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && panel.classList.contains('open')) close(); });
  }

  function close() {
    if (!panel) return;
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('panel-open', 'panel-wide');
    if (onClose) onClose();
  }

  // spec: { title, sub, closeLabel, loadingLabel, note: {label, text} | null,
  //         tabs: [{ label, path, anchor: {page, box} | null }], tab: 0,
  //         strip: [{ label, value, tone }] | null,
  //         compare: { left: {label, path, anchor}, right: [{label, path, anchor}], dir } | null }
  function open(spec, closeCb) {
    if (!panel) build();
    onClose = closeCb || null;
    const my = ++token;
    panel.querySelector('.panel-title').textContent = spec.title;
    panel.querySelector('.panel-sub').textContent = spec.sub || '';
    panel.querySelector('.panel-close').setAttribute('aria-label', spec.closeLabel);
    noteEl.hidden = !spec.note;
    if (spec.note) noteEl.innerHTML = `<span class="panel-note-label"></span><p></p>`,
      noteEl.querySelector('span').textContent = spec.note.label, noteEl.querySelector('p').textContent = spec.note.text;
    stripEl.hidden = !spec.strip;
    stripEl.innerHTML = '';
    if (spec.strip) {
      stripEl.dir = spec.dir || 'rtl';
      spec.strip.forEach(s => {
        const d = document.createElement('div');
        d.className = 'strip-item' + (s.tone ? ' t-' + s.tone : '');
        d.innerHTML = '<span class="strip-label"></span><span class="strip-value"></span>';
        d.firstChild.textContent = s.label; d.lastChild.textContent = s.value;
        stripEl.appendChild(d);
      });
    }
    const wide = !!spec.compare;
    panel.classList.toggle('wide', wide);
    document.body.classList.toggle('panel-wide', wide);
    tabsEl.innerHTML = '';
    tabsEl.hidden = wide || spec.tabs.length < 2;
    if (!wide) spec.tabs.forEach((t, k) => tabsEl.appendChild(tabButton(t.label, () => showSingle(spec, k))));
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('panel-open');
    if (wide) showCompare(spec, my); else showSingle(spec, spec.tab || 0);
  }

  function tabButton(label, onClick) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label; b.className = 'panel-tab';
    b.addEventListener('click', onClick);
    return b;
  }

  // one document. Switching from the side-by-side view is a fresh start (Ibrahim, 2026-11-12).
  function showSingle(spec, k) {
    const my = ++token;
    [...tabsEl.children].forEach((b, i) => b.classList.toggle('on', i === k));
    if (body.classList.contains('cmp-body')) { body.classList.remove('cmp-body'); body.innerHTML = ''; body._doc = null; }
    renderDoc(spec.tabs[k], body, body, () => my === token, spec.loadingLabel);
  }

  // side by side: the clause (first in the reading order) and the transfer(s) beside it.
  // Already side by side → the two columns stay, so each keeps its place (continuity); from the single view → fresh.
  function showCompare(spec, my) {
    const C = spec.compare;
    let grid = body.classList.contains('cmp-body') && body.querySelector(':scope > .cmp');
    if (!grid) {
      body.classList.add('cmp-body');
      body.innerHTML = ''; body._doc = null;
      grid = document.createElement('div');
      grid.className = 'cmp';
      for (let i = 0; i < 2; i++) {
        const c = document.createElement('section');
        c.className = 'cmp-col';
        c.innerHTML = '<header class="cmp-head"><span class="cmp-label"></span><nav class="cmp-tabs"></nav></header><div class="cmp-scroll"></div>';
        grid.appendChild(c);
      }
      body.appendChild(grid);
    }
    grid.dir = C.dir || 'rtl';
    const [L, R] = grid.children;
    L.querySelector('.cmp-label').textContent = C.left.label;
    R.querySelector('.cmp-label').textContent = C.rightLabel || '';
    const live = () => my === token;
    renderDoc(C.left, L.querySelector('.cmp-scroll'), L.querySelector('.cmp-scroll'), live, spec.loadingLabel);
    const rTabs = R.querySelector('.cmp-tabs');
    rTabs.innerHTML = '';
    let rk = 0;
    R.tok = (R.tok || 0) + 1;                             // the right column has its own tabs → its own render token
    const showRight = k => {
      rk = k;
      [...rTabs.children].forEach((b, i) => b.classList.toggle('on', i === k));
      const sc = R.querySelector('.cmp-scroll');
      const mine = ++R.tok;
      renderDoc(C.right[k], sc, sc, () => live() && R.tok === mine, spec.loadingLabel);
    };
    if (C.right.length > 1) C.right.forEach((t, k) => rTabs.appendChild(tabButton(t.label, () => showRight(k))));
    else R.querySelector('.cmp-label').textContent = C.right[0].label;
    showRight(rk);
  }

  // render one PDF into `host` (fitting its width) and bring the highlight into view.
  // Continuity (Ibrahim, 2026-11-12): if this same document is already drawn here at this width, nothing is
  // redrawn — the view moves from where the reader already is, only as much as the new highlight needs.
  async function renderDoc(t, host, scroller, isLive, loadingLabel) {
    // a page the system writes itself (a settlement voucher, 2026-11-14): shown as-is, never a file
    if (t.html) { host._doc = null; host.innerHTML = `<div class="doc-html">${t.html}</div>`; scroller.scrollTop = 0; return null; }
    const width = Math.max(200, Math.min(host.clientWidth - 32 - 28, 760));
    const memo = host._doc;
    if (memo && memo.path === t.path && Math.abs(memo.width - width) < 1 && host.contains(memo.wrap)) {
      focus(t.anchor, memo, scroller, false);
      return memo;
    }
    host._doc = null;
    host.innerHTML = `<div class="panel-loading">${loadingLabel}</div>`;
    const pdf = await load(t.path);
    if (!isLive()) return;
    const wrap = document.createElement('div');
    wrap.className = 'pages';
    wrap.dir = 'ltr';                                    // a document keeps its own geometry
    const dpr = Math.min(root.devicePixelRatio || 1, 2);
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      if (!isLive()) return;
      const vp1 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: width / vp1.width });
      const box = document.createElement('div');
      box.className = 'page';
      box.style.width = vp.width + 'px';
      box.style.height = vp.height + 'px';
      const cv = document.createElement('canvas');
      cv.width = Math.floor(vp.width * dpr); cv.height = Math.floor(vp.height * dpr);
      cv.style.width = vp.width + 'px'; cv.style.height = vp.height + 'px';
      box.appendChild(cv);
      wrap.appendChild(box);
      pages.push({ box, page, vp, cv });
    }
    host.innerHTML = '';
    host.appendChild(wrap);
    // the page boxes already have their final size: remember the document and go to the highlight now —
    // the pages paint in place, and a second click meanwhile moves from here instead of redrawing
    scroller.scrollTop = 0;
    const shown = host._doc = { path: t.path, width, pages, wrap, key: null };
    focus(t.anchor, shown, scroller, true);
    if (t.onLaidOut) t.onLaidOut(shown);                 // the page boxes exist: callers may draw over them now
    for (const p of pages) {
      await p.page.render({ canvasContext: p.cv.getContext('2d'), viewport: p.vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null }).promise;
      if (host._doc !== shown) return null;              // another document took this place: stop painting this one
    }
    return shown;
  }

  // Every click goes to its full place, exactly as before (Ibrahim, 2026-11-12):
  //   the contract (no anchor)  → the top of the contract;
  //   a clause / a transfer     → its page, the highlight about a third down the view.
  // The smart part is only what does NOT happen: the document is never redrawn, and the view does not move
  //   • when it is already at that place (a re-click without scrolling away), or
  //   • when the new highlight is on the page being looked at and already fully in view (just switch it).
  function focus(anchor, memo, scroller, fresh) {
    const key = anchor ? `${anchor.page}:${(anchor.box || []).join(',')}` : '';
    const prevPage = memo.key ? +memo.key.split(':')[0] : null;
    memo.wrap.querySelectorAll('.hl, .hl-mark').forEach(e => e.remove());
    memo.key = key;
    const go = to => {
      to = Math.max(0, Math.min(to, scroller.scrollHeight - scroller.clientHeight));
      if (Math.abs(scroller.scrollTop - to) < 4) return;                    // already there: nothing moves
      glide(scroller, to);
    };
    if (!anchor) { go(0); return; }                                         // the contract: from its top
    const p = memo.pages[anchor.page - 1];
    if (!p) return;
    const [x, y, w, h] = anchor.box || [0, 0, 1, 1];
    const W = p.vp.width, H = p.vp.height;
    let target = p.box;
    if (anchor.box) {
      const hl = document.createElement('div');
      hl.className = 'hl';
      Object.assign(hl.style, { left: x * W + 'px', top: y * H + 'px', width: w * W + 'px', height: h * H + 'px' });
      p.box.appendChild(hl);
      const mk = document.createElement('div');
      mk.className = 'hl-mark';
      Object.assign(mk.style, { top: y * H + 'px', height: h * H + 'px' });
      p.box.appendChild(mk);
      target = hl;
    }
    const view = scroller.getBoundingClientRect(), r = target.getBoundingClientRect();
    // the full place, as before: the highlight a third down the view (or the page's top)
    const pageTop = scroller.scrollTop + p.box.getBoundingClientRect().top - view.top;
    const place = pageTop + (anchor.box ? y * H - scroller.clientHeight * 0.3 : -16);
    // same page as the highlight just shown, and the new one already fully in view → just switch it
    const inView = r.top >= view.top && r.bottom <= view.bottom;
    if (!fresh && anchor.box && prevPage === anchor.page && inView) return;
    go(place);
  }

  // A calm glide instead of the browser's own smooth scroll (Ibrahim, 2026-11-12): eased in and out, its time
  // scaled to the distance (≈0.45 s short → 0.9 s long), the same on every browser. The reader stays in control:
  // a wheel, touch or click on the document stops it at once; a new click glides from wherever it is.
  // "Reduce motion" on the device → it goes straight there.
  const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);   // ease-in-out (cubic)
  function glide(el, to) {
    if (el._glide) el._glide.stop();
    const from = el.scrollTop, dist = to - from;
    if (Math.abs(dist) < 1) return;
    if (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.scrollTop = to; return; }
    const dur = Math.min(900, Math.max(450, 300 + Math.abs(dist) * 0.35));
    let t0 = null, raf = 0, done = false;
    const stop = () => {
      if (done) return; done = true; cancelAnimationFrame(raf); el._glide = null;
      ['wheel', 'touchstart', 'pointerdown'].forEach(ev => el.removeEventListener(ev, stop));
    };
    const step = now => {
      if (done) return;
      if (t0 === null) t0 = now;
      const k = Math.min(1, (now - t0) / dur);
      el.scrollTop = from + dist * ease(k);
      if (k < 1) raf = requestAnimationFrame(step); else stop();
    };
    ['wheel', 'touchstart', 'pointerdown'].forEach(ev => el.addEventListener(ev, stop, { passive: true }));
    el._glide = { stop, dur };
    raf = requestAnimationFrame(step);
  }

  // the same engine for the Admin's workspace (one viewer, Reuse-symmetry): render a document into any host;
  // `pageCount(buf)` = how many pages an uploaded file has — and the proof that it IS a readable PDF
  const paint = (t, host, isLive, loadingLabel) => renderDoc(t, host, host, isLive || (() => true), loadingLabel || '');
  const pageCount = buf => lib().then(p => p.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise)
    .then(d => { const n = d.numPages; d.destroy(); return n; });
  // one page of a document as an image (the report's clips, 2026-11-17): drawn `width` px wide; the file is never changed
  const raster = (path, n, width) => load(path).then(pdf => pdf.getPage(n)).then(page => {
    const vp1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: width / vp1.width });
    const cv = document.createElement('canvas');
    cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
    return page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise.then(() => cv);
  });
  root.SakerViewer = { open, close, glide, paint, focus, pageCount, raster };
})(window);
