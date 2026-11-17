// صقر calculator — the system's math. Pure functions over the stored facts; nothing here is
// ever stored. Spec: _guide/ROADMAP.md §1 "The month math" + _guide/DATA-SHAPE.md §2–3.
// Money is integer cents. Dates are 'YYYY-MM-DD' strings (they compare correctly as text).
(function (root) {
  'use strict';

  const pad = n => String(n).padStart(2, '0');
  const monthStart = (y, m) => `${y}-${pad(m)}-01`;
  const monthEnd = (y, m) => `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
  const dayNo = iso => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5;
  const daysBetween = (from, to) => Math.round(dayNo(to) - dayNo(from));

  // "today" in Baghdad, whatever the device's timezone.
  function todayBaghdad(now = new Date()) {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(now).reduce((o, x) => (o[x.type] = x.value, o), {});
    return `${p.year}-${p.month}-${p.day}`;
  }

  // Index the facts once so every lookup is direct.
  function index(data) {
    const by = (rows, key) => rows.reduce((m, r) => ((m[r[key]] = m[r[key]] || []).push(r), m), {});
    const ids = rows => Object.fromEntries(rows.map(r => [r.id, r]));
    return {
      data,
      firm: ids(data.firms), contract: ids(data.contracts), inst: ids(data.installments),
      payment: ids(data.payments), anchor: ids(data.anchors), document: ids(data.documents),
      contractsOf: by(data.contracts, 'firm_id'),
      instsOf: by(data.installments, 'contract_id'),
      allocsOf: by(data.allocations, 'installment_id'),
      notesOfContract: by(data.notes, 'contract_id'),
    };
  }

  // Money applied to one installment from payments received inside [from, to] (inclusive).
  // the day money PAID an installment: a transfer pays on the day it arrives; credit pays on the day it is applied
  // (2026-11-14) — so a September deposit used in November counts as November's money, never rewriting September
  const appliedOn = (ix, a) => a.applied_on || ix.payment[a.payment_id].received_on;
  function appliedBetween(ix, instId, from, to) {
    let sum = 0;
    for (const a of ix.allocsOf[instId] || []) {
      const d = appliedOn(ix, a);
      if ((!from || d >= from) && d <= to) sum += a.amount_cents;
    }
    return sum;
  }

  // The payments behind an installment up to a date, oldest first (what a status click shows).
  function paymentsOf(ix, instId, upTo) {
    return (ix.allocsOf[instId] || [])
      .map(a => ({ payment: ix.payment[a.payment_id], applied_cents: a.amount_cents, allocation: a, on: appliedOn(ix, a) }))
      .filter(x => x.on <= upTo)
      .sort((a, b) => a.on.localeCompare(b.on));
  }

  // One firm's rows for month (y, m), seen as of `asOf`.
  //  • "month" rows: installments due inside the month, at full amount.
  //  • "overdue" rows: installments due before the month, still owed when the month opened,
  //    carried at that outstanding amount (the opening balance).
  function firmRows(ix, firmId, y, m, asOf) {
    const start = monthStart(y, m), end = monthEnd(y, m);
    const dayBeforeStart = (() => { const d = new Date(Date.UTC(y, m - 1, 0)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; })();
    const rows = [];
    for (const c of ix.contractsOf[firmId] || []) {
      if (c.state !== 'active') continue; // unfinished contracts never reach the Boss
      const notes = ix.notesOfContract[c.id] || [];
      for (const i of ix.instsOf[c.id] || []) {
        let group, due, paid;
        if (i.due_on >= start && i.due_on <= end) {
          group = 'month';
          due = i.amount_cents;
          paid = appliedBetween(ix, i.id, null, asOf);              // early payments included
        } else if (i.due_on < start) {
          const before = appliedBetween(ix, i.id, null, minDate(dayBeforeStart, asOf));
          due = i.amount_cents - before;                            // opening balance
          if (due <= 0) continue;                                   // settled before the month
          group = 'overdue';
          paid = start <= asOf ? appliedBetween(ix, i.id, start, asOf) : 0;
        } else continue;                                            // due after the month
        const remaining = due - paid;
        const paidEver = appliedBetween(ix, i.id, null, asOf);
        const late = remaining > 0 && i.due_on < asOf;
        const dpd = late ? daysBetween(i.due_on, asOf) : 0;
        const status = statusOf(i, remaining, paidEver, asOf);
        rows.push({
          installment: i, contract: c, group, status,
          due_cents: due, paid_cents: paid, remaining_cents: remaining,
          original_cents: i.amount_cents, paid_ever_cents: paidEver,
          dpd, bucket: bucketOf(dpd),
          clickable_status: paidEver > 0,                           // clickable only if money came in
          notes: notes.filter(n => n.installment_id === i.id || (!n.installment_id)),
        });
      }
    }
    const order = r => (r.group === 'month' ? 0 : 1);
    rows.sort((a, b) => order(a) - order(b) || (a.group === 'month'
      ? a.installment.due_on.localeCompare(b.installment.due_on)
      : b.installment.due_on.localeCompare(a.installment.due_on)));  // overdue: oldest at the bottom
    return rows;
  }

  const minDate = (a, b) => (a < b ? a : b);

  // ── the firm's credit («رصيد تحت الحساب») ──
  // Its balance, from the live rows: every live deposit − everything live taken from deposits. Never stored, never typed.
  function creditBalance(data, firmId) {
    const deps = data.payments.filter(p => p.kind === 'credit' && p.firm_id === firmId && !p.voided_at);
    const ids = new Set(deps.map(p => p.id));
    const used = data.allocations.filter(a => ids.has(a.payment_id) && !a.voided_at).reduce((s, a) => s + a.amount_cents, 0);
    return deps.reduce((s, p) => s + p.amount_cents, 0) - used;
  }
  // What one deposit still holds (the source a use draws from, oldest deposit first).
  function depositLeft(data, dep) {
    return dep.amount_cents - data.allocations.filter(a => a.payment_id === dep.id && !a.voided_at).reduce((s, a) => s + a.amount_cents, 0);
  }
  // The ledger («كشف حساب الرصيد»): the credit's whole journey — deposits in, uses out (settlement vouchers), reversals
  // back in (reversal vouchers), a reversed deposit out — in time order, the balance after every line.
  // `deposits` include reversed ones (their history stays); `vouchers` are never deleted.
  // a stored moment ("2026-11-14T19:37:05", UTC) → its day in Baghdad, like every other date in صقر
  const dayOf = at => { const d = new Date(String(at).length <= 19 ? at + 'Z' : at); return isNaN(d) ? String(at).slice(0, 10) : todayBaghdad(d); };
  function creditLedger(deposits, vouchers) {
    const lines = [];
    for (const p of deposits) {
      lines.push({ on: p.received_on, at: p.created_at || '', kind: 'deposit', in_cents: p.amount_cents, out_cents: 0, deposit: p });
      if (p.voided_at) lines.push({ on: dayOf(p.voided_at), at: p.voided_at, kind: 'deposit-reversed', in_cents: 0, out_cents: p.amount_cents, deposit: p });
    }
    for (const v of vouchers) lines.push({ on: v.on, at: v.created_at || '', kind: v.kind, voucher: v,
      in_cents: v.kind === 'reversal' ? v.amount_cents : 0, out_cents: v.kind === 'settlement' ? v.amount_cents : 0 });
    // time order; within the same second, the order the books allow: a deposit, then its uses, then their reversals, and a
    // deposit can only be reversed once nothing of it is in use (so it comes last); vouchers by their number
    const rank = { deposit: 0, settlement: 1, reversal: 2, 'deposit-reversed': 3 };
    lines.sort((a, b) => a.on.localeCompare(b.on) || String(a.at).localeCompare(String(b.at)) || rank[a.kind] - rank[b.kind]
      || ((a.voucher && a.voucher.no) || 0) - ((b.voucher && b.voucher.no) || 0));
    let bal = 0;
    for (const l of lines) { bal += l.in_cents - l.out_cents; l.balance_cents = bal; }
    return { lines, balance_cents: bal };
  }

  // Cash application, oldest first (FIFO — the agreed rule): a payment fills the installments still owed in due-date
  // order; `open` = [{ id, due_on, owed_cents }]. Returns the split and what is left over (more than the contract owes).
  function fifo(open, amountCents) {
    let left = amountCents;
    const split = open.slice().sort((a, b) => a.due_on.localeCompare(b.due_on))
      .map(o => { const take = Math.max(0, Math.min(o.owed_cents, left)); left -= take; return { id: o.id, cents: take }; });
    return { split, leftover_cents: left };
  }

  // One installment's own state today, whatever month it is looked at from (the Admin's search lists whole
  // schedules): the same rules as the month view's rows — paid · partial · late from the day after · due today · not yet.
  // Ibrahim's rule (2026-11-17): before the due date «غير مستحق بعد» · on it «مستحق» · after it, until the last day of
  // ITS month, «مستحق · n يوم» · from the next month «متأخر · n يوم» (days always counted from the due date — the DPD
  // count, and the aging bucket kept for reports). Part paid: «مسدد جزئياً» only up to the due date; after it the row
  // follows the same steps and the paid part shows in the amount. One function for the month rows AND one instalment.
  function statusOf(i, remaining, paidEver, asOf) {
    if (remaining <= 0) return 'paid';                                                   // مسدد
    if (i.due_on < asOf) {
      const own = monthEnd(+i.due_on.slice(0, 4), +i.due_on.slice(5, 7));
      return asOf > own ? 'overdue' : 'due';                                             // متأخر · n  /  مستحق · n
    }
    if (paidEver > 0) return 'partial';                                                  // مسدد جزئياً (not past its date)
    return i.due_on === asOf ? 'today' : 'current';                                      // مستحق  /  غير مستحق بعد
  }
  function instStatus(ix, i, today) {
    const paid = appliedBetween(ix, i.id, null, today);
    const remaining = i.amount_cents - paid;
    const late = remaining > 0 && i.due_on < today;
    const dpd = late ? daysBetween(i.due_on, today) : 0;
    const status = statusOf(i, remaining, paid, today);
    return { status, dpd, bucket: bucketOf(dpd), paid_cents: paid, remaining_cents: Math.max(0, remaining) };
  }
  // the aging buckets: 0 = not late · 1 = 1–30 days · 2 = 31–60 · 3 = 61–90 · 4 = 90+
  const bucketOf = dpd => (dpd <= 0 ? 0 : dpd <= 30 ? 1 : dpd <= 60 ? 2 : dpd <= 90 ? 3 : 4);
  // a firm shows its worst row; a partly paid row that is late counts as late here, so a firm far behind never
  // looks calm in the firm list just because it paid a little (its own row still reads «مسدد جزئياً · n يوم»)
  // a firm shows its worst row: متأخر > مستحق · n > مستحق > مسدد جزئياً > غير مستحق بعد > مسدد
  const RANK = { overdue: 6, due: 5, today: 4, partial: 3, current: 2, paid: 1 };
  const firmRank = r => r.status;

  // The whole month: the three words + the firms (Level 2), ready to render.
  function month(ix, y, m, today) {
    const end = monthEnd(y, m);
    // One clock — today — for every month (Ibrahim, 2026-11-13; the collections practice): the month picked only chooses
    // WHICH installments are shown (that month's + the arrears it opened with); status and days late are always counted
    // to today, so one installment reads the same in every month. A month-end snapshot is a separate, labelled report.
    const asOf = today;
    const firms = [];
    for (const f of ix.data.firms) {
      const rows = firmRows(ix, f.id, y, m, asOf);
      if (!rows.length) continue;                                   // nothing due this month -> not listed
      const sum = k => rows.reduce((s, r) => s + r[k], 0);
      const remaining = sum('remaining_cents');
      let status = 'paid';
      for (const r of rows) if (r.remaining_cents > 0 && RANK[firmRank(r)] > RANK[status]) status = firmRank(r); // worst row wins
      const maxDpd = Math.max(0, ...rows.filter(r => r.remaining_cents > 0).map(r => r.dpd));
      firms.push({
        firm: f, rows, status,
        due_cents: sum('due_cents'), paid_cents: sum('paid_cents'), remaining_cents: remaining,
        max_dpd: maxDpd, bucket: bucketOf(maxDpd),
      });
    }
    firms.sort((a, b) => b.remaining_cents - a.remaining_cents || b.max_dpd - a.max_dpd ||
      a.firm.name.localeCompare(b.firm.name));
    const total = k => firms.reduce((s, f) => s + f[k], 0);
    return { year: y, month: m, asOf, firms,
      due_cents: total('due_cents'), paid_cents: total('paid_cents'), remaining_cents: total('remaining_cents') };
  }

  // The contract gate (Ibrahim, 2026-11-12): the installments must add up to the total written in the contract.
  //   empty    → no installment yet: nothing to finish
  //   no-total → the total was not set: finishing means "the contract states no total" → total = the sum
  //   match    → Σ installments = total: may finish
  //   short / over → a gap: an Admin mistake to fix, or a documented reason (flow designed later)
  function scheduleCheck(installments, totalCents) {
    const live = installments.filter(i => !i.voided_at);
    const sum = live.reduce((s, i) => s + i.amount_cents, 0);
    const hasTotal = Number.isInteger(totalCents) && totalCents > 0;
    const gap = hasTotal ? totalCents - sum : null;               // > 0 short · < 0 over
    const state = !live.length ? 'empty' : !hasTotal ? 'no-total' : gap === 0 ? 'match' : gap > 0 ? 'short' : 'over';
    return { count: live.length, sum_cents: sum, total_cents: hasTotal ? totalCents : null, gap_cents: gap, state,
      can_finish: state === 'match' || state === 'no-total' };
  }

  const api = { index, month, firmRows, paymentsOf, scheduleCheck, todayBaghdad, monthStart, monthEnd, daysBetween, bucketOf, instStatus, fifo, creditBalance, depositLeft, creditLedger };
  root.SakerCalc = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
