# Sharma P&L

Profit and loss by job for Sharma Electric & HVAC: billed revenue, material, labor, other cost,
profit and margin, with the 25% margin floor flagged. Static site for GitHub Pages
(`https://sharmaelechvac.github.io/sharma-pnl/`). Sister app: Sharma AR (`sharma-ar`).

## Where the numbers live

There are no numbers in this repo. The app reads one shared file at load:

    https://sharmaelechvac.github.io/sharma-ar/finance-data.json

That file lives in the **sharma-ar** repo (root, `finance-data.json`). Sharma AR reads `meta` +
`invoices`; Sharma P&L reads `meta` + `pnl`. One file, so the two apps always agree and nothing is
typed twice. To change a number, edit that JSON only. Never edit the code for numbers.

The URL is the `DATA_URL` constant at the top of `app.js`. If it can't be reached, the app tries
`./finance-data.json` (`FALLBACK_URL`). No copy ships here on purpose, so there is never a second
set of numbers to drift. Fetches use `cache: "no-store"`, so a reload always shows the latest file.

## What the app reads from `pnl`

- `pnl.jobs[]`: one row per job (filters, totals, profit bars, job cards).
- `pnl.months[]`: monthly totals by division (Month by month table). If empty, the table is added
  up from `pnl.jobs`. If a stored total doesn't add up, the app shows a "Check the data file" note.
- `pnl.marginFloor` (default 0.25), `pnl.sources`, `pnl.notes`.

Full field list: `SCHEMA.md` in the sharma-ar repo (shared schema v1, plus the `pnl.jobs` additions).

## Revenue basis: billed (accrual)

Sanjay's call, 2026-11-15: revenue is booked **when billed**, not when collected. The page labels it
"Billed revenue". The invoices in `finance-data.json` are the billed record, so:

- `pnl.months[].electrical.revenue` = sum of `invoices[].amount` where `trade` is `"electrical"` and
  `dateSent` falls in that month (same for `hvac`; `totals` = both). Retainage counts in the month
  the invoice was sent, because it is part of `amount`.
- `pnl.jobs[].revenue` = the billed amount on that job's invoices. `null` = not entered yet.
- Jarvis keeps the two consistent. If `pnl.months` revenue does not match the invoices sent that month,
  the page shows a "Check the data file" line naming the month and division.
- Collected cash is an AR question (`datePaid`), not a P&L number.

## Rules the page follows

- Cost TBD (`totalCost: null`) or billed revenue not entered (`revenue: null`): the job stays out of profit and margin until both are in.
- Under the margin floor is worked out by the app from revenue and cost; it is not stored.
- Empty file shows "No numbers loaded yet". Nothing is estimated.

## Files

    index.html        page shell
    styles.css        Sharma brand styles (navy / gold, Barlow Semi Condensed, Inter, IBM Plex Mono)
    app.js            loads the data file and draws the page
    assets/logo.png   Sharma Electric & HVAC horizontal logo
    assets/fonts/     self-hosted fonts

Design follows the Sharma app rules (flat panels, 1px borders, gold rule under headings, 4px
corners, 16px minimum text, 48px tap targets). Nothing ships until Mark (Design) signs off and
Sanjay approves.

## Publishing (how edits go live)

- Edit **`main`** only. GitHub Pages serves the `gh-pages` branch.
- `.github/workflows/publish.yml` runs on every push to `main`: it copies `main` onto `gh-pages`
  and publishes it. Live in about 1 minute. Never edit `gh-pages` by hand; it is overwritten.
- If Sanjay ever switches Settings > Pages to "Deploy from branch: main / (root)", the workflow
  and the `gh-pages` branch can be removed.
