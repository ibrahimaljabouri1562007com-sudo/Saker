// Golden tests for the صقر calculator. Run: node tests/calc.test.js
// Each case is a hand-checked answer from the thinking sessions; the calculator must match it.
const assert = require('assert');
const C = require('../assets/calc.js');
const demo = require('../data/demo.js');

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('  ✓ ' + name); }
const usd = n => n * 100;

// A tiny fact builder: firms[{name, contracts:[{schedule:[[due, usd]], payments:[[date, usd, [[instNo, usd]]]]}]}]
function facts(firms) {
  const D = { firms: [], contracts: [], installments: [], payments: [], allocations: [], notes: [], anchors: [], documents: [] };
  let n = 0; const id = p => p + (++n);
  for (const f of firms) {
    const fid = id('f'); D.firms.push({ id: fid, name: f.name });
    for (const c of f.contracts) {
      const cid = id('c'); D.contracts.push({ id: cid, firm_id: fid, ref: cid, state: c.state || 'active' });
      const insts = c.schedule.map(([due, a], k) => {
        const i = { id: id('i'), contract_id: cid, seq: k + 1, due_on: due, amount_cents: usd(a) };
        D.installments.push(i); return i;
      });
      for (const [date, a, allocs] of c.payments || []) {
        const pid = id('p'); D.payments.push({ id: pid, firm_id: fid, contract_id: cid, received_on: date, amount_cents: usd(a) });
        for (const [no, part] of allocs) D.allocations.push({ id: id('l'), payment_id: pid, installment_id: insts[no - 1].id, amount_cents: usd(part) });
      }
    }
  }
  return C.index(D);
}

console.log('صقر calculator — golden tests');

test("Ibrahim's example: Firm X 4 contracts + Firm Y 3 of 7 in November = 100,000", () => {
  const nov = (d, a) => [[`2026-11-${String(d).padStart(2, '0')}`, a]];
  const ix = facts([
    { name: 'X', contracts: [{ schedule: nov(10, 10000) }, { schedule: nov(12, 15000) }, { schedule: nov(20, 5000) }, { schedule: nov(25, 20000) }] },
    { name: 'Y', contracts: [{ schedule: nov(5, 8000) }, { schedule: nov(18, 12000) }, { schedule: nov(30, 30000) },
      { schedule: [['2026-12-01', 9000]] }, { schedule: [['2027-01-01', 9000]] }, { schedule: [['2027-02-01', 9000]] }, { schedule: [['2026-12-15', 9000]] }] },
  ]);
  const m = C.month(ix, 2026, 11, '2026-11-01');
  assert.strictEqual(m.firms.find(f => f.firm.name === 'X').due_cents, usd(50000));
  assert.strictEqual(m.firms.find(f => f.firm.name === 'Y').due_cents, usd(50000));
  assert.strictEqual(m.due_cents, usd(100000));
});

test('Worked example (Firm A, Nov): Sep + Oct paid in Nov → 60,000 / 30,000 / 30,000', () => {
  const ix = facts([{ name: 'A', contracts: [{
    schedule: [['2026-09-10', 20000], ['2026-10-10', 20000], ['2026-11-10', 20000], ['2026-12-10', 20000]],
    payments: [['2026-11-03', 20000, [[1, 20000]]], ['2026-11-04', 10000, [[2, 10000]]]] }] }]);
  const m = C.month(ix, 2026, 11, '2026-11-30');
  assert.deepStrictEqual([m.due_cents, m.paid_cents, m.remaining_cents], [usd(60000), usd(30000), usd(30000)]);
});

test('Carry-forward uses the outstanding balance, not the original amount', () => {
  const ix = facts([{ name: 'A', contracts: [{ schedule: [['2026-10-10', 20000]], payments: [['2026-10-20', 10000, [[1, 10000]]]] }] }]);
  const m = C.month(ix, 2026, 11, '2026-11-05');
  const r = m.firms[0].rows[0];
  assert.strictEqual(r.group, 'overdue');
  assert.strictEqual(r.due_cents, usd(10000));
  assert.strictEqual(r.original_cents, usd(20000));
  assert.strictEqual(r.status, 'overdue');                       // the standard: still owed after its date = late, part paid or not
  assert.strictEqual(r.dpd, 26);
  assert.strictEqual(r.clickable_status, true);
  assert.strictEqual(m.firms[0].status, 'overdue');               // …but the firm counts it as late
});

