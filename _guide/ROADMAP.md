# ROADMAP — صقر (Saker) · financial tracking, iteration 1 (agreed 2026-11-07)

**What صقر is:** a receivables tracker for money that contracted firms owe the entity. Two
faces: the **Admin** (enters firms, contracts, installments, notes, payments) and the **Boss**
(reads only, by importance, deeper only when he chooses).

**The principle (Ibrahim's words, the test for every decision):**
> **عرض الحالة وفقاً للأهمية، مع إمكانية عرض التفاصيل بشكل قابل للتنبؤ**
> Show the situation by its importance to the Boss; details on demand, in a predictable,
> consistent pattern.

Status marks: ☐ open · ◐ decided, not built · ● built & verified · — no decision needed.
Tags: 🟢 in-catalog (lift from `Productivity/TRANSFER-CATALOG.md`) · ▫ project-only.

---

## 1. What we agreed in the thinking (2026-11-01 → 11-07)

### The Boss: three altitudes, never more
```
Sky     Total due · Paid · Remaining          (the month is set automatically)   [Export]
Hover   firms, ONE number each = that firm's Total due for the month
Dive    one firm's drawer → contract rows:
        Reference · Amount due · Due date · Status · Note                         [Export]
```
Click map inside the drawer, each click opens a side panel, never a new page:

| Click | Opens beside him |
|---|---|
| Reference | the whole contract, page 1 |
| Amount or date | the contract, scrolled to that installment's clause, highlighted |
| Status | the proof of payment (receipt / bank reference), or "not paid yet" |
| Note | the note's source (contract OR an outside document), highlighted |

Colors: 🟢 current installment (due this month) · 🔴 overdue, with its age (DPD).
Every number and word on the Boss's screen leads to a document in one click.

### The Admin: six moves
1. Pick or add a **firm**.
2. Add a **contract**: upload the file, reference, total amount.
3. **Open the contract** in the viewer.
4. **Select a clause → form**: due date + amount (+ optional note) → save. The anchor is recorded
   automatically. Repeat until installments add up to the total (gate: no closing a contract
   until Σ installments = total).
5. **Notes**: text + a source = a highlight in the contract OR in an **outside document**
   (letter, email, minutes) uploaded to that contract. In iteration 1 this is also how a changed
   clause is documented: nothing changes without a document behind it.
6. **Record a payment**: amount, date, proof attached; applied to installments (below).

### The finance rules (the professional moves, all agreed)
- **The installment is the base unit.** Status is **computed**, never typed:
  Paid · Partial · Due (current) · Overdue · Upcoming.
- **Unpaid installments carry forward (AR aging).** An overdue installment keeps its own line and
  its original due date, shows in every later month in red with **DPD (days past due)** until paid.
  It is never merged into the next installment.
- **Payments apply oldest-first (FIFO)** within the contract; the Admin can override to a
  specific installment. One payment can settle several installments (cash application).
- **The three words always add up:** Remaining = Total due − Paid = the unpaid part of the dues.
- **Early money** (paid against an installment not yet due) is not counted in this month's Paid;
  it appears as a small note, so Remaining can never go negative.
- **Edits are allowed and always logged.** The Admin corrects mistakes directly; every insert and
  edit records who, when, before and after (like the Al-Amin registry). Nothing is hard-deleted.
- **The contract file is never touched.** Highlights are data (document + page + box) drawn over
  the file at view time. A partial anchor (page only) is valid; a box is the goal.

### The month math (◐ spec for step A3; golden tests prove it)
For a month **M**, always **as of today** — one clock for every month (changed 2026-11-13; the month picked only
chooses WHICH installments are shown):
- **Total due(M)** = full amount of every installment due **in M**
  \+ the **outstanding amount at the start of M** of every installment due **before M** and not
  fully paid by then (the carried-forward arrears).
- **Paid(M)** = money applied to those same items: for M's own installments, everything applied to
  them up to today (early and late payments included); for arrears, what was applied from the start of M to today.
- **Remaining(M)** = Total due(M) − Paid(M) = what of them is still owed today.
- **Status and days late** are the installment's own, counted to today (the DPD standard, 2026-11-13): «غير مستحق بعد»
  before the due date · «مستحق اليوم» on it · «متأخر · n يوم» from the day after (n = days past due), light red for
  1–30 days, dark red beyond · «مسدد جزئياً» (+ days when late) · «مسدد». Aging buckets 1–30 · 31–60 · 61–90 · 90+.
- A firm's number on the Hover level = the same formula restricted to that firm.
- ~~Past months are as-of snapshots~~ (superseded 2026-11-13): a month-end snapshot («كما في 31 تشرين الأول») is the
  accounting-close report — a separate, labelled report for a later iteration, never the month picker's hidden default.

Worked example (Firm A, viewing November; Sep and Oct paid in November):

| Installment | Due | Paid | Unpaid |
|---|---:|---:|---:|
| Sep 10 · 1 of 4 (overdue) | 20,000 | 20,000 | 0 |
| Oct 10 · 2 of 4 (overdue, partial) | 20,000 | 10,000 | 10,000 |
| Nov 10 · 3 of 4 (current) | 20,000 | 0 | 20,000 |
| **Total** | **60,000** | **30,000** | **30,000** |

### Where it lives and how it's locked (◐ agreed in principle)
- **Painter: Line 3** (painted in the browser, like ICCMC). The page fetches fresh numbers on
  every look; the PDF viewer has to run in the browser anyway.
- **Lock 1, the gate:** Cloudflare Access with an allow-list and a one-time code. A stranger never
  gets even the empty page.
- **Lock 2, the guard:** RLS in Postgres. Boss = read only · Admin = write · nobody = delete.
- **Lock 3, the vault:** a private storage bucket. Contracts, outside documents and receipts are
  served only through short-lived signed links, issued after the guard says yes.
- **Its own Supabase project** (second-stove rule): shares nothing with ICCMC or Orphans.
  No public sign-up · two-step sign-in for everyone · audit log · point-in-time backups.
- **Security shelf** (points to close before real data; Ibrahim, 2026-11-17: "first the skeleton, then the layers"):
  - ☐ **Make the GitHub repo private** (`ibrahimaljabouri1562007com-sudo/Saker`, public since 2026-11-17 — code + demo
    data only; the plan documents, incl. this lock design, are readable while it is public).
  - ☐ The three locks above (gate · guard · vault) verified live — the precondition for any real firm or contract.
  - ◐ **Every account's email is an inbox its owner controls — or a reserved test address** (`…@example.com`). Why:
    Cloudflare guards the PAGE only; Supabase's own sign-in services (incl. "reset password") answer anyone who has the
    public address + key, so whoever owns an account's inbox can take the account. 2026-11-17: the test Boss account was
    moved from a made-up Gmail address to `boss.test@example.com` (same account, same password, role boss) ✔ · the real
    Boss later = his own inbox · the strongest lock = the 6-digit code required BY THE DATABASE (B6).
  - ☐ **Disconnect Claude's «Supabase Saker» connector (or replace it with a read-only one)** before real data: it has
    full database access, so it could technically read the sign-in tables (incl. each phone's TOTP secret). Never used
    for that — but a lock is only as strong as every key holder. (Ibrahim, 2026-11-17)
  - ☐ Supabase «Leaked password protection» (refuses passwords from known leaks — HaveIBeenPwned) is off; likely a paid
    feature. Low urgency: the 6-digit code (B6, required by the database) already defeats a leaked password.
  - ☐ **Limit Cloudflare's GitHub app to the Saker repo only** (Cloudflare Pages app, installed for earlier projects,
    sees ALL repos today) — GitHub → Settings → Applications → Cloudflare Pages → Repository access. (B7, 2026-11-17)
  - ☐ **Backups decided** — the Free plan keeps none: Pro (≈ 25 USD/month, daily, 7 days) or our own nightly export.
  - ☐ **Demo data wiped** (the 20 demo contracts + the test firms «iii» / «sdss») before the first real contract.
  - ☐ **The real Boss account**: his own inbox · added to «Saker people» (Cloudflare) + Supabase role boss · links his
    phone at first sign-in. The test Boss (`boss.test@example.com`) still has no phone linked.
  - Shelved by Ibrahim 2026-11-17 ("keep these points on the shelf, so if I return to them") — together = **B8**
    (`PHASE-B-PLAN.md`); feature shelf items stay where they are (§4b, «تعديل», overpayment → credit, report notes).
  - The way in = 3 layers: ① Cloudflare Access (the page) → ② password → ③ 6-digit code; ② and ③ are also enforced
    on a direct call to Supabase (the page can be skipped, the database cannot), with the guard + vault behind them.

---

## 2. Build order, iteration 1

**Method:** interface first on a **fake fridge with exactly the real shape**, so wiring the
database is one swap of the data module, not a rewrite. **Hardest piece first** (the contract
viewer). **Fake firms and dummy PDFs only** until all three locks are on.

### Phase A — the interface on a fake fridge (local, no database)

| # | Step | Tag | What "done" means | Status |
|---|---|---|---|---|
| A1 | **Data shape** → `_guide/DATA-SHAPE.md` | 🟢 mold-first (Greenfield ⇒ SEPARATE folds into ANCHOR); JSON→SQL naming: columns = the app's own keys | Every entity + field named (Firm, Contract, Document, Installment, Anchor, Note, Payment, Allocation, User). Money in **integer minor units**. Ibrahim approves. | ● skeleton updated 2026-11-08 (approved-but-growable) |
| A2 | **Fake fridge** → `data/demo.js` | 🟢 DEMO mode (ICCMC, Interchangeable-backend unit) · ⚠️ static-site-no-fetch: data as JS globals | 10 firms, ~15 contracts, every status (paid, partial, overdue 26 / 56 / 95 days, current, upcoming, early money), 2–3 dummy PDFs + 1 outside document | ● 10 firms · 20 contracts · 44 installments · 13 payments · 35 dummy PDFs (`tools/make_demo.py`) |
| A3 | **Math core** → pure functions + golden tests | ▫ | `status()`, `dpd()`, `applyFifo()`, `monthTotals()` · the worked example above returns 60,000 / 30,000 / 30,000 · Σ checks pass for every firm and month in the demo data | ● `assets/calc.js` · 9/9 golden tests (`node tests/calc.test.js`) |
| A4 | **Contract viewer + highlights** (the riskiest piece) | ▫ | pdf.js side panel · opens at page 1 / at an anchor with its box highlighted · page-only anchors land on the page · works for contract AND outside documents | ● `assets/viewer.js` (pdf.js) · highlight + margin marker · works on the image-only "scan" |
| A5 | **Boss view**: Sky → Hover → Dive + click map | 🟢 theme via design tokens | The three altitudes on demo data · green/red + DPD · every click opens its document · same shape every month (Law 3) | ◐ built 2026-11-08 (Sky · Hover · Dive + click map, AR/EN, phone) · awaiting Ibrahim's 🧪 |
| A6 | **Admin flow**: the six moves | 🟢 data-quality gatekeeper | Clause-select → form → saved anchor · Σ installments = total gate · notes with contract or outside source · payment + proof + FIFO with override | ◐ slice 1 «إضافة» built 2026-11-12 (firm + number + file → workspace → total + installments by drawing on the contract → gate → Boss) · 🧪 passed by Ibrahim (v59: amounts grouped with commas while typed) · slice 2 built 2026-11-12 (v63): include switches · «+ إضافة مرجع» (contract · amount · date) · notes with outside source · awaiting Ibrahim's 🧪 · next: «الحالة» = payment + proof + FIFO (same «+» door) · Search built 2026-11-13 (v74) · «تسجيل دفعة» built 2026-11-14 (v80) · credit + ledger + vouchers built 2026-11-14 (v83) · editing on the shelf |
| A7 | **Export** at Sky and per contract | 🟢 one official paper → PDF (render, then READ the PDF) | **Deferred** (2026-11-07): discussed once Admin, Boss and DB are clearer. Button placeholder only. | — |
| A8 | **Look, language, currency** | 🟢 theme tokens · 🟢 bilingual skill (chrome translates, data never) | Agreed in the UI stage (open items below) | ◐ tokens + Plex fonts + AR/EN switch built; all text ≥ 4.5:1 contrast |

**Gate between A and B:** Ibrahim's live 🧪 of the full Boss + Admin flow on demo data.

### Phase B — wire the fridge, turn on the locks

> **Detailed plan: `PHASE-B-PLAN.md`** (proposed 2026-11-17; its steps B0–B8 refine the table below once Ibrahim
> approves). Project: Supabase **Saker** `ayrijizubulczzympslg`, Frankfurt, linked to the GitHub repo.

| # | Step | Tag | What "done" means | Status |
|---|---|---|---|---|
| B1 | **New Supabase project** + schema from DATA-SHAPE | 🟢 Stand up a Supabase backend | Own project, region chosen (see data-residency question) · constraints: Σ installments = total, allocations ≤ installment, money non-negative | ☐ |
| B2 | **Auth + RLS roles** | 🟢 Supabase data layer + Auth + RLS | `my_role()` guard · Boss read-only · Admin write · **no DELETE policy for anyone** · sign-ups OFF · two-step sign-in | ☐ |
| B3 | **Private vault** for contracts, outside documents, receipts | ▫ (ICCMC storage pattern) | Private bucket · short-lived signed links only · storage policies follow the roles | ☐ |
| B4 | **Swap the data module** demo → Supabase | 🟢 Re-point a dashboard onto a live backend | Same screens, same golden numbers as on the demo data (symmetry proof) | ☐ |
| B5 | **Audit + integrity** | 🟢 DB self-audit + integrity tool | Audit log on every table · corrections as reversing entries · `run_health_audit()` checks the money invariants · point-in-time backups ON | ☐ |
| B6 | **Hosting + the gate** | ▫ (proven in ICCMC: Worker + Access) | Cloudflare Worker + Cloudflare Access allow-list + one-time code · ASVL: the live URL serves the new bytes | ☐ |
| B7 | **First real data** | — | Only after B2 + B3 + B6 are verified live · Ibrahim enters the first real contract himself · his 🧪 | ☐ |

---

## 3. Deferred to later iterations (agreed)
- **Amendments**: contract versions; the original stays, the amendment replaces the unpaid tail.
  Until then, changes are recorded as notes with an outside source.
- **Notifications / age alarm**: e.g. a banner for anything past 60/90 days. Must obey Law 1.
- **Payer profile** per firm (avg days late, on-time ratio) as one line at the top of a drawer.
- **Live sync** (Supabase Realtime) if several Admins work at once.

## 4. Open items (none blocks Phase A)
- ✔ **Data residency** (Ibrahim, 2026-11-17): no rule keeps the data in Iraq or on the entity's premises → Supabase
  cloud, region **Central EU (Frankfurt)** (the closest to Baghdad; permanent once the project is created).
- ☐ **"Paid X of Y" wording** on a partially paid row (to discuss).
- ◐ **Hover order** (recommended, not yet confirmed): largest Remaining first, ties by oldest
  overdue, fully paid at the bottom, firms with nothing due this month hidden.
- ◐ **Due date passed inside its own month** (recommended): row stays in *This month*, shows
  🔴 **Due · Nd**.
- ✔ Currency **USD** only · Language **Arabic + English** with a switch · **One Admin** · Export
  deferred (all 2026-11-07).

## 4b. Ideas kept in mind (we iterate on them together, not "someday")
- Payment-story panel behind every status: obligation · what came in · what's left · context.
- Highlights on receipts (land on the exact line of the transfer).
- Notes attached to a payment ("paid 10,000, promised the rest in December" + its source).
- One transfer split across several installments, shown in each one's story.
- **«دفعة تحت الحساب» — payment on account / the firm's credit balance** (Ibrahim, 2026-11-13). A firm sends a big
  sum "take any dues from this": recorded on the FIRM (date received · bank ref · receipt), tied to no installment;
  it waits as «رصيد تحت الحساب»; as installments fall due the app SUGGESTS applying from it and the Admin confirms
  (no money moves without a person). Credit is not «مسدد»: the Boss's Paid counts money only once applied.
- **One transfer paying two contracts of the same firm** → the «تسجيل دفعة» door moves up to the firm (same form, the
  split list shows all its contracts' installments). Open question to Ibrahim: does this happen in practice?
- **Explaining a total ≠ Σ installments gap**: fixed reasons (advance · VAT · retention · other) + a document.
- **Aging report as of a date** (the accounting-close snapshot): buckets 1–30 · 31–60 · 61–90 · 90+, labelled «كما في».
- **90+ days flag** on the Admin side (the default point in finance rules).
- **Export** at the Sky and per contract (A7, deferred). **Word / images → PDF** on upload (phase B).
- **«تعديل» — editing a finished contract + its «السجل» history** (moved to the shelf by Ibrahim, 2026-11-14; payments
  first). Agreed rules kept: same workspace, filled · a short reason (ideally a reference document) · no removing an
  installment that has money on it · an installment never below what is already paid on it · Σ installments = total
  still holds · every edit logged → a history tab built from audit_log.

## 5. Decision log
- 2026-11-17 · **The report's evidence = the page + the magnifier, in classic yellow** (Ibrahim: "inserting only one
  phrase of the contract cannot be a visually credible way" · "make the highlight classic yellow, so the report seems as a
  credible paper which is highlighted", v112). Per contract PAGE that holds marks — the needed pages, never more — one
  block: the WHOLE page reduced (72 mm; letterhead, layout, signatures = credibility) with every mark in place, beside its
  points magnified at about the paper's own size (readable): «① القسط 1 من 3 · 20,000 · 10/09/26» over the marked line
  only, cut tight with a white margin. Marks = highlighter yellow laid OVER the text (multiply), numbers = ink pills in
  the margin (each finds a free spot, never on another); the contract total first as «الإجمالي». A page carried over
  opens with «<firm> (تابع)». The screen viewer keeps its blue; only the paper is yellow.
- 2026-11-17 · **The report (PDF) — the Boss view on paper** (Ibrahim: "page 1 level one … page 2 a table with 4
  columns … page 3 each firm drawer … references in a compacted way … clean as a paper", v107). One quiet button in the
  Boss's bar (Boss only) → a preview of real A4 sheets → «حفظ PDF» (the browser's print-to-PDF; the file is named after
  the heading). Page 1: «تقرير المستحقات — <month>» + «أقساط شهر <month>، وحالتها كما هي مسجّلة في <date>، الساعة <hh:mm>
  (بتوقيت بغداد)» + the three numbers (the heading = the month it is ABOUT; the line = the moment it shows; one clock).
  Page 2: firm · المستحق · الحالة · ملاحظات («—» until Ibrahim decides where these notes come from) + a total line that
  equals page 1. Page 3+: each firm's drawer (the Boss's five columns) then its contract clips: the Admin's own boxes
  (amount, date, the contract total «الإجمالي») highlighted together, numbered = the number beside the cell; close boxes
  share one clip, far ones get their own; cut edges snap between lines; a firm stays whole on a page when it fits. Every
  sheet's footer: brand · demo mark · «كما هي مسجّلة في …» · «صفحة n من N». Headless proof: `tests/report-print.html`.
  Also: the bar's falcon larger and full strength (46px box, the bar's height kept).
