/* Sharma P&L — reads the shared encrypted finance-data.enc.json (same file as Sharma AR),
   unlocked by lock.js. To change numbers, edit the data file only. Never put numbers in this file. */

// Single source of truth: the shared file published with the Sharma AR app.
const DATA_URL = "https://sharmaelechvac.github.io/sharma-ar/finance-data.enc.json";
// Used only if the data file has no pnl.marginFloor.
const DEFAULT_MARGIN_FLOOR = 0.25;

(function () {
  "use strict";

  const app = document.getElementById("app");
  const foot = document.getElementById("foot");
  const DIV_LABEL = { electrical: "Electrical", hvac: "HVAC" };
  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  const state = { div: "all", month: "all", onlyFlags: false };
  let DATA = null, SOURCE = "", FLOOR = DEFAULT_MARGIN_FLOOR, JOBS = [];

  // ---------- helpers ----------
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isNum = (n) => typeof n === "number" && isFinite(n);
  const money = (n) => !isNum(n) ? "unknown" : (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money0 = (n) => !isNum(n) ? "unknown" : (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
  const pct = (m) => m === null ? "unknown" : (m * 100).toFixed(1) + "%";
  const N = (s) => '<span class="num">' + esc(s) + "</span>";
  const monthLabel = (ym) => { const m = /^(\d{4})-(\d{2})$/.exec(ym || ""); return m ? MONTH_NAMES[+m[2] - 1] + " " + m[1] : ym; };
  // Square feet: optional livingSF / underRoofSF on the job (or its budget).
  // Only a real number counts; absent/null renders as "not on file". Never invented.
  const sfVal = (v) => {
    if (typeof v === "number") return isFinite(v) ? v : null;
    if (typeof v === "string" && v.trim() !== "") { const n = parseFloat(v.replace(/,/g, "")); return isFinite(n) ? n : null; }
    return null;
  };
  const fmtSF = (v) => { const n = sfVal(v); return n === null ? "not on file" : Math.round(n).toLocaleString("en-US"); };

  function marginOf(j) {
    if (!isNum(j.totalCost) || !isNum(j.revenue) || !(j.revenue > 0)) return null;
    return (j.revenue - j.totalCost) / j.revenue;
  }
  // Same rule as the old canvas: costed job with revenue under the floor gets "under" flag.
  function withFloorFlag(j) {
    const m = marginOf(j);
    return m !== null && m < FLOOR ? Object.assign({}, j, { flag: "under25" }) : j;
  }
  const noRev = (j) => !isNum(j.revenue);
  const isFlagged = (j) => j.flag === "under25" || j.flag === "tbd" || j.flag === "unassigned" || noRev(j);
  const FLAG_TEXT = { under25: "Under " + Math.round(DEFAULT_MARGIN_FLOOR * 100) + "% floor", tbd: "Cost TBD", unassigned: "Unassigned", costOnly: "Cost only" };
  function flagHtml(j) {
    if (!j.flag) return noRev(j) ? '<span class="flag tbd">Billed revenue not entered</span>' : "";
    const cls = { under25: "under", tbd: "tbd", unassigned: "unassigned", costOnly: "costonly" }[j.flag] || "costonly";
    const txt = j.flag === "under25" ? "Under " + Math.round(FLOOR * 100) + "% floor" : (FLAG_TEXT[j.flag] || j.flag);
    return '<span class="flag ' + cls + '">' + esc(txt) + "</span>";
  }

  // ---------- data ----------
  async function getJson(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(url + " returned " + r.status);
    return r.json();
  }
  async function load() {
    try { DATA = await window.SharmaLock.load(DATA_URL, { appName: "P&L", logo: "assets/logo.png" }); SOURCE = DATA_URL; }
    catch (e1) { return showError(e1); }
    const p = (DATA && DATA.pnl) || {};
    FLOOR = isNum(p.marginFloor) ? p.marginFloor : DEFAULT_MARGIN_FLOOR;
    // SF fallback: if a P&L job carries no livingSF/underRoofSF, take it from
    // that job's budget (budgets.jobs[], matched by jobId). Still absent = not on file.
    const budgetById = {};
    ((DATA.budgets && DATA.budgets.jobs) || []).forEach((b) => { if (b && b.jobId != null) budgetById[String(b.jobId)] = b; });
    JOBS = (Array.isArray(p.jobs) ? p.jobs : []).map((j) => {
      const b = budgetById[String(j && j.id)];
      if (!b) return j;
      const out = Object.assign({}, j);
      if (sfVal(out.livingSF) === null && sfVal(b.livingSF) !== null) out.livingSF = b.livingSF;
      if (sfVal(out.underRoofSF) === null && sfVal(b.underRoofSF) !== null) out.underRoofSF = b.underRoofSF;
      return out;
    }).map(withFloorFlag);
    render();
  }

  function filteredJobs() {
    return JOBS.filter((j) => {
      if (state.div !== "all" && j.division !== state.div) return false;
      if (state.month !== "all" && j.month !== state.month) return false;
      if (state.onlyFlags && !isFlagged(j)) return false;
      return true;
    });
  }
  function totalsOf(jobs) {
    // Billed revenue: jobs with revenue entered. Cost: every known cost.
    // Profit and margin: only jobs with BOTH billed revenue and cost entered.
    const rev = jobs.reduce((a, j) => a + (isNum(j.revenue) ? j.revenue : 0), 0);
    const cost = jobs.reduce((a, j) => a + (isNum(j.totalCost) ? j.totalCost : 0), 0);
    const both = jobs.filter((j) => isNum(j.totalCost) && isNum(j.revenue));
    const bothCost = both.reduce((a, j) => a + j.totalCost, 0);
    const costedRev = both.reduce((a, j) => a + j.revenue, 0);
    const profit = costedRev - bothCost;
    return {
      // Profit only means something once at least one job has billed revenue in.
      n: jobs.length, rev, cost, costedRev, profit, nBoth: both.some((j) => j.revenue > 0) ? both.length : 0,
      revKnown: jobs.some((j) => isNum(j.revenue) && j.revenue > 0) || !jobs.some(noRev),
      noRev: jobs.filter(noRev),
      margin: costedRev > 0 ? profit / costedRev : null,
      under: jobs.filter((j) => j.flag === "under25"),
      tbd: jobs.filter((j) => j.flag === "tbd"),
      unassigned: jobs.filter((j) => j.flag === "unassigned"),
    };
  }
  function allMonths() {
    const set = new Set();
    JOBS.forEach((j) => j.month && set.add(j.month));
    ((DATA.pnl && DATA.pnl.months) || []).forEach((m) => m.month && set.add(m.month));
    return Array.from(set).sort();
  }

  // ---------- render ----------
  function render() {
    const p = DATA.pnl || {};
    const months = Array.isArray(p.months) ? p.months : [];
    const hasData = JOBS.length > 0 || months.some((m) => m.totals && (m.totals.revenue || (m.totals.costs && m.totals.costs.total)));
    let h = "";

    h += '<section class="panel"><h1>Profit &amp; loss by job</h1>' +
      '<p class="sub">Billed revenue, material, labor, other cost, profit and margin for every job. Jobs under the ' +
      N(Math.round(FLOOR * 100) + "%") + " margin floor are marked.</p></section>";

    if (!hasData) {
      h += '<section class="panel empty"><h2>No numbers loaded yet</h2>' +
        "<p>The finance data file is in place but has no P&amp;L entries. Jarvis fills the shared data file; this page updates on the next load.</p>" +
        "<p>Nothing on this page is estimated. Blank means not entered.</p></section>";
      app.innerHTML = h; renderFoot(); return;
    }

    if (JOBS.length) h += filtersHtml();

    const jobs = filteredJobs();
    const t = totalsOf(jobs);

    if (JOBS.length) {
      h += headlineHtml(t) + alertHtml(t) + companyHtml(t) + barsHtml(jobs) + jobsHtml(jobs);
    }
    h += monthHtml(months);
    if (p.notes) h += '<h2>Notes</h2><section class="panel"><p style="margin:0">' + esc(p.notes) + "</p></section>";

    app.innerHTML = h;
    bindFilters();
    renderFoot();
  }

  function filtersHtml() {
    const opt = (v, l) => '<option value="' + esc(v) + '"' + (state.month === v ? " selected" : "") + ">" + esc(l) + "</option>";
    const tab = (v, l) => '<button type="button" data-div="' + v + '" aria-pressed="' + (state.div === v) + '">' + l + "</button>";
    return '<section class="panel filters" aria-label="Filters">' +
      '<div><span class="lbl">Division</span><div class="tabs" role="group" aria-label="Division">' +
      tab("all", "All") + tab("electrical", "Electrical") + tab("hvac", "HVAC") + "</div></div>" +
      '<div><label class="lbl" for="month">Month</label><select id="month">' + opt("all", "All months") +
      allMonths().map((m) => opt(m, monthLabel(m))).join("") + "</select></div>" +
      '<label class="check full"><input type="checkbox" id="onlyFlags"' + (state.onlyFlags ? " checked" : "") +
      "> Only flagged jobs (under floor, cost or revenue missing, unassigned)</label></section>";
  }

  function headlineHtml(t) {
    const scope = (state.div === "all" ? "Both divisions" : DIV_LABEL[state.div]) + " · " + (state.month === "all" ? "All months" : monthLabel(state.month));
    return '<section class="panel headline"><div class="k">Profit · ' + esc(scope) + "</div>" +
      '<div class="big">' + esc(t.nBoth ? money0(t.profit) : "unknown") + "</div>" +
      '<div class="sub">' + (t.nBoth ? "Jobs with billed revenue and cost entered. " : "Needs billed revenue and cost on the same job. ") + N(t.n) + " job" + (t.n === 1 ? "" : "s") + " in view.</div>" +
      '<div class="grid2">' +
      '<div><div class="k">Billed revenue</div><div class="v">' + esc(t.revKnown ? money0(t.rev) : "not entered") + "</div></div>" +
      '<div><div class="k">Cost (known)</div><div class="v">' + esc(money0(t.cost)) + "</div></div>" +
      '<div><div class="k">Margin</div><div class="v">' + esc(pct(t.margin)) + "</div></div>" +
      '<div><div class="k">Revenue not entered</div><div class="v">' + esc(String(t.noRev.length)) + "</div></div>" +
      "</div></section>";
  }

  function alertHtml(t) {
    const unAmt = t.unassigned.reduce((a, j) => a + (j.totalCost || 0), 0);
    const items = [];
    t.under.forEach((j) => items.push("Under " + Math.round(FLOOR * 100) + "%: " + esc(j.name) + " at " + N(pct(marginOf(j)))));
    t.tbd.forEach((j) => items.push("Cost TBD: " + esc(j.name)));
    t.noRev.forEach((j) => items.push("Billed revenue not entered: " + esc(j.name)));
    t.unassigned.forEach((j) => items.push("Unassigned material: " + esc(j.name) + " " + N(money(j.totalCost))));
    const lead = t.under.length ? "Margin floor breach" : t.unassigned.length ? "Unassigned material on the books" : t.tbd.length ? "Costs still missing" : t.noRev.length ? "Billed revenue still missing" : "Floor clear on costed jobs";
    return '<section class="panel alert' + (items.length ? "" : " ok") + '"><b class="lead">' + lead + "</b>" +
      (t.under.length ? "" : "No costed job under " + N(Math.round(FLOOR * 100) + "%") + ".") +
      (unAmt ? " Unassigned material total " + N(money(unAmt)) + "." : "") +
      (items.length ? "<ul>" + items.map((i) => "<li>" + i + "</li>").join("") + "</ul>" : "") + "</section>";
  }

  function kvRow(label, value, note) {
    return "<tr><th>" + esc(label) + (note ? '<span class="note">' + esc(note) + "</span>" : "") + "</th><td>" + N(value) + "</td></tr>";
  }
  function companyHtml(t) {
    const unAmt = t.unassigned.reduce((a, j) => a + (j.totalCost || 0), 0);
    return "<h2>Company totals</h2><p class=\"cap\">For the filters above.</p><section class=\"panel\"><table class=\"kv\"><tbody>" +
      kvRow("Billed revenue", t.revKnown ? money(t.rev) : "not entered", t.n + " job" + (t.n === 1 ? "" : "s") + (t.noRev.length ? " · " + t.noRev.length + " not entered" : "")) +
      kvRow("Total cost (known)", money(t.cost), "Jobs with cost entered only") +
      kvRow("Profit", t.nBoth ? money(t.profit) : "unknown", t.margin === null ? "Unknown until billed revenue and cost are both in" : pct(t.margin) + " of billed revenue on costed jobs") +
      kvRow(Math.round(FLOOR * 100) + "% margin floor", money0(t.costedRev * FLOOR), "Minimum profit on billed revenue of costed jobs") +
      kvRow("Under floor", String(t.under.length), t.under.map((j) => j.name).join("; ") || "None") +
      kvRow("Cost TBD", String(t.tbd.length), t.tbd.map((j) => j.name).join("; ") || "None") +
      kvRow("Billed revenue not entered", String(t.noRev.length), t.noRev.map((j) => j.name).join("; ") || "None") +
      kvRow("Unassigned material", money(unAmt), "Assign to a named job when known") +
      "</tbody></table></section>";
  }

  function barsHtml(jobs) {
    const rows = jobs.filter((j) => isNum(j.totalCost) && isNum(j.revenue) && j.revenue > 0)
      .map((j) => ({ j, p: j.revenue - j.totalCost, m: marginOf(j) }))
      .sort((a, b) => b.p - a.p);
    if (!rows.length) return "";
    const max = Math.max.apply(null, rows.map((r) => Math.abs(r.p))) || 1;
    return '<h2>Profit by job</h2><p class="cap">Jobs with billed revenue and cost. Highest first. Gold bar = under the ' + N(Math.round(FLOOR * 100) + "%") + " floor.</p><section class=\"panel\">" +
      rows.map((r) => '<div class="bar"><div class="bar-top"><span class="bar-name">' + esc(r.j.name.split(" — ")[0]) + "</span>" + N(money0(r.p)) + "</div>" +
        '<div class="track"><div class="fill' + (r.m < FLOOR ? " low" : "") + '" style="width:' + Math.max(1, Math.abs(r.p) / max * 100).toFixed(1) + '%"></div></div></div>').join("") +
      "</section>";
  }

  function jobsHtml(jobs) {
    let h = '<h2>Every job</h2><p class="cap">Tap a job for material, labor and other cost. Unknown means not entered.</p>';
    if (!jobs.length) return h + '<section class="panel"><p style="margin:0">No jobs match these filters.</p></section>';
    jobs.forEach((j) => {
      const costed = isNum(j.totalCost);
      const p = costed && isNum(j.revenue) ? j.revenue - j.totalCost : null;
      const m = marginOf(j);
      const meta = [j.date, DIV_LABEL[j.division] || j.division, j.houses ? j.houses + (j.houses === 1 ? " house" : " houses") : null,
        "Living SF: " + fmtSF(j.livingSF), "Under Roof SF: " + fmtSF(j.underRoofSF)].filter(Boolean).join(" · ");
      h += '<details class="job' + (isFlagged(j) ? " flagged" : "") + '"' + (isFlagged(j) ? " open" : "") + "><summary>" +
        '<span class="jname">' + esc(j.name) + "</span>" +
        '<span class="jprofit">' + (p === null ? '<span class="txt">' + (costed ? "Revenue TBD" : "Cost TBD") + "</span>" : N(money0(p))) + (m === null ? (j.revenue === 0 ? '<span class="pct txt">No revenue</span>' : "") : '<span class="pct">' + esc(pct(m)) + "</span>") + "</span>" +
        '<span class="jmeta">' + esc(meta) + "</span>" + flagHtml(j) +
        '<span class="chev"><span class="c-open">Show detail</span><span class="c-close">Hide detail</span></span></summary>' +
        '<div class="jbody">' + (j.detail ? "<p>" + esc(j.detail) + "</p>" : "") + (j.note ? "<p><b>Note:</b> " + esc(j.note) + "</p>" : "") +
        '<table class="kv"><tbody>' +
        kvRow("Living SF", fmtSF(j.livingSF)) + kvRow("Under Roof SF", fmtSF(j.underRoofSF)) +
        kvRow("Billed revenue", isNum(j.revenue) ? money(j.revenue) : "not entered") + kvRow("Material", money(j.material)) +
        kvRow("Labor (incl. meter labor)", money(j.labor)) + kvRow("Permit / other", money(j.other)) +
        kvRow("Total cost", money(j.totalCost)) + kvRow("Profit", p === null ? "unknown" : money(p)) +
        kvRow("Margin", m === null ? (j.revenue === 0 ? "—" : "unknown") : pct(m)) +
        "</tbody></table>" + (j.flag === "under25" ? '<p class="under-txt">Under the ' + N(Math.round(FLOOR * 100) + "%") + " margin floor.</p>" : "") +
        "</div></details>";
    });
    return h;
  }

  // Month summary: uses pnl.months when Jarvis has filled it; otherwise adds up the job list.
  function monthHtml(months) {
    const filled = months.filter((m) => m && m.month);
    let rows = [], from;
    if (filled.length) {
      from = "From the monthly totals in the data file.";
      rows = filled.slice().sort((a, b) => a.month < b.month ? -1 : 1).map((m) => ({
        month: m.month,
        lines: [["Electrical", m.electrical], ["HVAC", m.hvac], ["Total", m.totals]].map(([l, d]) => [l, d ? d.revenue : null, d && d.costs ? d.costs.total : null, d ? d.profit : null]),
      }));
    } else if (JOBS.length) {
      from = "Added up from the job list. Profit counts jobs with billed revenue and cost both entered. * = some billed revenue or cost still missing. TBD = not entered yet.";
      rows = allMonths().map((mo) => {
        const inMo = JOBS.filter((j) => j.month === mo);
        const line = (l, js) => {
          const t = totalsOf(js);
          if (!js.length) return [l, 0, 0, 0, false];
          return [l, t.revKnown ? t.rev : "TBD", js.some((j) => isNum(j.totalCost)) ? t.cost : "TBD", t.nBoth ? t.profit : "TBD", t.tbd.length + t.noRev.length > 0];
        };
        return { month: mo, lines: [line("Electrical", inMo.filter((j) => j.division === "electrical")), line("HVAC", inMo.filter((j) => j.division === "hvac")), line("Total", inMo)] };
      });
    } else return "";
    let warn = [];
    if (filled.length) {
      const near = (a, b) => isNum(a) && isNum(b) && Math.abs(a - b) < 0.005;
      filled.forEach((m) => {
        const L = monthLabel(m.month);
        [["Electrical", m.electrical], ["HVAC", m.hvac], ["Total", m.totals]].forEach(([l, d]) => {
          if (!d || !d.costs) return;
          if (!near(d.costs.total, (d.costs.materials || 0) + (d.costs.labor || 0) + (d.costs.other || 0))) warn.push(L + " " + l + ": cost total does not equal material + labor + other.");
          if (!near(d.profit, d.revenue - d.costs.total)) warn.push(L + " " + l + ": profit does not equal revenue minus cost.");
        });
        if (m.electrical && m.hvac && m.totals && !near(m.totals.revenue, m.electrical.revenue + m.hvac.revenue)) warn.push(L + ": total revenue does not equal Electrical + HVAC.");
        // Billed revenue should tie to invoices sent that month (by dateSent month and trade).
        const inv = Array.isArray(DATA.invoices) ? DATA.invoices : [];
        if (inv.length) {
          ["electrical", "hvac"].forEach((tr) => {
            const billed = inv.filter((i) => i.trade === tr && typeof i.dateSent === "string" && i.dateSent.slice(0, 7) === m.month).reduce((x, i) => x + (i.amount || 0), 0);
            if (m[tr] && !near(m[tr].revenue, billed)) warn.push(L + " " + DIV_LABEL[tr] + ": billed revenue " + money(m[tr].revenue) + " does not match invoices sent that month " + money(billed) + ".");
          });
        }
      });
    }
    let h = '<h2>Month by month</h2><p class="cap">' + from + '</p>' +
      (warn.length ? '<section class="panel alert"><b class="lead">Check the data file</b><ul>' + warn.map((w) => "<li>" + esc(w) + "</li>").join("") + "</ul></section>" : "") + '<section class="panel"><table class="mtab"><thead><tr><th>Division</th><th>Billed</th><th>Cost</th><th>Profit</th></tr></thead><tbody>';
    rows.forEach((r) => {
      h += '<tr class="mh"><td colspan="4">' + esc(monthLabel(r.month)) + "</td></tr>";
      r.lines.forEach(([l, rev, cost, prof, partial]) => {
        const cell = (v) => v === "TBD" ? N("TBD") : N(money0(v));
        h += "<tr" + (l === "Total" ? ' class="tot"' : "") + "><td>" + l + (partial ? " *" : "") + "</td><td>" + cell(rev) + "</td><td>" + cell(cost) + "</td><td>" + cell(prof) + "</td></tr>";
      });
    });
    return h + "</tbody></table></section>";
  }

  function renderFoot() {
    const m = (DATA && DATA.meta) || {};
    const src = ((DATA && DATA.pnl && DATA.pnl.sources) || []);
    foot.innerHTML = "<p>Numbers as of " + (m.asOf ? N(m.asOf) : "not set") + (m.updatedBy ? " · updated by " + esc(m.updatedBy) : "") + ".</p>" +
      "<p>Data file: <code>" + esc(SOURCE) + "</code></p>" +
      (src.length ? "<p>Sources: " + src.map(esc).join("; ") + "</p>" : "") +
      "<p>Same data file as Sharma AR. Sanjay sets every price.</p>";
  }

  function bindFilters() {
    app.querySelectorAll("[data-div]").forEach((b) => b.addEventListener("click", () => { state.div = b.getAttribute("data-div"); render(); }));
    const sel = document.getElementById("month");
    if (sel) sel.addEventListener("change", () => { state.month = sel.value; render(); });
    const cb = document.getElementById("onlyFlags");
    if (cb) cb.addEventListener("change", () => { state.onlyFlags = cb.checked; render(); });
  }

  function showError(e1) {
    app.innerHTML = '<section class="panel err"><h2>Could not load the numbers</h2><p>Could not read the shared data file. Check the connection and reload.</p>' +
      '<p class="sub">' + esc(e1 && e1.message) + "</p></section>";
  }

  load();
})();