test('One clock (today) for every month: a November payment shows in October too (Ibrahim, 2026-11-13)', () => {
  const ix = facts([{ name: 'A', contracts: [{ schedule: [['2026-10-10', 20000]], payments: [['2026-11-03', 20000, [[1, 20000]]]] }] }]);
  const oct = C.month(ix, 2026, 10, '2026-11-08');
  assert.strictEqual(oct.asOf, '2026-11-08');
  assert.deepStrictEqual([oct.due_cents, oct.paid_cents, oct.remaining_cents], [usd(20000), usd(20000), 0]);
  assert.strictEqual(oct.firms[0].rows[0].status, 'paid');
  const nov = C.month(ix, 2026, 11, '2026-11-08');
  assert.deepStrictEqual([nov.due_cents, nov.paid_cents, nov.remaining_cents], [usd(20000), usd(20000), 0]);
});

test("Ibrahim's case: due 15 Oct, unpaid, today 13 Nov → «متأخر · 29» in October AND in November", () => {
  const ix = facts([{ name: 'A', contracts: [{ schedule: [['2026-10-15', 12000]] }] }]);
  const oct = C.month(ix, 2026, 10, '2026-11-13').firms[0].rows[0];
  const nov = C.month(ix, 2026, 11, '2026-11-13').firms[0].rows[0];
  assert.deepStrictEqual([oct.group, oct.status, oct.dpd], ['month', 'overdue', 29]);
  assert.deepStrictEqual([nov.group, nov.status, nov.dpd], ['overdue', 'overdue', 29]);
  // a future month does not carry it forward as paid, and nothing is counted twice inside one month
  const dec = C.month(ix, 2026, 12, '2026-11-13');
  assert.deepStrictEqual([dec.due_cents, dec.paid_cents, dec.remaining_cents], [usd(12000), 0, usd(12000)]);
});

test('Settled before the month → not carried; early money counts for its own month', () => {
  const ix = facts([{ name: 'A', contracts: [{ schedule: [['2026-10-10', 5000], ['2026-11-15', 5000], ['2026-12-15', 5000]],
    payments: [['2026-10-09', 5000, [[1, 5000]]], ['2026-11-01', 10000, [[2, 5000], [3, 5000]]]] }] }]);
  const nov = C.month(ix, 2026, 11, '2026-11-08');
  assert.strictEqual(nov.firms[0].rows.length, 1);
  assert.deepStrictEqual([nov.due_cents, nov.paid_cents], [usd(5000), usd(5000)]);
  const dec = C.month(ix, 2026, 12, '2026-11-08');
  assert.deepStrictEqual([dec.due_cents, dec.paid_cents, dec.remaining_cents], [usd(5000), usd(5000), 0]);
});

test('Statuses: not yet due / due today / late / partial / paid; clickable only if money came in', () => {
  const ix = facts([{ name: 'A', contracts: [{
    schedule: [['2026-11-20', 1000], ['2026-11-03', 1000], ['2026-11-02', 1000], ['2026-11-04', 1000], ['2026-11-08', 1000]],
    payments: [['2026-11-05', 400, [[3, 400]]], ['2026-11-06', 1000, [[4, 1000]]]] }] }]);
  const rows = C.month(ix, 2026, 11, '2026-11-08').firms[0].rows;
  const bySeq = s => rows.find(r => r.installment.seq === s);
  assert.deepStrictEqual([bySeq(1).status, bySeq(1).dpd, bySeq(1).clickable_status], ['current', 0, false]);
  assert.deepStrictEqual([bySeq(2).status, bySeq(2).dpd, bySeq(2).clickable_status], ['due', 5, false]);          // past its date, still inside its month: «مستحق · 5»
  assert.deepStrictEqual([bySeq(5).status, bySeq(5).dpd], ['today', 0]);
  assert.deepStrictEqual([bySeq(3).status, bySeq(3).dpd, bySeq(3).clickable_status], ['due', 6, true]);       // part paid, past its date, inside its month: «مستحق · 6»
  assert.deepStrictEqual([bySeq(4).status, bySeq(4).clickable_status], ['paid', true]);
});

