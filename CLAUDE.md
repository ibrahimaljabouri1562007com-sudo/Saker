# صقر (Saker) — project conventions

Receivables tracker: firms owe the entity money under contracts paid in installments.
Plan and every agreed decision: `_guide/ROADMAP.md` (index: `_guide/ABOUT.md`).

## The principle — test every change against it
> **عرض الحالة وفقاً للأهمية، مع إمكانية عرض التفاصيل بشكل قابل للتنبؤ**

1. **Importance decides the first screen.** The Boss's first screen holds the three words
   only: Total due · Paid · Remaining. Nothing joins them.
2. **Depth is a fixed ladder.** Sky (3 numbers) → Hover (firms, one number each) → Dive (a firm's
   drawer: Reference · Amount due · Due date · Status · Note). No new rungs by surprise.
3. **Same shape every time.** Same columns, order, colors, formatting in every month and firm.
   No popups, no alerts, no "did you know". Silence is the default.

Before adding anything to the Boss side, answer: which altitude does it live on? does it change
that altitude's shape (→ needs Ibrahim's approval)? does it touch the Sky (→ almost always no)?
No altitude = it's an Admin feature.

## Hard rules
- **Money is integer minor units** (cents) everywhere: data, math, storage. Format only at display.
- **Status is computed** (never stored or typed) by `calc.statusOf`, Ibrahim's rule (2026-11-17): «غير مستحق بعد» before
  the due date · «مستحق» on it · «مستحق · n يوم» after it until the last day of its month (light red) · «متأخر · n يوم»
  from the next month (dark red) · «مسدد جزئياً» only up to the due date (the paid part shows in the amount) · «مسدد».
  n = days from the due date.
- **Edits allowed, always logged** (who · when · before · after). Nothing is hard-deleted; no DELETE
  policy for any role.
- **The contract file is never modified.** Highlights are data drawn over it at view time.
- **The three words must add up** (Remaining = Total due − Paid). The golden tests are the gate.
- **Fake firms and dummy PDFs only** until all three locks (gate · guard · vault) are verified live.
- **Cache pins:** every asset link in `index.html` carries `?v=N`; bump N (all links) on every change,
  or browsers keep running the old file.
- **Sign-in posters follow the look:** any change to how the landscape looks → bump `LOOK` in
  `assets/terrain.js`, re-render the posters (`_guide/make-posters.html` + the receiver, see its header),
  then `python -I tools/inline_posters.py`. Stale posters are skipped automatically (dark first paint).
- **Logo lettering is generated:** «صقر / SAKER» come from `tools/make_wordmark.py` (Noto Kufi Arabic + Noto
  Sans outlines). Never hand-edit or re-trace those paths; change the script and re-run it.
- **Own stove:** صقر's database and storage share nothing with ICCMC, Orphans or any other project.
- **One write path:** every Admin write goes through `assets/store.js` (logged in `audit_log`, removals = `voided_at`).
  Phase A keeps the Admin's rows in the browser beside the untouched `data/demo.js`; phase B swaps this one module.
- **Dates are typed day/month/year** in every Admin form (never the browser's date box) and read back in words.
  Date laws: signed on ≤ today; an installment's due date ≥ the signing date (far future is fine, up to 2100).
- **Payments are reversed, never edited:** one transfer = one record = one receipt with its amount boxed; split oldest
  first (`calc.fifo`), Σ = the amount exactly; a wrong one gets `voided_at` and is entered again.
- **Credit is a ledger:** the firm's credit balance is CALCULATED from deposits (bank receipt + the firm's instruction),
  uses (numbered settlement vouchers, written by the system) and reversals (numbered reversal vouchers); money counts
  on its APPLIED date (`allocations.applied_on`). Vouchers are never typed, edited or deleted.
- **One clock: today.** Every month view counts status and days late to today; the month picked only chooses which
  installments are shown. A month-end snapshot is a separate, labelled report — never the picker's default.