- 2026-11-17 · **Look v2 — the Boss view continues the sign-in** (Ibrahim: "make the boss mode much as an extension to
  the log in … the background a bit blurry for focus", v105). The sign-in's own landscape poster stays behind the Boss,
  drawn ONCE onto a canvas, softened (blur 5px · brightness 0.62), placed by the same horizon math (`SakerTerrain.layout`
  + `pickPoster`), and melting into solid ink before the firm list, so data never sits on imagery; dimmed to 42% while
  the details are open. At sign-in only (View Transitions API): a square copy of the lockup's falcon flies into the
  bar's mark while the lettering fades with the sign-in; the bar drops in, the three-numbers card rises. Reduced motion
  or no browser support = instant, no show. The falcon watermark and the horizon strip RETIRE (the brand moment is the
  flight now). Boss only: the Admin keeps its plain surface. Side fix: a late Enter after the 6-digit code is ignored.
- 2026-11-17 · **Look v2 — the falcon becomes part of the page** (Ibrahim: "a better way to present the logo … the
  falcon semi-appearing, restraint", v101). The bar carries only the quiet mark (30px, 88%); the full lockup stays on
  the sign-in. In the Sky, the DETAILED falcon (`brand/saker-mark.svg`, framed 231 × 128, used as a mask tinted with
  `--silver` — the 30px sprite is simplified and reads as two strokes when large) sits at ~11% brightness at the PAGE's
  start edge, in the open sky between the bar and the three words, always facing into the page (mirrored in Arabic) so
  the edge cuts the wingtips, never the head; it leaves when the details open. Checked: AR + EN, desktop + phone, no
  sideways scroll. Found + fixed on the way: the bird first landed behind the card (the sprite's frame is a square with
  the bird in its lower half); two composited masks left faint box edges → one mask.
- 2026-11-17 · **Look v2 — the theme check, Boss first** (Ibrahim: "raise it up — modern, a professional touch, not
  gold"; BUILT as a switchable layer, v95, awaiting his choice). `assets/look2.css`, active only on `<html data-look="2">`
  (the «v2» button in the bar or `?look=2` / `?look=1`; remembered). No layout, column, order or click changes. Depth:
  a deeper ink base, one soft light behind the Sky, a fine grain, the sign-in landscape (`brand/scene-horizon.webp`,
  unused until now) as a soft horizon under the three words. Presence: the falcon at 36px + the generated wordmark
  (`brand/saker-wordmark.svg` as a mask — never re-traced), a translucent bar with a hairline, one segmented role switch,
  round icon buttons, a quiet demo badge. Restraint: glass cards (hairline + top highlight + soft shadow), light tabular
  numbers (Plex 300), pill month switcher and «التفاصيل». Drawer: plain values; the document icon (30%) and an underline
  come forward on hover. Colours are `--lk-*` tokens; sign-in untouched; no sideways scroll (root clip); phone checked.
  Next: Ibrahim compares → keep / adjust → then make it the default and remove the switch; the Admin follows.
- 2026-11-17 · **Ibrahim's status rule — «مستحق» until its month ends, then «متأخر»** (v92; his house rule, chosen over
  the strict "late from day 1"; supersedes the label part of 2026-11-13/14). Before the due date «غير مستحق بعد» · on it
  «مستحق» · from the day after until the last day of ITS month «مستحق · n يوم» (light red) · from the next month
  «متأخر · n يوم» (dark red, solid; the row tinted), n always counted from the due date (the DPD count; the aging
  bucket stays on the row for reports). Part paid: «مسدد جزئياً» only up to the due date; after it the same steps, the
  paid part in the amount («متبقٍ X» / «X من Y»). Firm = worst row: متأخر > مستحق · n > مستحق > مسدد جزئياً > غير
  مستحق بعد > مسدد. One `calc.statusOf` serves the month rows and the Admin's instalments. 18/18 golden (due 13 Nov:
  12th not yet · 13th مستحق · 14th–30th مستحق · n · 1 Dec متأخر · 18).
- 2026-11-14 · **Part paid ≠ calm: lateness wins (the standard)** (Ibrahim: "go do it", v91). Supersedes the 2026-11-12
  rule "part paid = yellow, late or not". An instalment not fully paid by its due date is «متأخر · n يوم» from the day
  after, part paid or not (light red 1–30, dark red 31+); «مسدد جزئياً» (yellow) only while not late (paid early, in
  part, up to and including the due day). The part payment shows in the AMOUNT: carried rows «X من Y» (as before),
  this month's rows a small «متبقٍ X»; clicking the amount opens the clause beside the transfer(s) with the strip.
  Row and firm now agree (Tailspin: «25,000 · متبقٍ 15,000 · متأخر · 12 يوماً», firm «متأخر»). 18/18 golden (new test:
  partial up to the due day → late the day after).
- 2026-11-14 · **«قسط مطابق» removed** (Ibrahim, v90): with a filter on, every listed contract matches by definition —
  the words on the contract bar were noise. The match stays shown silently: the blue frame on the instalments inside.
- 2026-11-14 · **The ladder stays pure — markers on the bars, details in the side panel** (Ibrahim, v89; supersedes the
  quiet lines of v85, which still sat between a firm and its contracts). Firm bar = its name + a tiny wallet marker
  (faint when empty, green with the balance when there is credit) + the caret; contract bar = number · paid of total +
  a tiny receipt marker with the count of payments (only when there are any) + status + caret. Opening a bar still goes
  straight down: firm → contracts → instalments. A marker opens the SIDE PANEL (the documents' panel) without moving the
  list: the firm's credit (balance · «إضافة رصيد» · the ledger) or the contract's payments (each in two lines, receipt
  / voucher, two-step reversal) — the Admin's clicks inside the panel are routed to the Admin. In the panel the ledger
  keeps its columns and long movements wrap inside their own cell.
- 2026-11-14 · **Simplicity in the Admin too** (Ibrahim, v85). The drawers are clean again: an open firm shows only its
  contracts — the credit (balance · «إضافة رصيد» · «كشف الحساب») waits behind one quiet line «رصيد تحت الحساب ▾»; a
  contract shows its table — its payments list waits behind a quiet «الدفعات · n ▾» in its tools row. The ledger reads
  left → right in both languages with fixed columns (date · movement · in · out · balance); every heading and its
  numbers share one edge (verified to the pixel). A fully used deposit now says «مستخدَم بالكامل».
- 2026-11-14 · **Admin slice 4 — «رصيد تحت الحساب» (firm credit) + its ledger, the first visible financial log**
  (Ibrahim + Claude; AGREED · BUILT 2026-11-14, v83 — C1–C7 ✅). The credit's LEDGER («كشف حساب الرصيد») is its whole journey, line by line,
  the balance after each line CALCULATED, never typed:
  · **Deposit** (cash receipt, money in from outside) — on the FIRM: amount · date received · bank ref (once per firm,
    shared with payments) · the bank receipt with its amount boxed · **the firm's instruction** («خذوا المستحقات من هذا
    المبلغ») with its key sentence boxed — both REQUIRED (money + consent).
  · **Use** (journal entry / credit application) — «تسجيل دفعة» on a contract of a firm with credit asks the SOURCE:
    «تحويل جديد» (as before) or «من الرصيد تحت الحساب · المتاح X». From credit: no receipt, no new reference; applied
    TODAY (the date it paid the installment — the month math counts the APPLIED date, never the deposit's date); amount
    ≤ the credit available; the same oldest-first split + gate. The system issues a numbered **سند تسوية** (settlement
    voucher: number · date · firm · from the credit (its transfer) · to the installments · amount · balance before/after
    · who · when) — a record the system writes, shown as a page; nobody types it.
  · **Reversal** — undoing a use issues a numbered **reversal voucher** (قيد عكسي); the money returns to the credit.
    A deposit may be reversed only while none of it is used.
  **Admin:** inside an open firm (search), above its contracts: «رصيد تحت الحساب: X» · «إضافة رصيد» · «كشف الحساب»
  (date · movement · in · out · balance; every line opens its proof — receipt + instruction, or the voucher).
  **Boss:** no new number. An installment paid from credit opens like any payment: the clause beside the deposit's bank
  receipt · the firm's instruction · the voucher, with one note line «سُدِّد من رصيد تحت الحساب · سند تسوية 0007 ·
  المتبقي من الرصيد اليوم X». **Later (shelf):** overpayment → credit · one transfer for two contracts · maker-checker.
  **Steps:** C1 data + calc (applied date, ledger, balance; golden tests) · C2 store (deposit · apply · reverse ·
  vouchers numbered) · C3 viewer shows a voucher page · C4 Admin firm card + ledger + «إضافة رصيد» · C5 pay-from-credit
  + voucher reversal in the contract drawer · C6 Boss proof (receipt · instruction · voucher + note) · C7 verify.
  **Verified live (Northwind, then restored):** deposit 50,000 (receipt + instruction, both boxed) → card 50,000 · paid
  25,000 from credit → «سند تسوية 0001» 50,000 → 25,000, the deposit can't be reversed while in use · Boss: note line +
  3 tabs (deposit receipt · instruction · voucher), November Paid +25,000 · reversal → «قيد عكسي 0002», back to 50,000
  and Paid −25,000 · deposit reversed → 0. Found + fixed: two moves in the same second sorted wrong (a −25,000 line) →
  the books' own order on ties; golden test added. 17/17 golden. Voucher colours are tokens (`--paper` · `--ink`).
- 2026-11-14 · **«تسجيل دفعة» BUILT — recording a payment** (Ibrahim: "build the payment", v80). In a finished contract's
  drawer, «تسجيل دفعة» beside «فتح العقد» opens a payment workspace (same layout as the contract's): the RECEIPT on the
  right — dropped, then its amount line boxed (required; «حفظ الدفعة» stays off until both); on the left amount received
  (grouped) · date received (dd/mm/yyyy, ≤ today, ≥ signing) · bank reference (once per firm) · the split: every
  installment still owing, oldest first, filled automatically (`calc.fifo`); a tick or a typed amount = the Admin's own
  split, «توزيع تلقائي» brings the automatic one back. Gate: split = amount exactly · none above what it owes · never
  above what the contract owes (credit later). Saved as one payment + its allocations + the receipt + its box (logged).
  The drawer then lists the contract's payments (date · amount · bank ref · split · «الإيصال» · «إلغاء الدفعة» in two
  steps = a reversal, kept). Verified: 25,000 on NWT-0458 → 20,000 + 5,000; Boss November 268,000 / 100,000 / 168,000,
  «مسدد» opens the new receipt boxed, the part-paid amount shows the clause beside BOTH transfers; reversal → back to
  268,000 / 75,000 / 193,000. 15/15 golden (new: FIFO split; a payment moves the month).
- 2026-11-14 · **The Admin's drawer clicks like the Boss's** (Ibrahim, v78). Before, every cell jumped to the workspace.
  Now the Admin's drawer calls the Boss's OWN `openDoc` (handed over by app.js — one engine, they cannot drift): amount
  → its box, or the clause beside the transfer(s) + strip once money came in; date → its box; «مسدد» → the transfer;
  note → its text + source. The installment column is a plain label. Only «فتح العقد» opens the workspace.
- 2026-11-13 · **Search, round 2 — the Boss's motion** (Ibrahim, v77). Left → right in both languages: the box on
  the left, the filters on the right; the month filter IS the Boss's calendar (year + 12 months + «هذا الشهر») plus
  «كل الأشهر». Results: FIRM (closed, its name only) → its CONTRACTS (closed: number · paid of total · matches ·
  worst status) → a contract opens the Boss's own drawer (same classes: columns القسط · المستحق · تاريخ الاستحقاق ·
  الحالة · ملاحظة, chips, late edges); matched installments get a blue frame. Every cell opens the workspace at that
  installment; «العقود» returns with the firm, contract and month still open. Admin-only click names (the Boss's
  handlers listen page-wide).
- 2026-11-13 · **Admin search BUILT** (v74; Ibrahim: "search first — the payment lives inside it"). The Admin's home
  is now the search: one box (contract number · firm · amount, Arabic digits fine · note text · file name) + month/year
  filter (only months that hold installments) + firm filter; «عقد جديد» beside it. Results = contracts with closed
  drawers (your own first, then the demo's): number · firm · «مسدد X من Y» · how many installments matched · the
  contract's worst status (a late part-payment counts as late). A drawer = the WHOLE schedule with live statuses (#,
  due date, amount, status + days, note), the matching rows marked in blue; «فتح العقد» + the signing date. Clicking a
  row opens the workspace with that installment's box in view; «العقود» returns to the same search (filters + open
  drawer kept for the session). The workspace now opens ANY contract (demo ones read-only; references/notes may be
  added to them; their values stay locked). New `calc.instStatus` (one installment's state today) — golden test:
  equals its month row for every demo installment (13/13). Next: «تسجيل دفعة» inside the drawer, then «تعديل».
- 2026-11-13 · **Admin slice 3 designed — Search · Payment · Edit** (Ibrahim + Claude; AGREED-not-built).
  **Search** = the Admin's home: one text box (firm · contract number · amount · note · file name) + TWO filters —
  **month/year** (contracts with ≥1 installment due in that month) and **firm**. Results look like the Boss's:
  contracts with closed drawers; opening one shows its **whole schedule** (the month's installments highlighted).
  Empty search → drafts, then recently changed. **Each contract has two buttons: «تعديل» · «تسجيل دفعة».**
  **«تسجيل دفعة»** (cash application, the standard): amount received · **date received** (dd/mm/yyyy, ≤ today) · bank
  ref · **receipt (mandatory — «حفظ» stays off without it; no draft payments)** → the app splits it **oldest unpaid
  first** across the contract's installments (future ones too = paid early); the Admin may change the split. Gate:
  split = amount received exactly; no installment gets more than it still owes. One transfer = one record = one
  receipt. After save: the schedule shows the new statuses; the Boss sees «مسدد» (proof on the status) or «مسدد
  جزئياً» (proof beside the clause on the amount) — the existing click map. **Corrections never overwrite**: a wrong
  payment is reversed (voided, kept) and entered again. **«تعديل»** = the same workspace, filled; on a finished
  contract: a short reason (ideally a reference document); no removing an installment that has money on it; an
  installment never below what is already paid on it; Σ installments = total still holds; every edit logged → a
  «السجل» history tab. Build order: payment → search → edit + history.
- 2026-11-13 · **The total can be removed** (Ibrahim: the installments had «إزالة», the total did not). The total's
  form now has «حفظ · إلغاء · إزالة»; removing clears `total_cents` / `total_anchor_id` / `total_source` (logged
  36,000 → empty; nothing deleted), the side shows «لم يُحدَّد بعد» and the next box defaults to the total again.
  Drafts only (a finished contract's schedule is locked). v72.
- 2026-11-13 · **«إعادة رسم المربع» — fix a box drawn in the wrong place** (Ibrahim). Every saved box's form (total ·
  instalment · reference · note) has the link; press it → the old box fades (dashed) and a banner asks for the new
  drag (Esc / «إلغاء» = back to the form, nothing moved); the form reopens on the new box with its values kept and
  says the move waits for «حفظ». Save → same anchor, new place (`store.moveAnchor`, logged before → after); Cancel
  keeps the old box. One box shared by amount + date moves for both. v71.
- 2026-11-13 · **Standard statuses (DPD practice)** (Ibrahim: "Go do it"). Late now begins the day AFTER the due date —
  no more «مستحق + days» until the month ends (that rule from 2026-11-12 is superseded; it treated equal lateness
  unequally: due 1 Nov stayed «مستحق» 29 days, due 30 Nov flipped after 1). Statuses: «غير مستحق بعد» (silver) ·
  «مستحق اليوم» (brighter silver, ringed) · «متأخر · n يوم» (light red 1–30 days, dark red 31+, by aging bucket) ·
  «مسدد جزئياً» (yellow, + days when late) · «مسدد» (green). Rows carry `dpd` + `bucket` (0–4: 1–30 · 31–60 · 61–90 · 90+)
  — ready for the later aging report. Firm chip = worst row; a late partly paid row counts as late there (its own row
  stays yellow) so a firm far behind never looks calm. Sky unchanged (268,000 / 75,000 / 193,000). 12/12 golden
  (new: the day-before / due-day / day-1 / bucket-boundary test). v69.
- 2026-11-13 · **One clock — today — for every month** (Ibrahim: "what pros do, do it"). Before, a past month was frozen
  at its last day, so an installment due 15 Oct and unpaid read «مستحق · 16 يوماً» in October but «متأخر · 29 يوماً»
  in November. The collections practice: status and days late belong to the installment and are counted to today;
  the month picker only chooses which installments you see. Now both months read «متأخر · 29 يوماً»; a past month's
  three words = what it asked for · paid so far · still owed today (still add up). Golden test "past months are
  frozen" replaced by two: one clock, and Ibrahim's exact case (11/11 pass). `calc.month` asOf = today.
- 2026-11-13 · **Date laws + the signing date** (Ibrahim): a contract is signed today or earlier (1/1/2099 is refused:
  «تاريخ التوقيع لا يكون بعد اليوم.»); an installment may fall due years ahead but never before the signing date
  (the same day is allowed — a down payment): «الاستحقاق لا يسبق توقيع العقد (…)». The Boss sees the signing date one
  click deep — the contract panel's header «العقد · وُقّع في 1 آب 2026» — no new column. Tabs: the group's «المراجع»
  title is gone; before any reference only «+ إضافة مرجع» shows; references carry a 📎 inside their frame. v68.
- 2026-11-13 · **Slice 2 polish** (Ibrahim, after testing, v66): (1) picking a place in «أين يظهر هذا المرجع؟» no
  longer flashes — the overlay stays, only the card's content changes (its fade was replaying on every pick);
  (2) the file tabs read like an editor: «العقد» is the main module on its own; the references sit in one framed group
  «المراجع n» (place names, no «مرجع ·» prefix needed), with «+ إضافة مرجع» closing the group; the open tab joins
  the page (top accent line, no bottom edge); the file name gives way before the tabs do.
- 2026-11-12 · **Admin slice 2 BUILT** (v60→63; `admin.js` · `admin.css` · `store.js` · `app.js` click map). As designed below, plus:
  the reference tabs read «مرجع · <place>» (two tabs both called «العقد» were confusing); «الحالة» is shown in the
  «where» list but disabled until the payment slice; references and notes can be added to a FINISHED contract too
  (installments stay locked; a date reference may move a due date — the schedule then renumbers by date, logged);
  an amount reference changes the value only while the contract is a draft (the Σ = total gate). Verified in the
  pane: split amount/date boxes → Boss amount → amount box, date → date box beside the amendment, contract number →
  contract beside the annex; a missing date box falls back to the amount box; demo rows unchanged; 10/10 golden.
- 2026-11-12 · **Admin slice 2 designed — references + include switches** (Ibrahim, after testing slice 1; AGREED, built same day).
  Rule: *the Boss sees exactly what the Admin prepared; every cell of his row leads to its own highlight.*
  1. **Include switches** in the instalment form: «المبلغ» ☑ «التاريخ» ☑ (both on by default). Both on → this box shows
     both. One on → the box shows only that part; the other part gets its own box later (the form offers "for instalment
     N" for instalments still missing that part). Values (amount + date) are always typed; a part with no box shows
     «بلا تظليل» on its row (soft, does not block «إنهاء العقد»). The total stays as it is (one number, one box).
  2. **Boss click follows the Admin's setup**: amount → the amount box; date → the date box (the same box when both
     were switched on). If a part has no box, it falls back to the instalment's other box.
  3. **References**: the drop zone takes the contract first; then a «+ إضافة مرجع» sits beside the contract's file.
     Drop a reference → «أين يظهر هذا المرجع؟»: العقد · مبلغ القسط · تاريخ القسط · الحالة · الملاحظات (+ which
     instalment, when it is not «العقد»). Then the Admin highlights on the reference (a tab per file above the document:
     «العقد · مرجع 1 · +»). Boss: clicking that cell opens **side by side** — the contract's clause beside the
     reference's highlight (same compare view as clause + transfer). E.g. an amendment on «العقد» → the Boss clicks the
     contract number and sees contract | amendment. A reference that changes a value (a moved date) comes with an edit of
     that value in the same form (logged).
  4. **Notes**: reference → «الملاحظات» → the Admin types the note and highlights its source; the Boss clicks the note
     → that highlight. (Claude's proposal: the instalment picker includes «العقد كله» = shows on every row; to confirm.)
  5. **«الحالة» = a payment** (Claude's flag): status is computed from money received, so a reference placed on status
     is a transfer and asks amount received · date · bank ref → this IS the payment slice, through the same «+» door.
  Data (to apply when built): installments `anchor_id` → `amount_anchor_id` + `date_anchor_id` (may be equal);
  documents gain `kind = outside` rows linked to a contract; a reference link = document + anchor + target
  (`contract` | `amount` | `date` | `status` | `note`) + `installment_id` (optional). Build order: switches → «+»
  references (contract · amount · date) → notes → status/payment.
- 2026-11-12 · **Admin slice 1 «إضافة» built** (`assets/admin.js` · `admin.css` · `store.js`, v=58). Home = «عقد جديد» + drafts
  (hidden from the Boss) + recently finished. New contract = firm (pick, or type a new one; matched case-free) · number
  (must be unique) · signed on (optional) · the PDF (page count read = proof it opens). Workspace = schedule left, the
  contract right (the Boss's own viewer engine). Drag a box around a clause → a form beside it (total, or installment
  date + amount + optional note) → save; numbered boxes stay on the pages, click one to edit or remove it (kept as
  voided, logged). Range counter (Admin only) «40,000 من 60,000» + bar, silver → green on match, red when over.
  «إنهاء العقد»: match → active, the Boss sees it; gap → blocked with the numbers; no total → "does the contract state no
  total?" → finishes on the sum. **Dates are typed day/month/year** (not the browser's date box, which shows mm/dd on
  many machines) and read back in words under the box. Gate = `calc.scheduleCheck` (golden test #10). Demo layer: the
  Admin's rows live in this browser (localStorage + the files in IndexedDB) beside `data/demo.js`, which is untouched —
  phase B swaps `store.js` for Supabase. PDF only for now (Word/images → PDF on upload comes with phase B).
- 2026-11-12 · **Contract total = a highlighted clause** (Ibrahim): the Admin highlights the total like any
  installment (same form, type «المبلغ الإجمالي»), no separate total field up front. On «إنهاء العقد» the
  system checks Σ installments = total. Equal → contract finishes and reaches the Boss. Not equal → it does
  not finish unless the difference is **documented** (exact flow to be designed later). No total in the
  contract → finishes on the sum. Until finished it stays a draft, invisible to the Boss. Start order:
  **Add** (contract workspace) first, Search after.
  Admin-only **range counter** beside the schedule once the total is set («60,000 من 80,000»); the total is
  best highlighted first (the workspace suggests it), but any order works. A gap at the end = an Admin
  mistake to fix OR a documented explanation. Later step: a short list of known reasons (advance/prepaid ·
  VAT · retention · other) so every gap reads the same way.
- 2026-11-12 · **Calm glide** (Ibrahim, cosmetic): the viewer's scroll is our own eased glide (ease-in-out cubic),
  time scaled to distance (≈0.45 s → 0.9 s), the same on every browser — replacing the browser's own "smooth".
  Same destinations and rules. A wheel/touch/click on the document stops it at once; a new click glides from
  wherever it is; "reduce motion" → straight there. Measured: contract top → date page lands on 772 in ≈0.6 s,
  soft start (12 px at 140 ms), soft settle (770 at 576 ms), never backwards. `glide()` in `assets/viewer.js`; `?v=53`.
- 2026-11-12 · **Viewer continuity, corrected** (Ibrahim): the scroll is AS BEFORE, plus the smart parts. Every click
  goes to its full place — the contract → its top (also after scrolling down); a clause/transfer → its page with
  the highlight ~30% down (also after scrolling away) — never a minimal "just one line" scroll. Smart parts only:
  the document is never redrawn; no move when already at that place (re-click); same page and the new highlight
  already in view → just switch it. Measured: contract → 0; scroll 500 + contract → 0; date → 772 (30%); again →
  772; other line same page → 772 (switch); scroll to 0 + date → 772; contract → 0; no redraw. `?v=52`.
- 2026-11-12 · (superseded) **Viewer continuity** (Ibrahim): move from where the reader already is. Within the same view and the
  same document nothing is redrawn: same spot → nothing moves; same page / already visible → the highlight just
  switches; out of view → scroll only the distance needed (measured: page 1 → clause on page 2 scrolled 338 px,
  a fresh open would jump to 772). Switching side-by-side ↔ single, or another document → fresh start on the
  highlight (Ibrahim: "from the top, no problem"). The side-by-side columns stay when already side by side.
  The document is remembered as soon as its pages are laid out (before painting), so a quick second click never
  forces a redraw. All in `assets/viewer.js` (`renderDoc` memo + `focus`); `?v=51`.
- 2026-11-12 · **The click map, final (Ibrahim): owed beside paid.** Rule: *a payment proof is never shown without the
  clause it pays*, and *a status is clickable only when it is a claim with a document behind it — «مسدد»*.
  Reference → contract · Date → contract at the highlighted instalment · **Amount** → if money came in: the clause
  and the bank transfer(s) **side by side** (each highlighted), under a summary strip «القسط · سُدِّد · متبقٍ»;
  if not: the clause · **Status** → only green «مسدد» is clickable → its transfer(s), with the same strip
  (متبقٍ 0); every other status is a plain state · Note → note + source. The overdue partial row reads
  «10,000 من 20,000» under «المستحق»; the chip stays «متأخر · n» (no «جزئياً», no bar). Viewer: new side-by-side
  mode (two columns, each scrolls to its own highlight, transfers as tabs when several; stacks on phones,
  full width). Verified: Northwind partial row → clause «Installment 2 … 10 October» ↔ transfer «USD 10,000»;
  Contoso paid chip → transfer + «متبقٍ 0»; Fabrikam in-month partial → side by side; AR/EN; phone. `?v=49`.
- 2026-11-12 · **Status colours: five states, five colours** (Ibrahim). Due → **silver**; Due past its date but still
  inside its month (مستحق · n days) → **light red**; Overdue (the month closed with money owed) → **dark red,
  solid pill** (text #FFE2DE on #C42B2B @ 62%); Partly paid → **yellow** (#F2C94C, late or not); Paid → **green**.
  Before, Due-late and Overdue shared one light red, and late partial payments turned red. The overdue rows'
  tint/edge follow the dark red; a firm whose worst row is Due-late shows light red in Level 2 too. Rule
  confirmed with Ibrahim: inside its month a late instalment stays «مستحق» (+ n days); after the month it is
  «متأخر» (+ n days, counted from the original due date). Tokens in `boss.css`; `?v=47`.
- 2026-11-12 · **Boss view round 4 — the contracts table as a clean, framed card** (Ibrahim's notes + research on
  schedule tables). The open firm becomes one panel; its contracts sit in an inset card with a full 1 px border
  (level 3 visibly separate from level 2). Columns and headers CENTRED on fixed tracks (header ↔ rows 0 px
  off); amounts in a centred fixed-width block with digits right-aligned (same right edge in every row).
  «متأخرات» removed: overdue rows carry a soft red tint + a thin red edge on the reading side. Dates in the
  drawer: **dd/mm/yy** (10/11/26), with «يوم / شهر / سنة» (EN «dd / mm / yy») set small under the column
  header; the long date stays in the document panel and tooltips. **Clickable = framed**: every value that
  opens its proof (contract, clause, receipt, note) has a visible frame and a small document mark — seen
  without hovering; hover only brightens it; clickable status chips get a ring + the mark, plain ones don't.
  Phone: reference keeps its width, the amount takes the rest (no overlap). All five clicks verified to open
  their documents. `?v=46`.
- 2026-11-12 · **Boss view round 3 — the drawer's column header** (Ibrahim: «هذا الشهر» wastes space; header ↔
  columns not clear enough). The «هذا الشهر» label is removed — this month's rows are the default and sit right
  under the header; only «متأخرات» keeps a label (it is the exception). Header, per data-table practice: its own
  band (surface-2), weight 600 in full text colour, a firmer rule under it; every label fills its cell and is
  aligned exactly like its data (amounts right, the rest left); a hairline in the middle of each column gap.
  Root cause of the confusion: «المستحق» (right-aligned over numbers) and «تاريخ الاستحقاق» (left-aligned over
  dates) stood 32 px apart with nothing between, so they read as one phrase — the divider splits them.
  Measured: every label shares its column's edge in every row (AR and EN), dividers at the exact gap centres;
  phone keeps the two-line rows (no header), no overflow. CSS in `boss.css` only; `?v=43`.
- 2026-11-08 · **Boss window readability** (Ibrahim: "clear, calm, yet has brightness; no forced black"):
  own layer `assets/boss.css`, scoped to `body:not(.signing)` so sign-in is untouched. Base moved from
  near-black `#0C1724` to a lit dusk slate (`#18263A`, gradient from `#1E3049`); near-white text
  `#F3F6FA`; the three numbers on one card (500 weight, up to 66 px); firms on one card; status = tinted
  pill + word; sizes 17–22 px for names, cells and amounts (labels ≥ 14 px). Every text/surface pair
  measured ≥ 4.72:1. The list answers to its own width (container queries), so with the document panel
  open the drawer switches to two-line rows instead of colliding.
- 2026-11-12 · Sign-in round 20b — Ibrahim: ق in the middle of the word. The kashida is now split on both
  sides of ق («صـــقـــــر», 3 + 5 — ص is wider than ر) and the script picks the split that centres ق
  (1.2% of the width off) while filling the original box; ق lines up with the K of SAKER below.
- 2026-11-12 · Sign-in round 20 — **lettering rebuilt from real fonts (no more faceted letters).** Root cause: the
  lockup was an auto-trace of a small picture — every curve a chain of short straight segments on a whole-number
  grid of the 496-unit box (SAKER letters only 28 units tall), so S/R/ص/ق/ر rendered faceted, the baseline
  stepped. `tools/make_wordmark.py` re-sets the lettering from SIL-OFL fonts already on this machine: Arabic
  Noto Kufi Arabic Bold, shaped by HarfBuzz (correct joining) with 8 kashida like «صقـــر»; Latin Noto Sans
  Regular, tracked evenly to the original width — same boxes, same weights balance, one shape per word (no
  seams). The falcon and the rule lines are the originals (falcon is angular by design). Writes
  `brand/saker-lockup.svg`, `brand/saker-wordmark.svg` and the inline `.si-mark`; the traced originals are in
  `brand/_traced/`. Checked at 3× and at real size on desktop (361 px) and phone (242 px at 3× density).
- 2026-11-12 · Sign-in round 19 — **controlled visibility (tonal pass vs the original SAKER image,
  `_guide/vibe-reference-d.webp`).** Design review: keep shapes, palette, mesh, composition; the gap is tonal.
  Measured ladder (lum, own horizon): far 75→52 (orig 37), mid 59→34 (32), near 49→26 (19), foreground
  31→16 (14); ridge pixels >110: 7.1%→1.8% (0.6%); sky unchanged. Changes: a dark **veil** on the land only
  (`veil` 0.38, stronger near the eye), **selective crest light** (a few wide patches + the right side under the
  shaft; elsewhere `crestRest` 0.08), mesh −30% (understated), softer pool crests, fog 0.0010, mist 0.24; the
  dome arc almost invisible (0.18; ticks 0.26; sweep 0.28) so the falcon owns the calm dark sky. Posters
  re-rendered (LOOK `look-26`), cold first visit still poster at 81–131 ms, poster≈live diff 1.2–2.0.
- 2026-11-12 · Sign-in round 18 — **every visit loads clean, first visit included (the pro "poster" recipe).**
  Ibrahim: no "open it twice" — every user, every time. Pros (video/WebGL heroes, LCP guidance): ship a
  poster that IS the first frame, preload it with high priority, paint a tiny inline blurred placeholder
  first, fade the live layer in over it. Built: 25 posters (`brand/posters/`, 25–70 KB each, one downloaded
  per visit) rendered from the live scene by `_guide/make-posters.html` (shapes ≈4–5% apart: wide 0.85→2.37,
  tall 0.45→0.75); `tools/inline_posters.py` inlines the manifest + 6 tiny placeholders (6.6 KB) into
  `<head>`, which picks this screen's poster and preloads it before the stylesheets. Placement: the land
  scales with the screen's width around the horizon, so the poster is width-scaled and pinned on the
  horizon (widest poster not wider than the screen). The phone layout became width-proportional (identical
  at 390 and 768 px) so one poster fits every phone width. Logo/fields wait for their place (no jump).
  Measured on a cold first visit: poster on screen at 73–131 ms; poster vs live first frame mean difference
  1.25–2.1 /255 on 1536×790, 1920×970, 1280×1000, 412×839, 360×740, 820×1180 (was 6.2 for in-between shapes
  before the width rule). Repeat visits still use the device's exact remembered frame. LOOK `look-25`, `?v=33`.
- 2026-11-12 · Sign-in round 17 — **opens near-instantly.** Measured the open timeline: Google Fonts CSS blocked the
  first paint (352 ms), the scene started on a 30 ms timer, and the whole ground faded in over 1.2 s — plus an
  old rule in `app.css` (1.4 s fade + a brightening filter on any ground image, which made the remembered frame
  brighter than the live one). Now: fonts load in the background (`preload` → stylesheet, system font until
  then); a one-line head script marks `boot-signin` when there is no session so the header never flashes; the
  scene starts in the same task as `show()`; the ground has no fade and the remembered frame no filter; the live
  land fades in 200 ms over it (500 ms on a first visit); logo/fields rise in 380 ms, dome in 0.9 s. Result:
  remembered frame in the page at **55–89 ms** after opening (was ≥ 1.6 s to full picture); signed-in users go
  straight to the Boss view (checked). QA marks: `performance.mark('saker:still' | 'saker:live')`. `?v=27`.
- 2026-11-09 · Sign-in round 16 — **less blue, back toward silver; the light shaft now resonates.** Ibrahim: round 15
  too blue. Colour grade set half-way between neutral and Ref C (shadows keep a little red, blue trimmed ~5%),
  slate albedo, silver crest lines/mesh/shaft. The top-right shaft is one shared function (`BEAM`: `beam()` in
  the air, `pool()` where it lands) used by both shaders: the land lights up softly where the shaft lands
  (stronger on slopes facing it + brighter crest lines there), and the whole shaft + pool **breathe** once per
  `breathSec` (9 s). The falcon follows the same breath: `--beam` (0…1) set on `#signin` from the frame loop →
  `.si-mark` gets a glow from the top-right side + brightness ×1.12 at the peak; its silver fill is now lit
  diagonally from the top right. Colour: land median 22/36/51 (round 15: 13/34/56). Cost: land ~45 ms once,
  frame 0.8 ms; phone 140 ms, 0.5 ms/frame, 46 MB. `?v=24`, LOOK `look-24`.
- 2026-11-09 · Sign-in round 15 — **colour + relief to Reference C.** Measured RGB profiles (sky, band, mid land,
  foreground, land percentiles): ours had too much red in the shadows (R/B 0.33–0.37 vs 0.21–0.30 → slightly
  purple) and duller highlights. Added a final colour grade (shadows lose red, highlights gain silver-cyan) and a
  deeper sky top. Far dune rows now rise into ridges (extra height beyond z≈100) and the open valley is gentler
  (valleyDepth 0.82): ridges rise on both sides, the middle stays open. Result: sky top 9/24/43 vs ref 8/22/38,
  foreground 12/30/50 vs 12/30/48, middle 36/63/89 vs 41/65/87; blue tint now matches in all 7 zones.
  Cost unchanged (land ~50 ms once, frame 0.7 ms; phone 129 ms, 0.9 ms/frame, 46 MB). `?v=22`, LOOK `look-22`.
- 2026-11-09 · Sign-in round 14 — **texture to Reference C** (`_guide/vibe-reference-c.webp`; `-d` = same scene
  with logo + beam). Root cause of the remaining "pixelated ground": the contour roads (every 3rd height line)
  smear into broken, dashed streaks on gentle slopes seen at a grazing angle, plus a noise grain on the
  surfaces that sparkles at a distance. Replaced by: a **mesh draped on every surface** (two sizes, each fading
  out before it gets finer than a few pixels), **smooth matte surfaces** (noise removed), **back light from the
  horizon** (dune tops catch it, slopes facing us fall dark → readable layers), **crisp crest lines** (edge
  light where the surface turns away), stronger **aerial haze** (fog 0.0014), steel-navy colour, dune rows on a
  slant. Fiber roads kept for the moving light. vs Ref C: **20/28** (misses are mostly the intended beam).
  **Startup photo removed:** each device remembers its own last finished frame (`localStorage`, key carries
  `LOOK` + size; bump `LOOK` when the look changes) and shows it under the canvas → reload shows an identical
  picture (mean diff 0.9/255); first visit = dark sky, land fades in. The old photo is only the no-GPU fallback.
  Cost: land 48 ms once, frame 0.9 ms; phone 124 ms once, 1.6 ms/frame, 46 MB. Assets `?v=20`.
- 2026-11-09 · Sign-in round 13 — **pixelation removed.** Three causes, three fixes: (1) rings on the hills = the
  ray's hit point sat a stepped amount above the ground → the hit is now snapped onto the surface before
  lighting; (2) stair-step hill edges = land drawn 1.4× and read back with one sample → drawn up to 1.8× and
  read with 4 samples per pixel (rotated grid); (3) beaded traces = the light's position along a road stored
  in 256 steps + hairlines thinner than a pixel → data image is half-float (EXT_color_buffer_float, byte
  fallback) and road lines have a soft profile. Phones get a lower cap (`maxLandPixelsTouch`). Measured:
  desktop land 57–115 ms once, animated frame 0.7 ms GPU, 96 MB; phone 110 ms once, 5 ms/frame, 46 MB.
  New QA hook `SakerTerrain.lightBench()`. Assets at `?v=16`.
- 2026-11-09 · Sign-in round 12 — **animation made visible.** Measured: only 0.05% of pixels changed over 5 s,
  all on a few contour hairlines at the horizon (the low near dunes cross almost no contours), so it read as
  "no animation". Added **fiber roads** that wind from the viewer into the depth (`fiber` in the land shader;
  light runs along them away from the viewer), traces now on most lines with a bright head + soft tail,
  8–14 s cycle; nodes larger, denser, deeper breathing. Moving area 0.05% → **0.7%** (≈15×), across the whole
  land; land draw 77 ms (was 72). Also found the browser serving a **cached old terrain.js** — all assets in
  `index.html` now carry `?v=N` (bump N on every change; now 13).
- 2026-11-08 · Sign-in round 11 — **design handoff applied** (Reference B, `_guide/vibe-reference-b.png`).
  Landmark hills are placed from the handoff's SCREEN targets, projected back through the camera in JS
  (`LANDMARKS` / `landmarks()`): left crest x≈0.175W, right peak x≈0.86W rising 7% above the horizon,
  shoulder x≈0.765W; an open corridor keeps distant land low in the line of sight. Glow band behind the
  hills, micro-relief in the lighting, crease shading, sheen mainly on crests, finer near mesh, land
  supersampled 1.4× and filtered down (smooth edges). Animation per the handoff: nodes breathe on their own
  2.5–4 s rhythm; on about half the lines a short trace runs every 12–20 s; mist drifts over 64–86 s. Compile
  is non-blocking (KHR_parallel_shader_compile) with the still picture underneath until the live land fades
  in; the shader was slimmed (7 terrain call sites, no noise in the hills). The beam keeps its angle on any
  screen shape and stays in the corner on phones. Measured vs Reference B: 9/28 → **18/28**; 1400×788 land =
  72 ms; phone 1050×2274 = 131 ms, 23 MB. 50% overlay (`vibe-compare.html?ref=b&overlay=1`): landmarks align.
- 2026-11-08 · Sign-in round 10 — **ASVL Mode 2 vs the reference vibe.** QA page `_guide/vibe-compare.html`
  shows the reference (`_guide/vibe-reference.webp`) beside the live sign-in and reads the live GPU canvas
  pixel by pixel: 7 zones × 4 measures (brightness, contrast, blue tint, edge density) at the same
  resolution. Started 12/28 matching → **23/28**. Tone pass: dark charcoal land, flat near-black sky
  turning dark quickly above the horizon, a defined beam top right, calm near slopes (light and sheen
  rise with distance), cooler shadows, a finer mesh that thins with distance, low-lying mist. Tried and
  reverted: taller far hills (they covered the glowing horizon and closed the depth). Open residuals:
  horizon line density, near-left slope a touch bright, right-edge mountain darker than the reference.
- 2026-11-08 · Sign-in round 9 (Ibrahim: "the mountains are blurry"): three causes fixed. (1) The pixel
  cap (4.2 MP) made large screens stretch the image → raised to 6.5 MP (a 2560×1440 screen at 1.25× now
  draws 1:1). (2) Rays stopped slightly off the surface, so fine lines wobbled into rings → precise
  surface search (7-step refine) and a tighter hit test. (3) The mesh was height rings that smear on gentle
  slopes → a ground grid that follows the land and fades before it gets dense. Crisper shadows and
  crest light. Coming back to a hidden tab now resumes instead of redrawing the land. Measured:
  1600×950 = 30 ms GPU, 17 MB.
- 2026-11-08 · Sign-in round 8: **GPU landscape** (`assets/terrain.js`, WebGL2). Pass 1 ray-marches the
  rounded-dune layout per pixel (open valley ahead, low ranges at the sides), with moonlight from the top
  right, soft shadows, a silver sheen only on lit crests, fine mesh lines on the surface, distance haze
  plus valley mist, ACES tone mapping and vignette. It is drawn once per size in 12 bands and also
  stores the faint contour "roads" + nodes. Pass 2 (≤30 fps) adds pulses travelling along the roads,
  breathing nodes and grain. Measured: 1600×950 = 107 ms of GPU work in total (9 ms per band), 17 MB;
  phone 750×950 = 36 ms, 8 MB. Safeguards proven: `?still` forces the still picture (fallback works,
  canvas hidden); animation stops when idle (tested with 1 s), wakes on input, stops after sign-in;
  reduced-motion devices get one still frame. All tuning numbers live in `SETTINGS`. Colours are in linear
  light (converted for display at the end). Previous canvas version kept outside the project as a backup.
- 2026-11-08 · Sign-in round 7 (Ibrahim: "increase them, each dune seeable, with rounds and depth"):
  the land is now 11 separate rounded dunes, one behind another (each 1.42× further away), each crest
  swelling into mounds and dipping about once across the view, plus a taller mountain on the right.
  Lessons: dunes must **grow with distance** (near ones stay under the eye, far ones rise above the
  horizon and stack), must be **narrow enough to leave real hollows** (width 10% of distance), and
  far hills must be **a shade darker than the sky** with **mist in each hollow**, or the layers merge.
  Fewer, softer ridge edges (9), a soft light beam from the top right.
- 2026-11-08 · Sign-in round 6 (Ibrahim: "less high, more depth, light in the depth, semi-infinite"):
  dunes lowered and broadened, a crest term that repeats into the distance (layer after layer), view
  reaching z=1100, air that brightens with distance toward a glowing horizon, and only the ridges near
  enough to read are drawn. Rule learned: **the camera must stay above the highest dune** (camH 13 vs
  max ~11), or a near swell hides the depth.
- 2026-11-08 · Sign-in round 5: **3D terrain** replaces the photo (`assets/terrain.js`). A heightfield is
  seen through a perspective camera, each cell is shaded by slope and fogged by distance, the mesh follows
  the ground, and the ridges are the terrain's true silhouettes, carrying the fiber pulses and nodes.
  Drawn at the screen's own density (1600×950 for 1280×760 at 1.25×). Distinct bands, measured:
  sky top 33 · horizon band 95 · near/mid ground 24–27. **The horizon places everything**
  (`compose()`): wide screens use horizon 64% of height, dome R = min(horizon − 7.5%H, 34%W), logo
  height 0.5R centred 0.47R above the horizon, fields on the ground below it. Phones stack logo →
  fields → horizon, keeping the fields clear of the keyboard. Sign-in styles moved to their own
  `assets/signin.css`, because app.css was twice restored to an older copy by an unidentified
  writer (20:35:51, 20:37:16). The forked Boss session (`assets/boss.css`) confirmed it never wrote
  app.css. Ownership agreed by message: sign-in files belong to this session, boss.css to the fork.
- 2026-11-08 · Sign-in round 4: the small arc became a **horizon dome** like Ibrahim's reference: a
  circle centred on the landscape's horizon (measured at 70% of the image height), rising 64 px above the
  logo, fading into the hills, with a top tick and a tick crossing each side (`placeDome` in signin.js).
  Open: background sharpness at the root + real depth → proposal A (WebGL 3D terrain) vs B (AI upscale).
- 2026-11-08 · Sign-in round 3: **Ibrahim's landscape image** (`brand/signin-landscape.webp`, 1672×941,
  brightened ~16%) is the ground; a **live layer** on top: light pulses run along the 8 ridge rims traced
  from the image like data in a fiber, 13 traced dots breathe and flash when a pulse passes, two fog
  banks drift slowly. Trace = `assets/landscape-data.js` (fractions of the image, mapped with the same
  cover/bottom rule as the image; proof: brightness under the traced lines 161 vs 83 six px above).
  ~30 fps, pauses in background tabs, still frame for reduced-motion. Logo↔fields gap 112 px (84 phone).
- 2026-11-08 · Sign-in round 2 (Ibrahim): **only the logo + two rounded fields** (Email, Password; the
  words live inside the fields). No card, tagline, footer, help text or language switch; Enter or the
  arrow inside the password field moves on; an empty/wrong field only turns its own border red. The
  code step is one rounded field. **Background redrawn in code** (`signin.js` → `paintGround`):
  the identity image is natively only 1672 px wide, so enlarging it could never be sharp; the canvas
  is painted at the device's own pixel density (verified 985 px on a 1.25× screen, 750 px on a 2× phone).
- 2026-11-08 · **Sign-in screen built (UI only)**, the ICCMC way: UI first, wired in phase ⑤.
  "The falcon's perch": the identity landscape (`brand/landscape.webp`, cropped from the 4K image)
  as the ground, the calibration arc drawing itself around the silver lockup, the tagline
  «الرؤية من الأعلى · التفاصيل عند الطلب», a two-step form (email + password, then a 6-digit
  authenticator code; paste/autofill spreads across the boxes), no sign-up link (accounts are made by
  the Admin), and the footer «نظام خاص · كل دخول يُسجَّل باسم صاحبه ووقته». Demo accepts any details;
  sign-out button in the bar. `assets/signin.js`.
- 2026-11-08 · Boss view round 2 (Ibrahim's notes): month removed from the top bar; the month
  above the numbers is the lens (arrows + a month/year picker, today by default). **Data areas read
  left-to-right in both languages:** Sky = مستحق · مسدد · متبقي (left → right); Level 2 = Firm ·
  Due (middle) · Status (right); Level 3 = Contract · Amount due · Due date · Status · Note. Document
  panel always opens on the right. "Details" = one motion: the sky folds to its content and the firms
  rise in one by one right under the button. Clearer text and hairlines, softer 3/6 px corners.
- 2026-11-08 · **Boss view running on demo data** at `http://localhost:5757/Projects/Saker/` (build-mode
  switch Boss/Admin in the bar; Admin view = next section). November demo: 268,000 · 75,000 · 193,000.
- 2026-11-08 · **Execution order by section:** ① Foundation (skeleton · fake data · calculator ·
  theme) → ② Boss (contract viewer · 3 levels) → ③ Admin (Search · Add) → ④ Sign-in → ⑤ Real (B1–B7).
  The skeleton is approved-but-growable: the Boss screens may add fields, each logged here.
- 2026-11-08 · Admin edits directly + audit log (replaces reversing entries). Separate Admin/Boss
  views by login; a build-time switch to jump between them. Firm status = worst row. Side panel on
  the inline-end side. Western digits. Unfinished contracts hidden from the Boss.
- 2026-11-08 · Any contract format accepted; converted to PDF pages on upload (one viewer).
- 2026-11-08 · Theme "engineered calm": navy `#0C1724` + silver, muted status colors (sage paid ·
  steel-blue partial · brick overdue · silver due), IBM Plex Sans Arabic/Plex Sans, tabular
  numerals, hairline rules, 2–4 px corners, one 0.2 s slide. Logo vectors approved (mark ·
  lockup · wordmark); small icon redrawn in-house.
- 2026-11-07 · A1 drafted (`DATA-SHAPE.md`): 9 tables, contract lifecycle **draft → active**
  (activate only when Σ installments = total; active = locked), corrections as reversing payments.
- 2026-11-07 · Status iteration 1: Due (not clickable) · Partially paid and Paid (clickable → receipts)
  · Overdue · Nd in later months. **A status is clickable only if money came in.** Overdue with zero
  paid has nothing to click. The database accepts partial payments from day one.
- 2026-11-07 · Drawer: *This month* group first, *Overdue* group below; same five-column row for
  both; overdue Amount = what is still owed (+ small "of Y" when part was paid).
- 2026-11-07 · Carry-forward amount = the outstanding balance at the start of the month (opening
  balance); past months are frozen as-of their last day.
- 2026-11-07 · USD only · Arabic + English · one Admin · export deferred.
- 2026-11-07 · ROADMAP written. Iteration 1 scope frozen as above; Phase A starts at A1.
- 2026-11-07 · Line 3 + three locks (gate · guard · vault) on an own Supabase project. Renting an
  own server rejected unless a data-residency rule requires it: it buys independence, not privacy.
- 2026-11-07 · Interface first on a same-shape fake fridge; contract viewer built before the lists.
- 2026-11-07 · Notes may point to an outside document; that is iteration 1's way to record changes.
- 2026-11-05 · Highlighting is part of Admin preparation, done while reading the clause (one motion).
- 2026-11-05 · Amendments and notifications deferred to later iterations.
- 2026-11-05 · Age of overdue (DPD) shown on every red row.
- 2026-11-05 · Remaining = Total due − Paid = unpaid part of the dues; the three words always add up.
- 2026-11-05 · Unpaid installments carry forward as their own red line (AR aging); FIFO allocation.
- 2026-11-01 · The installment is the base unit; status computed. Three altitudes for the Boss.