test('Firm status: the worst row wins; firms with nothing due are hidden; sort by remaining', () => {
  const ix = facts([
    { name: 'Late', contracts: [{ schedule: [['2026-09-01', 1000], ['2026-11-20', 1000]], payments: [['2026-11-02', 1000, [[2, 1000]]]] }] },
    { name: 'Big', contracts: [{ schedule: [['2026-11-20', 9000]] }] },
    { name: 'Done', contracts: [{ schedule: [['2026-11-02', 3000]], payments: [['2026-11-02', 3000, [[1, 3000]]]] }] },
    { name: 'Later', contracts: [{ schedule: [['2026-12-02', 3000]] }] },
    { name: 'Draft', contracts: [{ state: 'draft', schedule: [['2026-11-02', 3000]] }] },
  ]);
  const m = C.month(ix, 2026, 11, '2026-11-08');
  assert.deepStrictEqual(m.firms.map(f => f.firm.name), ['Big', 'Late', 'Done']);
  assert.deepStrictEqual(m.firms.map(f => f.status), ['current', 'overdue', 'paid']);
});

test('Part paid: «مسدد جزئياً» up to the due date; then «مستحق · n» in its month, «متأخر · n» after (Ibrahim, 2026-11-17)', () => {
  const ix = facts([{ name: 'A', contracts: [{ schedule: [['2026-11-28', 25000]], payments: [['2026-11-13', 10000, [[1, 10000]]]] }] }]);
  const at = d => { const r = C.month(ix, 2026, 11, d).firms[0].rows[0]; return [r.status, r.dpd, r.remaining_cents]; };
  assert.deepStrictEqual(at('2026-11-13'), ['partial', 0, usd(15000)]);     // paid early, in part: not late
  assert.deepStrictEqual(at('2026-11-28'), ['partial', 0, usd(15000)]);     // the due day itself: still not late
  assert.deepStrictEqual(at('2026-11-29'), ['due', 1, usd(15000)]);         // the day after, still November: «مستحق · 1»
  assert.deepStrictEqual(at('2026-12-01'), ['overdue', 3, usd(15000)]);     // its month has closed: «متأخر · 3»
  const i = ix.data.installments[0];
  assert.deepStrictEqual([C.instStatus(ix, i, '2026-11-29').status, C.instStatus(ix, i, '2026-11-20').status], ['due', 'partial']);
});

test('Due 13 Nov: 12th not yet · 13th «مستحق» · 14th–30th «مستحق · n» · 1 Dec «متأخر · 18» · buckets kept', () => {
  const ix = facts([{ name: 'A', contracts: [{ schedule: [['2026-11-13', 1000]] }] }]);
  const at = d => { const r = C.month(ix, 2026, 11, d).firms[0].rows[0]; return [r.status, r.dpd, r.bucket]; };
  assert.deepStrictEqual(at('2026-11-12'), ['current', 0, 0]);    // the day before: غير مستحق بعد
  assert.deepStrictEqual(at('2026-11-13'), ['today', 0, 0]);      // the due day itself: مستحق اليوم (not late)
  assert.deepStrictEqual(at('2026-11-14'), ['due', 1, 1]);        // the day after: «مستحق · 1» (Ibrahim's rule, 2026-11-17)
  assert.deepStrictEqual(at('2026-11-30'), ['due', 17, 1]);       // the last day of its month: still «مستحق · 17»
  assert.deepStrictEqual(at('2026-12-01'), ['overdue', 18, 1]);   // the next month: «متأخر · 18», days from the due date
  assert.deepStrictEqual([30, 31, 60, 61, 90, 91].map(C.bucketOf), [1, 2, 2, 3, 3, 4]);
});

test("Admin search: an installment's own status = its row in its own month (every demo installment, today = Nov 13)", () => {
  const ix = C.index(demo), today = '2026-11-13';
  let n = 0;
  for (const i of demo.installments) {
    const y = +i.due_on.slice(0, 4), m = +i.due_on.slice(5, 7);
    const c = ix.contract[i.contract_id];
    const row = C.firmRows(ix, c.firm_id, y, m, today).find(r => r.installment.id === i.id);
    const s = C.instStatus(ix, i, today);
    assert.deepStrictEqual([s.status, s.dpd, s.bucket], [row.status, row.dpd, row.bucket], i.id);
    n++;
  }
  assert.ok(n > 30);
});

test('Payment split, oldest first (FIFO): 20,000 over three owed 12,000 → 12,000 · 8,000 · 0', () => {
  const open = [{ id: 'i3', due_on: '2026-12-10', owed_cents: usd(12000) }, { id: 'i1', due_on: '2026-10-10', owed_cents: usd(12000) },
                { id: 'i2', due_on: '2026-11-10', owed_cents: usd(12000) }];
  const r = C.fifo(open, usd(20000));
  assert.deepStrictEqual(r.split.map(x => [x.id, x.cents]), [['i1', usd(12000)], ['i2', usd(8000)], ['i3', 0]]);
  assert.strictEqual(r.leftover_cents, 0);
  // a part-paid remainder counts as owed; more than the contract owes is reported, never forced in
  const r2 = C.fifo([{ id: 'a', due_on: '2026-10-10', owed_cents: usd(5000) }, { id: 'b', due_on: '2026-11-10', owed_cents: usd(12000) }], usd(20000));
  assert.deepStrictEqual(r2.split.map(x => x.cents), [usd(5000), usd(12000)]);
  assert.strictEqual(r2.leftover_cents, usd(3000));
});

