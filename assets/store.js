// صقر store — the fake fridge's write side (Phase A). The demo facts (data/demo.js) stay untouched;
// what the Admin adds lives beside them in this browser: records in localStorage, contract files in
// IndexedDB. data() hands the screens ONE merged set with the exact DATA-SHAPE fields, so in phase B
// this module is the single swap (→ Supabase tables + the private bucket).
// Rules kept here: nothing is ever hard-deleted (a removed row gets `voided_at`), and every insert and
// edit is written to audit_log (who · when · table · row · before · after).
(function (root) {
  'use strict';
  const KEY = 'saker.local.v1';
  const TABLES = ['firms', 'documents', 'contracts', 'installments', 'anchors', 'notes', 'links', 'payments', 'allocations', 'vouchers', 'audit_log'];
  const blank = () => Object.fromEntries(TABLES.map(t => [t, []]).concat([['seq', 0], ['vseq', 0]]));

  let L = blank();
  try { L = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || 'null') || {}); } catch (e) { /* private mode: memory only */ }
  // B5 (2026-11-17): vouchers carry the database's names — issued_on, balance_before_cents / balance_after_cents
  for (const v of L.vouchers) {
    if (v.on !== undefined && v.issued_on === undefined) { v.issued_on = v.on; delete v.on; }
    if (v.balance_before !== undefined && v.balance_before_cents === undefined) { v.balance_before_cents = v.balance_before; delete v.balance_before; }
    if (v.balance_after !== undefined && v.balance_after_cents === undefined) { v.balance_after_cents = v.balance_after; delete v.balance_after; }
  }
  let version = 0, merged = null;
  const save = () => { version++; merged = null; try { localStorage.setItem(KEY, JSON.stringify(L)); } catch (e) { /* quota / private */ } };

  const now = () => new Date().toISOString().slice(0, 19);
  const clone = o => (o ? JSON.parse(JSON.stringify(o)) : null);
  const nextId = p => `x${p}${++L.seq}`;                     // local ids never collide with the demo's (f1, c1 …)
  let user = 'admin@demo.saker';

  function log(table, row, action, before) {
    L.audit_log.push({ id: nextId('g'), at: now(), user, table, row_id: row.id, action, before: clone(before), after: clone(row) });
  }
  function insert(table, fields) {
    const row = { id: nextId(table[0]), ...fields, created_at: now(), created_by: user };
    L[table].push(row); log(table, row, 'insert', null);
    return row;
  }
  function update(table, id, fields) {
    const row = L[table].find(r => r.id === id);
    if (!row) throw new Error(`${table} ${id}: only the Admin's own rows are editable in the demo`);
    const before = clone(row);
    Object.assign(row, fields, { updated_at: now(), updated_by: user });
    log(table, row, fields.voided_at ? 'void' : 'update', before);
    return row;
  }

  // ── the merged read side: demo facts + the Admin's rows; removed (voided) rows never reach the screens ──
  function data() {
    if (merged) return merged;
    const D = root.SAKER_DATA, out = {};
    for (const k of Object.keys(D)) out[k] = D[k].slice();
    for (const t of TABLES) out[t] = (out[t] || []).concat(L[t].filter(r => !r.voided_at));
    return (merged = out);
  }

  // ── files: the contract itself, kept as uploaded (never modified); its sha256 proves it ──
  const DB = 'saker-files';
  const idb = () => new Promise((ok, fail) => {
    const rq = indexedDB.open(DB, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore('files');
    rq.onsuccess = () => ok(rq.result); rq.onerror = () => fail(rq.error);
  });
  const tx = (mode, fn) => idb().then(db => new Promise((ok, fail) => {
    const t = db.transaction('files', mode), st = t.objectStore('files');
    const rq = fn(st);
    t.oncomplete = () => ok(rq && rq.result); t.onerror = () => fail(t.error);
  }));
  const memFiles = {};                                      // fallback when IndexedDB is unavailable
  async function putFile(key, buf) { memFiles[key] = buf; try { await tx('readwrite', st => st.put(buf, key)); } catch (e) { /* memory only */ } }
  async function file(path) {                               // 'local:<doc id>' → ArrayBuffer (a fresh copy each time)
    const key = path.replace(/^local:/, '');
    let buf = memFiles[key];
    if (!buf) { try { buf = await tx('readonly', st => st.get(key)); } catch (e) { buf = null; } }
    if (!buf) throw new Error('file missing: ' + path);
    memFiles[key] = buf;
    return buf.slice(0);
  }
  let tmpSeq = 0;                                          // a file being looked at before it is saved (the receipt being boxed)
  const stage = buf => { const k = 'tmp' + (++tmpSeq); memFiles[k] = buf; return 'local:' + k; };
  async function sha256(buf) {
    try { const h = await crypto.subtle.digest('SHA-256', buf); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join(''); }
    catch (e) { return null; }                              // file:// or an old browser: proven again on upload in phase B
  }

  // ── the Admin's moves (slice 1: a contract from its file to "finished") ──
  const api = {
    get version() { return version; },
    data,
    file,
    ownsPath: p => p.startsWith('local:'),                 // the files this store serves (the rest come by URL)
    local: L,                                               // read-only use: the Admin's own rows (drafts, history)
    setUser(u) { if (u) user = u; },

    firmByName(name) {
      const n = name.trim().toLowerCase();
      return data().firms.find(f => f.name.trim().toLowerCase() === n) || null;
    },
    refTaken(ref) {
      const r = ref.trim().toLowerCase();
      return data().contracts.some(c => c.ref.trim().toLowerCase() === r);
    },

    // 1 + 2: firm (picked or new) → contract file + reference. Opens as a draft (invisible to the Boss).
    async newContract({ firmName, ref, signedOn, fileName, buf, pages }) {
      let firm = api.firmByName(firmName);
      if (!firm) firm = insert('firms', { name: firmName.trim(), contact: '' });
      const docId = nextId('d');
      await putFile(docId, buf);
      const hash = await sha256(buf);
      const doc = { id: docId, firm_id: firm.id, contract_id: null, kind: 'contract', file_path: `local:${docId}`,
        file_name: fileName, pages, sha256: hash, created_at: now(), created_by: user };
      L.documents.push(doc); log('documents', doc, 'insert', null);
      const c = insert('contracts', { firm_id: firm.id, ref: ref.trim(), signed_on: signedOn || null, total_cents: null,
        total_anchor_id: null, total_source: null, document_id: doc.id, state: 'draft', activated_at: null });
      doc.contract_id = c.id;
      save();
      return c;
    },

    // 4: a highlighted clause → its anchor (the box is data over the file, the file is never touched)
    anchor(docId, page, box) {
      const a = insert('anchors', { document_id: docId, page, box: box.map(v => Math.round(v * 10000) / 10000) });
      save(); return a;
    },
    // the total removed (a wrong clause marked as the total): the contract has no total again; its box stays in the record
    clearTotal(contractId) {
      update('contracts', contractId, { total_cents: null, total_anchor_id: null, total_source: null });
      save();
    },
    setTotal(contractId, cents, anchorId) {
      update('contracts', contractId, { total_cents: cents, total_anchor_id: anchorId, total_source: 'contract' });
      save();
    },
    // an installment's amount and date may sit in different places of the contract: each part has its own box
    // (the same box when one box shows both; null = not highlighted yet). anchor_id = the main box (amount first).
    addInstallment(contractId, { due_on, amount_cents, amount_anchor_id, date_anchor_id, note }) {
      const anchor_id = amount_anchor_id || date_anchor_id || null;
      const i = insert('installments', { contract_id: contractId, seq: 0, due_on, amount_cents, anchor_id,
        amount_anchor_id: amount_anchor_id || null, date_anchor_id: date_anchor_id || null });
      if (note) insert('notes', { contract_id: contractId, installment_id: i.id, text: note, anchor_id });
      renumber(contractId); save(); return i;
    },
    setParts(id, parts) {                                    // { amount_anchor_id?, date_anchor_id? }
      const i = L.installments.find(r => r.id === id), next = { ...partsOf(i), ...parts };
      const fields = { amount_anchor_id: next.amount_anchor_id || null, date_anchor_id: next.date_anchor_id || null };
      fields.anchor_id = fields.amount_anchor_id || fields.date_anchor_id || null;
      if (fields.amount_anchor_id !== i.amount_anchor_id || fields.date_anchor_id !== i.date_anchor_id) update('installments', id, fields);
      save();
    },
    // the values alone (a reference that moves a date, e.g. an amendment) — the note is left as it is
    editValues(id, { due_on, amount_cents }) {
      const i = L.installments.find(r => r.id === id), f = {};
      if (due_on && due_on !== i.due_on) f.due_on = due_on;
      if (amount_cents && amount_cents !== i.amount_cents) f.amount_cents = amount_cents;
      if (Object.keys(f).length) { update('installments', id, f); renumber(i.contract_id); save(); }
    },
    editInstallment(id, { due_on, amount_cents, note }) {
      const i = L.installments.find(r => r.id === id);
      if (i.due_on !== due_on || i.amount_cents !== amount_cents) update('installments', id, { due_on, amount_cents });
      // the installment's own note (sourced from the contract) — a note placed from a reference is left alone
      const docId = (L.contracts.find(c => c.id === i.contract_id) || {}).document_id;
      const onContract = x => { const a = x.anchor_id && L.anchors.find(r => r.id === x.anchor_id); return !a || a.document_id === docId; };
      const n = L.notes.find(x => x.installment_id === id && !x.voided_at && onContract(x));
      if (n && note && n.text !== note) update('notes', n.id, { text: note });
      else if (n && !note) update('notes', n.id, { voided_at: now() });
      else if (!n && note) insert('notes', { contract_id: i.contract_id, installment_id: id, text: note, anchor_id: i.anchor_id });
      renumber(i.contract_id); save();
    },
    removeInstallment(id) {                                 // kept in the record, out of the schedule
      const i = L.installments.find(r => r.id === id);
      update('installments', id, { voided_at: now() });
      L.notes.filter(x => x.installment_id === id && !x.voided_at).forEach(x => update('notes', x.id, { voided_at: now() }));
      renumber(i.contract_id); save();
    },
    // ── references: another file beside the contract (an amendment, a letter, an email…) ──
    // Its place is chosen on upload — where the Boss meets it: the contract · an installment's amount or date ·
    // the notes. Every box drawn on it is a link (document + box + place); a note box carries the note's text.
    async addReference(contractId, { fileName, buf, pages, target, installment_id }) {
      const c = data().contracts.find(r => r.id === contractId);       // a demo contract may take references too
      const docId = nextId('d');
      await putFile(docId, buf);
      const hash = await sha256(buf);
      const doc = { id: docId, firm_id: c.firm_id, contract_id: c.id, kind: 'outside', file_path: `local:${docId}`,
        file_name: fileName, pages, sha256: hash, ref_target: target, ref_installment_id: installment_id || null,
        created_at: now(), created_by: user };
      L.documents.push(doc); log('documents', doc, 'insert', null);
      save(); return doc;
    },
    link(contractId, { document_id, anchor_id, target, installment_id }) {
      const l = insert('links', { contract_id: contractId, document_id, anchor_id, target, installment_id: installment_id || null });
      save(); return l;
    },
    removeLink(id) { update('links', id, { voided_at: now() }); save(); },
    addNote(contractId, { installment_id, text, anchor_id }) {
      const n = insert('notes', { contract_id: contractId, installment_id: installment_id || null, text, anchor_id });
      save(); return n;
    },
    editNote(id, text) { const n = L.notes.find(r => r.id === id); if (n.text !== text) { update('notes', id, { text }); save(); } },
    removeNote(id) { update('notes', id, { voided_at: now() }); save(); },
    // a box drawn in the wrong place, redrawn by the Admin: same anchor, new place (before → after in audit_log)
    moveAnchor(id, page, box) { update('anchors', id, { page, box: box.map(v => Math.round(v * 10000) / 10000) }); save(); },

    // ── payments (cash application, the standard): one transfer = one record = one receipt with its amount boxed;
    //    split across the contract's installments (oldest first by default, the Admin may change it). Corrections are
    //    REVERSALS: a wrong payment and its split get `voided_at` (kept, logged) and the installments owe again. ──
    owedOf(instId) {                                         // what an installment still owes, every live payment counted
      const d = data(), i = d.installments.find(r => r.id === instId);
      return i.amount_cents - d.allocations.filter(a => a.installment_id === instId).reduce((s, a) => s + a.amount_cents, 0);
    },
    bankRefTaken(firmId, ref) {
      const r = String(ref || '').trim().toLowerCase();
      return !!r && data().payments.some(p => p.firm_id === firmId && String(p.bank_ref || '').trim().toLowerCase() === r);
    },
    stage,
    async recordPayment({ contractId, receivedOn, amountCents, bankRef, fileName, buf, pages, page, box, split }) {
      const d = data(), c = d.contracts.find(r => r.id === contractId);
      if (!c || c.state !== 'active') throw new Error('payments: finished contracts only');
      const live = split.filter(x => x.cents > 0);
      if (!live.length || live.reduce((s, x) => s + x.cents, 0) !== amountCents) throw new Error('payments: split ≠ amount');
      for (const x of live) if (x.cents > api.owedOf(x.id)) throw new Error('payments: more than the installment owes');
      if (api.bankRefTaken(c.firm_id, bankRef)) throw new Error('payments: bank reference already recorded');
      const docId = nextId('d');
      await putFile(docId, buf);
      const hash = await sha256(buf);
      const doc = { id: docId, firm_id: c.firm_id, contract_id: c.id, kind: 'receipt', file_path: `local:${docId}`,
        file_name: fileName, pages, sha256: hash, created_at: now(), created_by: user };
      L.documents.push(doc); log('documents', doc, 'insert', null);
      const a = insert('anchors', { document_id: docId, page, box: box.map(v => Math.round(v * 10000) / 10000) });
      const p = insert('payments', { kind: 'transfer', firm_id: c.firm_id, contract_id: c.id, received_on: receivedOn, amount_cents: amountCents,
        bank_ref: bankRef.trim(), proof_document_id: docId, proof_anchor_id: a.id });
      for (const x of live) insert('allocations', { payment_id: p.id, installment_id: x.id, amount_cents: x.cents, applied_on: receivedOn });
      save(); return p;
    },
    reversePayment(id) {
      update('payments', id, { voided_at: now() });
      L.allocations.filter(x => x.payment_id === id && !x.voided_at).forEach(x => update('allocations', x.id, { voided_at: now() }));
      save();
    },

    // ── the firm's credit («رصيد تحت الحساب») — deposit (money + the firm's instruction), use (a numbered settlement
    //    voucher), reversal (a numbered reversal voucher). The balance is always calculated from the rows. ──
    creditOf(firmId) { return root.SakerCalc.creditBalance(data(), firmId); },
    deposits(firmId) {                                       // every deposit, reversed ones too (the ledger keeps their story)
      return (root.SAKER_DATA.payments || []).filter(p => p.kind === 'credit' && p.firm_id === firmId)
        .concat(L.payments.filter(p => p.kind === 'credit' && p.firm_id === firmId));
    },
    vouchersOf(firmId) { return L.vouchers.filter(v => v.firm_id === firmId); },
    async addCredit({ firmId, receivedOn, amountCents, bankRef, receipt, instruction }) {
      if (api.bankRefTaken(firmId, bankRef)) throw new Error('credit: bank reference already recorded');
      const keep = async (f, kind) => {
        const docId = nextId('d');
        await putFile(docId, f.buf);
        const doc = { id: docId, firm_id: firmId, contract_id: null, kind, file_path: `local:${docId}`, file_name: f.fileName,
          pages: f.pages, sha256: await sha256(f.buf), created_at: now(), created_by: user };
        L.documents.push(doc); log('documents', doc, 'insert', null);
        const a = insert('anchors', { document_id: docId, page: f.page, box: f.box.map(v => Math.round(v * 10000) / 10000) });
        return { docId, anchorId: a.id };
      };
      const r = await keep(receipt, 'receipt'), ins = await keep(instruction, 'instruction');
      const p = insert('payments', { kind: 'credit', firm_id: firmId, contract_id: null, received_on: receivedOn, amount_cents: amountCents,
        bank_ref: bankRef.trim(), proof_document_id: r.docId, proof_anchor_id: r.anchorId,
        instruction_document_id: ins.docId, instruction_anchor_id: ins.anchorId });
      save(); return p;
    },
    // a use: TODAY, drawn from the oldest deposit first; the system writes the settlement voucher (never typed)
    applyCredit({ contractId, amountCents, split }) {
      const C = root.SakerCalc, d = data(), c = d.contracts.find(r => r.id === contractId), on = C.todayBaghdad();
      if (!c || c.state !== 'active') throw new Error('credit: finished contracts only');
      const live = split.filter(x => x.cents > 0), before = C.creditBalance(d, c.firm_id);
      if (!live.length || live.reduce((s, x) => s + x.cents, 0) !== amountCents) throw new Error('credit: split ≠ amount');
      if (amountCents > before) throw new Error('credit: more than the credit holds');
      for (const x of live) if (x.cents > api.owedOf(x.id)) throw new Error('credit: more than the installment owes');
      const deps = d.payments.filter(p => p.kind === 'credit' && p.firm_id === c.firm_id)
        .sort((a, b) => a.received_on.localeCompare(b.received_on)).map(p => ({ p, left: C.depositLeft(d, p) }));
      const lines = [];
      for (const x of live) {
        let need = x.cents;
        for (const dp of deps) { if (!need) break; const take = Math.min(dp.left, need); if (take > 0) { lines.push({ installment_id: x.id, payment_id: dp.p.id, cents: take }); dp.left -= take; need -= take; } }
        if (need) throw new Error('credit: deposits do not cover the split');
      }
      const v = insert('vouchers', { no: ++L.vseq, kind: 'settlement', firm_id: c.firm_id, contract_id: c.id, issued_on: on, amount_cents: amountCents,
        lines, balance_before_cents: before, balance_after_cents: before - amountCents, reverses: null, reversed_by: null });
      for (const l of lines) insert('allocations', { payment_id: l.payment_id, installment_id: l.installment_id, amount_cents: l.cents, applied_on: on, voucher_id: v.id });
      save(); return v;
    },
    reverseApplication(voucherId) {                          // the money goes back to the credit; a numbered reversal voucher says so
      const v = L.vouchers.find(r => r.id === voucherId);
      if (!v || v.kind !== 'settlement' || v.reversed_by) throw new Error('credit: nothing to reverse');
      const before = root.SakerCalc.creditBalance(data(), v.firm_id);
      L.allocations.filter(a => a.voucher_id === v.id && !a.voided_at).forEach(a => update('allocations', a.id, { voided_at: now() }));
      const r = insert('vouchers', { no: ++L.vseq, kind: 'reversal', firm_id: v.firm_id, contract_id: v.contract_id, issued_on: root.SakerCalc.todayBaghdad(),
        amount_cents: v.amount_cents, lines: v.lines, balance_before_cents: before, balance_after_cents: before + v.amount_cents, reverses: v.id, reversed_by: null });
      update('vouchers', v.id, { reversed_by: r.id });
      save(); return r;
    },
    reverseDeposit(id) {                                     // only while none of it is used
      const p = L.payments.find(r => r.id === id);
      if (!p || p.kind !== 'credit' || root.SakerCalc.depositLeft(data(), p) !== p.amount_cents) throw new Error('credit: deposit in use');
      update('payments', id, { voided_at: now() }); save();
    },

    // the gate: only when calc.scheduleCheck says so (match, or "the contract states no total" → total = the sum)
    finish(contractId) {
      const c = L.contracts.find(r => r.id === contractId);
      const chk = root.SakerCalc.scheduleCheck(L.installments.filter(i => i.contract_id === contractId), c.total_cents);
      if (!chk.can_finish) throw new Error('gate: ' + chk.state);
      const fields = { state: 'active', activated_at: now() };
      if (chk.state === 'no-total') Object.assign(fields, { total_cents: chk.sum_cents, total_source: 'sum' });
      update('contracts', contractId, fields);
      save(); return chk;
    },
  };
  // the two boxes of an installment (rows from before the split carry one anchor_id for both)
  function partsOf(i) {
    return { amount_anchor_id: i.amount_anchor_id !== undefined ? i.amount_anchor_id : i.anchor_id,
             date_anchor_id: i.date_anchor_id !== undefined ? i.date_anchor_id : i.anchor_id };
  }
  api.partsOf = partsOf;
  // installments are numbered by their due date (1 of n …), recomputed after every change
  function renumber(contractId) {
    L.installments.filter(i => i.contract_id === contractId && !i.voided_at)
      .sort((a, b) => a.due_on.localeCompare(b.due_on) || a.created_at.localeCompare(b.created_at))
      .forEach((i, k) => { i.seq = k + 1; });
  }

  root.SakerStore = api;
})(window);
