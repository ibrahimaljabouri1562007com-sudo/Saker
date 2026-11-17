// صقر store — the DATABASE side (phase B5, 2026-11-17). The same method names as assets/store.js (the demo), so the
// screens do not know which one they talk to. Chosen by the backend switch: ?backend=sb (remembered) / ?backend=demo.
//   reads : ONE call — app_snapshot() — everything this person may see (the database's rules decide), kept in memory,
//           so S.data(), S.local, S.creditOf… stay instant and synchronous, exactly as before;
//   writes: one guarded database function per action (supabase/migrations/…_b3_functions.sql), then the snapshot is
//           reloaded and S.version moves (no merge code). A refusal comes back as an Error carrying the database's code
//           (SK002…SK007, 42501) and its words;
//   files : uploaded to the private vault as docs/<id>.pdf BEFORE they are registered; opened through 5-minute links.
// The demo store (store.js) stays untouched beside it: ?backend=demo brings it back, byte for byte as before.
(function (root) {
  'use strict';
  let pick = 'demo';
  try {
    const q = new URLSearchParams(location.search).get('backend');
    if (q === 'sb' || q === 'demo') localStorage.setItem('saker.backend', q);
    pick = localStorage.getItem('saker.backend') || 'demo';
  } catch (e) { /* private mode: demo */ }
  if (pick !== 'sb' || !root.supabase) return;                // the demo store keeps the stage

  const URL = 'https://ayrijizubulczzympslg.supabase.co';
  const KEY = 'sb_publishable_nh5rSbaoQrrL8NIHmCjMQQ_-vIz3p-l'; // public by design (a browser key); the database's rules protect the data
  const sb = root.supabase.createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'saker.auth' } });

  const TABLES = ['firms', 'documents', 'contracts', 'installments', 'anchors', 'notes', 'links', 'payments', 'allocations', 'vouchers', 'audit_log'];
  const empty = () => Object.fromEntries(TABLES.map(t => [t, []]));
  let raw = empty(), live = empty(), me = null, userId = null, version = 0;

  // ── reading ──
  function take(snap) {
    raw = empty();
    for (const t of TABLES) raw[t] = snap[t] || [];
    live = {};
    for (const t of TABLES) live[t] = raw[t].filter(r => !r.voided_at);
    me = snap.me || null;
    version++;
  }
  async function load() {
    const { data, error } = await sb.rpc('app_snapshot');
    if (error) throw fail(error);
    take(data || {});
    return me;
  }
  // a usable account = a role that opens a view ('none' = no access, set in the dashboard)
  const allowed = m => !!m && (m.role === 'admin' || m.role === 'boss');
  const fail = e => Object.assign(new Error(String((e && e.message) || e).replace(/^صقر:\s*/, '')), { code: e && e.code });

  // ── writing: one function, then the fresh snapshot ──
  async function call(fn, args) {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw fail(error);
    await load();
    return data;
  }
  const find = (t, id) => raw[t].find(r => r.id === id) || null;
  const round = box => (box ? box.map(v => Math.round(v * 10000) / 10000) : null);

  // ── files: the vault ──
  const memFiles = {};
  let tmpSeq = 0;
  const stage = buf => { const k = 'tmp' + (++tmpSeq); memFiles['local:' + k] = buf; return 'local:' + k; };
  async function sha256(buf) {
    const h = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // upload first (the database refuses to register a file that is not in the vault), then hand the function its card
  async function upload(f) {
    const id = crypto.randomUUID(), path = `docs/${id}.pdf`;
    const { error } = await sb.storage.from('documents').upload(path, new Blob([f.buf], { type: 'application/pdf' }),
      { contentType: 'application/pdf', upsert: false });
    if (error) throw fail(error);
    memFiles[path] = f.buf.slice(0);
    const card = { id, file_name: f.fileName, pages: f.pages, sha256: await sha256(f.buf) };
    if (f.page) card.page = f.page;
    if (f.box) card.box = round(f.box);
    return card;
  }
  async function file(path) {
    if (memFiles[path]) return memFiles[path].slice(0);
    if (!path.startsWith('docs/')) throw new Error('file missing: ' + path);
    const { data, error } = await sb.storage.from('documents').createSignedUrl(path, 300);   // 5 minutes
    if (error) throw fail(error);
    const res = await fetch(data.signedUrl);
    if (!res.ok) throw new Error('file ' + res.status + ': ' + path);
    memFiles[path] = await res.arrayBuffer();
    return memFiles[path].slice(0);
  }

  const partsOf = i => ({ amount_anchor_id: i.amount_anchor_id !== undefined ? i.amount_anchor_id : i.anchor_id,
                          date_anchor_id: i.date_anchor_id !== undefined ? i.date_anchor_id : i.anchor_id });
  const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

  const api = {
    remote: true,
    get version() { return version; },
    data: () => live,
    get local() { return raw; },                               // every row incl. voided (history, ledger) — all editable rows
    file,
    stage,
    ownsPath: p => p.startsWith('local:') || p.startsWith('docs/'),
    partsOf,
    setUser() {},
    who: u => (u && u === userId && me ? me.email : u),

    // ── who is signed in ──
    get me() { return me; },
    ready: (async () => {
      const { data } = await sb.auth.getSession();
      userId = data.session ? data.session.user.id : null;
      if (!userId) return null;
      try { const m = await load(); return allowed(m) ? m : null; } catch (e) { return null; }
    })(),
    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email: String(email).trim(), password });
      if (error) throw fail(error);
      userId = data.user.id;
      const m = await load();
      if (!allowed(m)) { await sb.auth.signOut(); userId = null; me = null; take({}); throw Object.assign(new Error('no access'), { code: 'norole' }); }
      return m;
    },
    async signOut() { await sb.auth.signOut(); userId = null; me = null; take({}); },

    // ── synchronous questions, answered from the snapshot (same as the demo store) ──
    firmByName: name => live.firms.find(f => same(f.name, name)) || null,
    refTaken: ref => !!String(ref || '').trim() && live.contracts.some(c => same(c.ref, ref)),
    bankRefTaken: (firmId, ref) => !!String(ref || '').trim() && live.payments.some(p => p.firm_id === firmId && same(p.bank_ref, ref)),
    owedOf(instId) {
      const i = live.installments.find(r => r.id === instId);
      return i.amount_cents - live.allocations.filter(a => a.installment_id === instId).reduce((s, a) => s + a.amount_cents, 0);
    },
    creditOf: firmId => root.SakerCalc.creditBalance(live, firmId),
    deposits: firmId => raw.payments.filter(p => p.kind === 'credit' && p.firm_id === firmId),
    vouchersOf: firmId => raw.vouchers.filter(v => v.firm_id === firmId),

    // ── the Admin's moves (each = one guarded function) ──
    async newContract({ firmName, ref, signedOn, fileName, buf, pages }) {
      const card = await upload({ fileName, buf, pages });
      const r = await call('create_contract', { p_firm_name: firmName, p_ref: ref, p_signed_on: signedOn || null, p_file: card });
      return find('contracts', r.contract_id);
    },
    async anchor(docId, page, box) {
      return find('anchors', await call('add_anchor', { p_document_id: docId, p_page: page, p_box: round(box) }));
    },
    async moveAnchor(id, page, box) { await call('move_anchor', { p_anchor_id: id, p_page: page, p_box: round(box) }); },
    async clearTotal(contractId) { await call('clear_total', { p_contract_id: contractId }); },
    async setTotal(contractId, cents, anchorId) { await call('set_total', { p_contract_id: contractId, p_total_cents: cents, p_anchor_id: anchorId }); },
    async addInstallment(contractId, { due_on, amount_cents, amount_anchor_id, date_anchor_id, note }) {
      return find('installments', await call('add_installment', { p_contract_id: contractId, p_due_on: due_on, p_amount_cents: amount_cents,
        p_amount_anchor_id: amount_anchor_id || null, p_date_anchor_id: date_anchor_id || null, p_note: note || null }));
    },
    async setParts(id, parts) { await call('set_installment_parts', { p_installment_id: id, p_parts: parts }); },
    async editValues(id, { due_on, amount_cents }) {
      await call('edit_installment_values', { p_installment_id: id, p_due_on: due_on || null, p_amount_cents: amount_cents || null });
    },
    async editInstallment(id, { due_on, amount_cents, note }) {
      await call('edit_installment', { p_installment_id: id, p_due_on: due_on, p_amount_cents: amount_cents, p_note: note || null });
    },
    async removeInstallment(id) { await call('remove_installment', { p_installment_id: id }); },
    async addReference(contractId, { fileName, buf, pages }) {
      const card = await upload({ fileName, buf, pages });
      return find('documents', await call('add_reference', { p_contract_id: contractId, p_file: card }));
    },
    async link(contractId, { document_id, anchor_id, target, installment_id }) {
      return find('links', await call('add_link', { p_contract_id: contractId, p_document_id: document_id, p_anchor_id: anchor_id,
        p_target: target, p_installment_id: installment_id || null }));
    },
    async removeLink(id) { await call('remove_link', { p_link_id: id }); },
    async addNote(contractId, { installment_id, text, anchor_id }) {
      return find('notes', await call('add_note', { p_contract_id: contractId, p_installment_id: installment_id || null, p_text: text, p_anchor_id: anchor_id || null }));
    },
    async editNote(id, text) { await call('edit_note', { p_note_id: id, p_text: text }); },
    async removeNote(id) { await call('remove_note', { p_note_id: id }); },
    async finish(contractId) {
      const r = await call('finish_contract', { p_contract_id: contractId });
      return { state: r.state, sum_cents: r.sum_cents, can_finish: true };
    },
    async recordPayment({ contractId, receivedOn, amountCents, bankRef, fileName, buf, pages, page, box, split }) {
      const card = await upload({ fileName, buf, pages, page, box });
      const id = await call('record_payment', { p_contract_id: contractId, p_received_on: receivedOn, p_amount_cents: amountCents,
        p_bank_ref: bankRef, p_receipt: card, p_split: split.filter(x => x.cents > 0).map(x => ({ installment_id: x.id, cents: x.cents })) });
      return find('payments', id);
    },
    async reversePayment(id) { await call('reverse_payment', { p_payment_id: id }); },
    async addCredit({ firmId, receivedOn, amountCents, bankRef, receipt, instruction }) {
      const r = await upload(receipt), ins = await upload(instruction);
      return find('payments', await call('add_credit', { p_firm_id: firmId, p_received_on: receivedOn, p_amount_cents: amountCents,
        p_bank_ref: bankRef, p_receipt: r, p_instruction: ins }));
    },
    async applyCredit({ contractId, amountCents, split }) {
      const r = await call('apply_credit', { p_contract_id: contractId, p_amount_cents: amountCents,
        p_split: split.filter(x => x.cents > 0).map(x => ({ installment_id: x.id, cents: x.cents })) });
      return find('vouchers', r.voucher_id);
    },
    async reverseApplication(voucherId) { return find('vouchers', (await call('reverse_application', { p_voucher_id: voucherId })).voucher_id); },
    async reverseDeposit(id) { await call('reverse_deposit', { p_payment_id: id }); },

    // the demo loader and the health check use these directly
    client: sb,
    reload: load,
    upload,
  };
  root.SakerStore = api;
})(window);