test('A recorded payment moves the month: allocations by received date (Boss sees it)', () => {
  const ix = facts([{ name: 'A', contracts: [{ schedule: [['2026-10-10', 12000], ['2026-11-10', 12000]],
    payments: [['2026-11-12', 20000, [[1, 12000], [2, 8000]]]] }] }]);
  const nov = C.month(ix, 2026, 11, '2026-11-14');
  const byGroup = g => nov.firms[0].rows.find(r => r.group === g);
  assert.deepStrictEqual([byGroup('overdue').status, byGroup('month').status], ['paid', 'due']);   // due 10 Nov, 8,000 of 12,000, still November → «مستحق · 4»
  assert.deepStrictEqual([nov.due_cents, nov.paid_cents, nov.remaining_cents], [usd(24000), usd(20000), usd(4000)]);
});

// a firm with credit: a 50,000 deposit on 1 Sep (no contract), used for a 12,000 installment due 10 Nov, applied 13 Nov
function creditFacts(withUse, reversed) {
  const D = { firms: [{ id: 'f1', name: 'A' }], contracts: [{ id: 'c1', firm_id: 'f1', ref: 'C1', state: 'active' }],
    installments: [{ id: 'i1', contract_id: 'c1', seq: 1, due_on: '2026-11-10', amount_cents: usd(12000) }],
    payments: [{ id: 'p1', kind: 'credit', firm_id: 'f1', contract_id: null, received_on: '2026-09-01', amount_cents: usd(50000), created_at: '2026-09-01T10:00' }],
    allocations: [], notes: [], anchors: [], documents: [] };
  if (withUse) D.allocations.push({ id: 'l1', payment_id: 'p1', installment_id: 'i1', amount_cents: usd(12000), applied_on: '2026-11-13', voucher_id: 'v1', voided_at: reversed ? '2026-11-14T09:00' : undefined });
  return D;
}

test('Credit pays on the day it is APPLIED, not the day it was deposited (Ibrahim, 2026-11-14)', () => {
  const D = creditFacts(true, false), live = { ...D, allocations: D.allocations.filter(a => !a.voided_at) };
  const ix = C.index(live), i = live.installments[0];
  assert.deepStrictEqual([C.instStatus(ix, i, '2026-11-12').status, C.instStatus(ix, i, '2026-11-13').status], ['due', 'paid']);
  const sep = C.month(ix, 2026, 9, '2026-11-14'), nov = C.month(ix, 2026, 11, '2026-11-14');
  assert.deepStrictEqual([sep.paid_cents, nov.paid_cents], [0, usd(12000)]);       // September is never rewritten
  assert.strictEqual(C.paymentsOf(ix, 'i1', '2026-11-14')[0].on, '2026-11-13');
});

test('The credit ledger: deposit 50,000 → use 12,000 → reversal 12,000 = 50,000 · 38,000 · 50,000; balance = live rows', () => {
  const dep = creditFacts(false).payments[0];
  const vouchers = [{ id: 'v1', no: 1, kind: 'settlement', on: '2026-11-13', amount_cents: usd(12000), created_at: '2026-11-13T10:42' },
                    { id: 'v2', no: 2, kind: 'reversal', on: '2026-11-14', amount_cents: usd(12000), reverses: 'v1', created_at: '2026-11-14T09:00' }];
  const L = C.creditLedger([dep], vouchers);
  assert.deepStrictEqual(L.lines.map(l => [l.kind, l.balance_cents]), [['deposit', usd(50000)], ['settlement', usd(38000)], ['reversal', usd(50000)]]);
  // the same number from the live rows, before and after the reversal
  const used = creditFacts(true, false), back = creditFacts(true, true);
  assert.deepStrictEqual([C.creditBalance(used, 'f1'), C.creditBalance(back, 'f1')], [usd(38000), usd(50000)]);
  assert.strictEqual(C.creditLedger([dep], vouchers.slice(0, 1)).balance_cents, C.creditBalance(used, 'f1'));
  // the same second (found live, 2026-11-14): use reversed, then the deposit reversed — never a negative balance on the way
  const same = '2026-11-14T19:37:05';
  const L2 = C.creditLedger([{ ...dep, voided_at: same }],
    [{ id: 'v1', no: 1, kind: 'settlement', on: '2026-11-14', amount_cents: usd(25000), created_at: '2026-11-14T19:36:34' },
     { id: 'v2', no: 2, kind: 'reversal', on: '2026-11-14', amount_cents: usd(25000), reverses: 'v1', created_at: same }]);
  assert.deepStrictEqual(L2.lines.map(l => [l.kind, l.balance_cents]),
    [['deposit', usd(50000)], ['settlement', usd(25000)], ['reversal', usd(50000)], ['deposit-reversed', 0]]);
  assert.ok(L2.lines.every(l => l.balance_cents >= 0));
  // a reversed deposit leaves the ledger at 0 and the balance at 0
  const gone = { ...dep, voided_at: '2026-09-02T08:00' };
  assert.strictEqual(C.creditLedger([gone], []).balance_cents, 0);
  assert.strictEqual(C.creditBalance({ payments: [gone], allocations: [] }, 'f1'), 0);
});

test('Demo data: the three words always add up, every firm and every month (Jun 2026 → Mar 2027)', () => {
  const ix = C.index(demo);
  let checked = 0;
  for (const [y, mo] of [[2026, 6], [2026, 7], [2026, 8], [2026, 9], [2026, 10], [2026, 11], [2026, 12], [2027, 1], [2027, 2], [2027, 3]]) {
    const m = C.month(ix, y, mo, '2026-11-08');
    assert.strictEqual(m.due_cents - m.paid_cents, m.remaining_cents);
    assert.strictEqual(m.firms.reduce((s, f) => s + f.due_cents, 0), m.due_cents);
    for (const f of m.firms) {
      assert.strictEqual(f.due_cents - f.paid_cents, f.remaining_cents, f.firm.name);
      for (const r of f.rows) assert.ok(r.remaining_cents >= 0 && r.paid_cents <= r.due_cents, f.firm.name);
      checked++;
    }
  }
  assert.ok(checked > 20);
});

test('Demo data, November 2026 as of Nov 8: hand-checked 268,000 / 75,000 / 193,000', () => {
  const m = C.month(C.index(demo), 2026, 11, '2026-11-08');
  assert.deepStrictEqual([m.due_cents, m.paid_cents, m.remaining_cents], [usd(268000), usd(75000), usd(193000)]);
  const f = n => m.firms.find(x => x.firm.name === n);
  assert.strictEqual(f('Contoso Engineering').due_cents, usd(50000));
  assert.strictEqual(f('Fabrikam Logistics').due_cents, usd(50000));
  assert.strictEqual(f('Northwind Trading').due_cents, usd(50000));
  assert.strictEqual(f('Northwind Trading').status, 'overdue');
  assert.strictEqual(f('Lucerne Publishing'), undefined);
  assert.strictEqual(f('Litware Systems').status, 'paid');
});

test('Contract gate: Σ installments vs the total written in the contract (Ibrahim, 2026-11-12)', () => {
  const i = (...a) => a.map(x => ({ amount_cents: usd(x) }));
  const g = (insts, total) => { const r = C.scheduleCheck(insts, total == null ? null : usd(total)); return [r.state, r.can_finish, r.gap_cents == null ? null : r.gap_cents / 100]; };
  assert.deepStrictEqual(g([], 80000), ['empty', false, 80000]);
  assert.deepStrictEqual(g(i(20000, 20000, 20000), 80000), ['short', false, 20000]);      // one installment missed
  assert.deepStrictEqual(g(i(20000, 20000, 20000, 20000), 80000), ['match', true, 0]);
  assert.deepStrictEqual(g(i(20000, 20000, 20000, 200000), 80000), ['over', false, -180000]); // a typo: one zero too many
  assert.deepStrictEqual(g(i(20000, 20000), null), ['no-total', true, null]);              // the contract states no total
  // a removed (voided) installment never counts — it stays in the record, out of the sum
  assert.deepStrictEqual(g([...i(40000, 40000), { amount_cents: usd(5000), voided_at: '2026-11-12' }], 80000), ['match', true, 0]);
  assert.strictEqual(C.scheduleCheck(i(1.5, 2.25), usd(3.75)).state, 'match');            // cents, never floats
});

console.log(`\n${passed} passed`);
