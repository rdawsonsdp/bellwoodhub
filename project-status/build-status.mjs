/*
 * build-status.mjs — regenerate the shareable status page from PM data + git activity.
 *
 * Inputs:  project-status/status.json  (PM-authored narrative)
 *          `git log`                   (recent activity — what you pushed)
 * Output:  project-status/index.html   (self-contained, deploy as static site)
 *
 * Style: classic "executive one-page status report" — navy + light-blue palette,
 * serif headings, a metadata header grid, an Executive Summary with numbered points
 * and overall-status cards, and navy section bars over light-blue-headed tables.
 *
 * Run by the .githooks/pre-push hook on every push, or manually:
 *   node project-status/build-status.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, "status.json"), "utf8"));

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Encode arbitrary text (incl. newlines) safely into a data- attribute.
const attr = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\n/g, "&#10;");
// A copy button — copies a Claude-Code-ready text block for an item.
const copyBtn = (text) => `<button class="copy" type="button" data-c="${attr(text)}" title="Copy for Claude Code" aria-label="Copy">⧉ copy</button>`;
const pillClass = { done: "s-done", "in progress": "s-prog", prog: "s-prog", pending: "s-pend", blocked: "s-block", "at risk": "s-risk", risk: "s-risk" };
const dotColor = { done: "var(--done)", prog: "var(--prog)", "in progress": "var(--prog)", pending: "var(--pend)", blocked: "var(--block)", risk: "var(--risk)" };

// ── recent activity from git (the "PM sees your pushes" part) ──
function gitActivity(n = 12) {
  try {
    const out = execSync(`git -C "${here}/.." log -n ${n} --pretty=format:'%h%x1f%ad%x1f%s' --date='format:%b %d, %Y'`, { encoding: "utf8" });
    return out.split("\n").filter(Boolean).map((l) => {
      const [hash, date, subject] = l.split("\x1f");
      return { hash, date, subject };
    });
  } catch {
    return [];
  }
}
const activity = gitActivity();
const stamp = (() => {
  try { return execSync("date '+%B %d, %Y · %H:%M'", { encoding: "utf8" }).trim(); } catch { return "—"; }
})();
const reportDate = stamp.split(" · ")[0];
// Reporting period = span of the commits shown (grounded in git, not invented).
const period = activity.length
  ? (activity[activity.length - 1].date === activity[0].date ? activity[0].date : `${activity[activity.length - 1].date} – ${activity[0].date}`)
  : reportDate;

// ── overall status cards (derived, not hand-set) ──
const healthy = data.blocker.class === "ok";
const overall = healthy
  ? { val: "Healthy", cls: "s-done", ic: "🟢" }
  : { val: "At Risk", cls: "s-risk", ic: "🟡" };
const demoBoard = (data.boards || []).find((b) => /demo/i.test(b.title));
const demoReady = demoBoard && demoBoard.rows.every((r) => r.s === "done");
const demoCard = { val: demoReady ? "Ready" : "In progress", cls: demoReady ? "s-done" : "s-prog", ic: demoReady ? "✅" : "🔵" };

// ── executive summary: headline + blocker as numbered points (HTML preserved) ──
const execPoints = [data.headline, data.blocker.text].filter(Boolean);
const execList = execPoints
  .map((p, i) => `<div class="exline"><div class="num">${String(i + 1).padStart(2, "0")}</div><div class="extxt">${p}</div></div>`)
  .join("");

// Glance / corpus cards drill down: each is a click-to-expand <details>.
const glanceCard = (c, dot) => c.d
  ? `<details class="card gcard"><summary><div class="k">${esc(c.k)}</div><div class="v">${dot}${esc(c.v)}</div></summary><div class="det">${esc(c.d)}</div></details>`
  : `<div class="card"><div class="k">${esc(c.k)}</div><div class="v">${dot}${esc(c.v)}</div></div>`;
const glanceCards = data.glance.map((c) => glanceCard(c, `<span class="dot" style="background:${dotColor[c.s] || "var(--pend)"}"></span>`)).join("");
const corpusCards = (data.corpus || []).map((c) => glanceCard(c, "")).join("");
const titleCell = (text, detail) => detail
  ? `<details><summary>${esc(text)}</summary><div class="det">${esc(detail)}</div></details>`
  : esc(text);
const boards = data.boards.map((b) => `
    <table class="board">
      <thead><tr><th colspan="2">${esc(b.title)}</th></tr></thead>
      <tbody>${b.rows.map((r) => `<tr><td class="main">${titleCell(r.t, r.detail)}</td><td data-label="Status"><span class="pill ${pillClass[r.s] || "s-pend"}">${esc(r.s)}</span> ${copyBtn(`${r.t} [${r.s}]${r.detail ? "\n\n" + r.detail : ""}`)}</td></tr>`).join("")}</tbody>
    </table>`).join("");
// ── issues/bugs, risks, dependencies ──
const sevPill = { critical: "s-block", high: "s-block", med: "s-risk", low: "s-pend" };
const depPill = { resolved: "s-done", pending: "s-pend", blocking: "s-block" };
const issuesTable = (data.issues && data.issues.length) ? `
  <h2>Issues &amp; bugs</h2>
  <table class="board"><thead><tr><th>ID</th><th>Item</th><th>Sev</th><th>Status</th></tr></thead><tbody>
  ${data.issues.map((x) => `<tr><td class="idc"><code>${esc(x.id)}</code> <span class="tag">${esc(x.kind || "issue")}</span> ${copyBtn(`[${x.id} · ${x.sev || ""} ${x.kind || "issue"}] ${x.title}\nStatus: ${x.status || "open"}${x.detail ? "\n\n" + x.detail : ""}`)}</td><td class="main">${titleCell(x.title, x.detail)}</td><td data-label="Severity"><span class="pill ${sevPill[x.sev] || "s-pend"}">${esc(x.sev || "-")}</span></td><td data-label="Status"><span class="pill ${x.status === "closed" ? "s-done" : "s-prog"}">${esc(x.status || "open")}</span></td></tr>`).join("")}
  </tbody></table>` : "";
const risksTable = (data.risks && data.risks.length) ? `
  <h2>Risks &amp; mitigation plan</h2>
  <table class="board"><thead><tr><th>ID</th><th>Risk</th><th>L×I</th><th class="hide-sm">Mitigation</th><th class="hide-sm">Owner</th></tr></thead><tbody>
  ${data.risks.map((x) => `<tr><td class="idc"><code>${esc(x.id)}</code> ${copyBtn(`[${x.id} · risk · ${x.like || "-"}×${x.impact || "-"}] ${x.title}\nMitigation: ${x.mitigation || ""}\nOwner: ${x.owner || ""}${x.detail ? "\n\n" + x.detail : ""}`)}</td><td class="main">${titleCell(x.title, x.detail)}</td><td data-label="L×I"><span class="pill ${sevPill[x.impact] || "s-pend"}">${esc(x.like || "-")}×${esc(x.impact || "-")}</span></td><td data-label="Mitigation" class="sm-row">${esc(x.mitigation || "")}</td><td data-label="Owner" class="sm-row">${esc(x.owner || "")}</td></tr>`).join("")}
  </tbody></table>` : "";
const depsTable = (data.deps && data.deps.length) ? `
  <h2>Dependencies</h2>
  <table class="board"><thead><tr><th>ID</th><th>Depends on</th><th>Status</th><th class="hide-sm">Owner / source</th></tr></thead><tbody>
  ${data.deps.map((x) => `<tr><td class="idc"><code>${esc(x.id)}</code> ${copyBtn(`[${x.id} · dependency · ${x.status || "pending"}] ${x.title}${x.on ? "\nOn: " + x.on : ""}${x.detail ? "\n\n" + x.detail : ""}`)}</td><td class="main">${titleCell(x.title, x.detail)}</td><td data-label="Status"><span class="pill ${depPill[x.status] || "s-pend"}">${esc(x.status || "pending")}</span></td><td data-label="Owner / source" class="sm-row">${esc(x.on || "")}</td></tr>`).join("")}
  </tbody></table>` : "";

const decisionsBlock = (data.decisions && data.decisions.length) ? `
  <h2>Decisions &amp; direction</h2>
  <ul class="log">${data.decisions.map((d) => `<li><code>${esc(d.id)}</code> — ${d.text}</li>`).join("")}</ul>` : "";

const activityRows = activity.length
  ? activity.map((a) => `<li><b>${esc(a.date)}</b> · <code>${esc(a.hash)}</code> — ${esc(a.subject)}</li>`).join("")
  : `<li>No git history yet — commits will appear here automatically on each push.</li>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(data.project)} — Project Status</title>
<meta name="robots" content="noindex" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
<link rel="manifest" href="/manifest.webmanifest" />
<meta name="theme-color" content="#16345f" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,500;6..72,600;6..72,700&family=Public+Sans:wght@400;600;700&display=swap" rel="stylesheet" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="Bellwood PM" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<style>
  :root{
    --navy:#16345f;--navy2:#1f4a86;--blue:#2e5aac;--blue-soft:#aac3ec;
    --band:#dce6f4;--band-line:#bcd0ec;
    --line:#dbe3ee;--ink:#1b2940;--muted:#4d5e78;--dim:#7d8aa0;
    --done:#1c8f5f;--prog:#2f6fd0;--pend:#6c7a8d;--block:#cf3a2c;--risk:#b07815;
    --accent:#1f4a86;--accent-soft:#2e5aac;
    --paper:#ffffff;--page:#e9eef5;--serif:'Newsreader',Georgia,'Times New Roman',serif;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--page);min-height:100vh;color:var(--ink);font:15.5px/1.66 'Public Sans',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-font-smoothing:antialiased;}
  .wrap{max-width:880px;margin:30px auto;padding:0 0 56px;background:var(--paper);border:1px solid var(--line);border-radius:8px;box-shadow:0 1px 2px rgba(20,30,50,.05),0 14px 44px rgba(20,30,50,.09);counter-reset:sec;overflow:hidden;}

  /* ── banner header (navy) ── */
  .banner{background:linear-gradient(120deg,var(--navy) 0%,var(--navy2) 100%);color:#fff;padding:30px 50px 26px;}
  .eyebrow{font:700 11px/1 ui-monospace,monospace;letter-spacing:.22em;text-transform:uppercase;color:var(--blue-soft)}
  .banner h1{font-family:var(--serif);font-size:30px;margin:11px 0 8px;font-weight:700;letter-spacing:-.01em;line-height:1.14;color:#fff}
  .banner .tagline{color:#d7e2f3;font-size:15px;max-width:720px;line-height:1.55}
  .actions{display:flex;gap:10px;margin-top:18px;flex-wrap:wrap}
  .actbtn{display:inline-flex;align-items:center;gap:7px;cursor:pointer;border:1px solid rgba(255,255,255,.34);background:rgba(255,255,255,.10);color:#fff;font:600 13px/1 'Public Sans',system-ui,sans-serif;padding:9px 15px;border-radius:7px;transition:background .15s,border-color .15s;-webkit-tap-highlight-color:transparent}
  .actbtn:hover{background:rgba(255,255,255,.2);border-color:rgba(255,255,255,.6)}
  .actbtn:active{transform:translateY(1px)}
  .actbtn .i{font-size:15px;line-height:1}
  .actbtn.ok{background:rgba(40,170,110,.95);border-color:transparent}

  .body{padding:30px 50px 0}

  /* ── metadata grid (Reporting period / Project title / …) ── */
  .reportmeta{width:100%;border-collapse:collapse;margin:0 0 34px;border:1px solid var(--band-line);font-size:13.5px}
  .reportmeta td{border:1px solid var(--band-line);padding:9px 14px;vertical-align:middle}
  .reportmeta .lbl{font-family:var(--serif);font-weight:700;color:var(--navy);background:var(--band);white-space:nowrap;width:1%}
  .reportmeta .val{color:var(--ink)}
  .reportmeta .val a{color:var(--blue);text-decoration:none}

  /* ── executive summary ── */
  .exectitle{font-family:var(--serif);font-size:25px;font-weight:700;color:var(--ink);margin:0 0 18px;border-bottom:3px solid var(--navy);padding-bottom:6px;display:inline-block}
  .execwrap{display:grid;grid-template-columns:1.55fr .95fr;gap:30px;align-items:start;margin-bottom:8px}
  .exec{display:flex;flex-direction:column;gap:16px}
  .exline{display:flex;gap:14px;align-items:flex-start}
  .num{flex:0 0 auto;width:30px;height:30px;border-radius:50%;background:var(--navy);color:#fff;font-family:var(--serif);font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 4px rgba(46,90,172,.13)}
  .extxt{font-size:14.5px;line-height:1.6;color:var(--ink)}
  .extxt a{color:var(--blue)}
  .statuscards{display:flex;flex-direction:column;gap:14px}
  .scard{border:1px solid var(--line);border-top:4px solid var(--navy);border-radius:9px;padding:16px 14px;text-align:center;background:#f6f9fe}
  .scard .ic{font-size:23px;line-height:1}
  .scard .lbl{font-family:var(--serif);font-weight:700;color:var(--navy);margin-top:7px;font-size:13.5px}
  .scard .val{margin-top:9px;display:inline-block}

  /* ── navy section bars ── */
  h2{font-family:var(--serif);font-size:18px;color:#fff;background:linear-gradient(120deg,var(--navy) 0%,var(--navy2) 100%);margin:38px 0 16px;font-weight:600;padding:9px 18px;border-radius:5px;letter-spacing:.005em;box-shadow:0 1px 2px rgba(20,30,50,.12)}
  h2::before{counter-increment:sec;content:counter(sec) ".\\00a0\\00a0";color:var(--blue-soft);font-weight:700}

  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:12px}
  .card{background:#f6f9fe;border:1px solid var(--line);border-left:3px solid var(--blue-soft);border-radius:8px;padding:14px 16px}
  .card .k{font-size:11.5px;color:var(--dim);text-transform:uppercase;letter-spacing:.05em;font-weight:700}
  .card .v{margin-top:6px;font-size:14.5px;font-weight:600;color:var(--ink)}
  details.gcard{cursor:pointer}
  details.gcard>summary{list-style:none;position:relative;outline:none}
  details.gcard>summary::-webkit-details-marker{display:none}
  details.gcard>summary::after{content:"+";position:absolute;top:-3px;right:0;color:var(--dim);font-size:17px;font-weight:400}
  details.gcard[open]>summary::after{content:"\\2013"}
  details.gcard:hover{border-left-color:var(--blue)}
  details.gcard .det{margin:11px 0 1px;font-size:13px}
  .copy{cursor:pointer;border:1px solid var(--line);background:#eef3fa;color:var(--dim);border-radius:6px;font:600 10px/1.5 ui-monospace,monospace;padding:1px 6px;margin-left:6px;white-space:nowrap;vertical-align:middle}
  .copy:hover{color:var(--ink);border-color:var(--blue)}
  .copy.ok{color:var(--done);border-color:var(--done)}
  .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:7px;vertical-align:middle}

  /* ── tables (light-blue header band) ── */
  .board{width:100%;border-collapse:collapse;background:var(--paper);border:1px solid var(--band-line);border-radius:8px;overflow:hidden}
  .board th{text-align:left;font:700 10.5px/1 ui-monospace,monospace;letter-spacing:.09em;text-transform:uppercase;color:var(--navy);padding:11px 15px;background:var(--band);border-bottom:1px solid var(--band-line)}
  .board td{padding:11px 15px;border-top:1px solid var(--line);font-size:14px;vertical-align:top}
  .board tbody tr:first-child td{border-top:0}
  .board tbody tr:nth-child(even){background:#fafcff}
  .pill{display:inline-block;padding:3px 11px;border-radius:999px;font:600 11px/1.5 ui-monospace,monospace;white-space:nowrap}
  .s-done{color:var(--done);background:rgba(28,143,95,.12)}.s-prog{color:var(--prog);background:rgba(47,111,208,.12)}
  .s-pend{color:var(--pend);background:rgba(108,122,141,.13)}.s-block{color:var(--block);background:rgba(207,58,44,.11)}.s-risk{color:var(--risk);background:rgba(176,120,21,.13)}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:680px){.two{grid-template-columns:1fr}}
  .callout{border-radius:8px;padding:15px 18px;font-size:14.5px;line-height:1.6}
  .callout.ok{background:rgba(28,143,95,.07);border:1px solid rgba(28,143,95,.3)}
  .callout.block{background:rgba(207,58,44,.06);border:1px solid rgba(207,58,44,.3)}
  ul.log{list-style:none;padding:0;margin:0}
  ul.log li{padding:10px 0;border-top:1px solid var(--line);color:var(--muted);font-size:13.5px}
  ul.log li:first-child{border-top:0}
  ul.log li b{color:var(--ink)} ul.log code{color:var(--blue)}
  code{font-family:ui-monospace,monospace;color:var(--blue);font-size:12px}
  .tag{display:inline-block;margin-left:5px;padding:1px 6px;border-radius:5px;background:var(--band);color:var(--navy);font:600 9.5px/1.4 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.05em}
  details>summary{cursor:pointer;list-style:none;display:flex;align-items:flex-start;gap:7px}
  details>summary::-webkit-details-marker{display:none}
  details>summary::before{content:"\\25b8";color:var(--blue);font-size:11px;line-height:1.5;transition:transform .15s}
  details[open]>summary::before{transform:rotate(90deg)}
  details>summary:hover{color:var(--blue)}
  .det{margin:9px 0 2px 17px;padding:11px 14px;border-left:2px solid var(--blue-soft);background:#f4f8fd;border-radius:0 8px 8px 0;color:var(--muted);font-size:13.5px;line-height:1.66}

  /* ── mobile: collapse every table row into a stacked card ── */
  @media(max-width:640px){
    .wrap{margin:0;border:0;border-radius:0;box-shadow:none;max-width:100%}
    .banner{padding:24px 18px 22px}
    .banner h1{font-size:23px;line-height:1.16}
    .banner .tagline{font-size:13.5px}
    .body{padding:24px 17px 0}
    .reportmeta{font-size:12.5px}
    .reportmeta td{padding:8px 11px}
    .reportmeta tr{display:block;border-bottom:1px solid var(--band-line)}
    .reportmeta td{display:block;border:0}
    .reportmeta .lbl{width:auto;border-radius:0}
    .exectitle{font-size:21px}
    .execwrap{grid-template-columns:1fr;gap:18px}
    .statuscards{flex-direction:row;gap:10px}
    .scard{flex:1}
    h2{font-size:16px;margin:30px 0 13px;padding:8px 14px}
    .grid{grid-template-columns:1fr;gap:9px}
    .card .v{font-size:14.5px}
    .two{grid-template-columns:1fr;gap:11px}
    table.board{border:0;background:transparent}
    .board thead{position:absolute;left:-9999px;top:-9999px}
    .board tr{display:block;background:var(--paper);border:1px solid var(--line);border-radius:10px;margin-bottom:10px;padding:13px 15px}
    .board tbody tr:nth-child(even){background:var(--paper)}
    .board td{display:block;border:0;padding:3px 0;font-size:13.5px}
    .board td:empty{display:none}
    .board td.idc{font:700 12px/1.4 ui-monospace,monospace;color:var(--blue);margin-bottom:1px}
    .board td.main{font-weight:600;color:var(--ink);font-size:14.5px;margin:1px 0 7px;line-height:1.4}
    .board td[data-label]{display:flex;gap:9px;align-items:baseline;color:var(--muted)}
    .board td[data-label]::before{content:attr(data-label);flex:0 0 84px;color:var(--dim);font:700 10px/1.8 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.04em}
    .det{margin-left:0;font-size:13px}
    details>summary{font-size:14px;line-height:1.4}
  }
  footer{margin:44px 50px 0;padding-top:18px;border-top:2px solid var(--navy);color:var(--dim);font-size:12px}
  @media(max-width:640px){footer{margin:40px 17px 0}}
  @media print{
    body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .wrap{box-shadow:none;border:0;margin:0;max-width:100%}
    .banner{padding:24px 40px}
    .body{padding:24px 40px 0}
    .copy,.actions,.no-print{display:none!important}
    h2{break-after:avoid}.board,.card,.scard{break-inside:avoid}
  }
</style>
</head>
<body>
<div class="wrap">
  <div class="banner">
    <div class="eyebrow">Project Status Report</div>
    <h1>${esc(data.project)}</h1>
    <div class="tagline">${esc(data.tagline)}</div>
    <div class="actions no-print">
      <button class="actbtn" type="button" id="btn-pdf"><span class="i">⤓</span> Download PDF</button>
      <button class="actbtn" type="button" id="btn-share"><span class="i">↗</span> Share</button>
    </div>
  </div>

  <div class="body">
    <table class="reportmeta">
      <tr>
        <td class="lbl">Reporting period</td><td class="val">${esc(period)}</td>
        <td class="lbl">Project title</td><td class="val">${esc(data.project)}</td>
      </tr>
      <tr>
        <td class="lbl">Date of report</td><td class="val">${esc(reportDate)}</td>
        <td class="lbl">Project manager</td><td class="val">Bellwood Hub PM (Claude)</td>
      </tr>
      <tr>
        <td class="lbl">Latest change</td><td class="val">${activity[0] ? esc(activity[0].subject) : "—"}</td>
        <td class="lbl">Project sponsor</td><td class="val">R. Dawson · SDP Chicago</td>
      </tr>
    </table>

    <div class="exectitle">Executive Summary</div>
    <div class="execwrap">
      <div class="exec">${execList}</div>
      <div class="statuscards">
        <div class="scard"><div class="ic">${overall.ic}</div><div class="lbl">Overall Project Status</div><div class="val"><span class="pill ${overall.cls}">${overall.val}</span></div></div>
        <div class="scard"><div class="ic">${demoCard.ic}</div><div class="lbl">Monday Demo</div><div class="val"><span class="pill ${demoCard.cls}">${demoCard.val}</span></div></div>
      </div>
    </div>

    <h2>Summary at a glance</h2>
    <div class="grid">${glanceCards}</div>

    ${corpusCards ? `<h2>Corpus narrative — the pitch in the numbers</h2><div class="grid">${corpusCards}</div>` : ""}

    <h2>Project components &amp; task board</h2>
    <div class="two">${boards}</div>

    <h2>Top blocker</h2>
    <div class="callout ${data.blocker.class}">${data.blocker.text}</div>
    ${issuesTable}
    ${risksTable}
    ${depsTable}
    ${decisionsBlock}

    <h2>Activity — from git (auto)</h2>
    <ul class="log">${activityRows}</ul>
  </div>

  <footer>Generated by the Project Manager · ${esc(data.project)} · ${esc(stamp)} · <span class="live"></span>auto-updated on every push · synthetic data only, no real personal information.</footer>
</div>
<script>
  // ── Download PDF (browser print) + Share (native sheet / copy-link) ──
  var SHARE_URL = 'https://project-status-ten.vercel.app';
  var SHARE_TITLE = document.title;
  // Expand every <details> before printing so the PDF is the complete report; restore after.
  var _restore = null;
  function expandAll(){ if(_restore) return; var ds = [].slice.call(document.querySelectorAll('details')); _restore = ds.map(function(d){ return [d, d.open]; }); ds.forEach(function(d){ d.open = true; }); }
  function restoreAll(){ if(!_restore) return; _restore.forEach(function(p){ p[0].open = p[1]; }); _restore = null; }
  window.addEventListener('beforeprint', expandAll);
  window.addEventListener('afterprint', restoreAll);
  var _pdf = document.getElementById('btn-pdf');
  if(_pdf) _pdf.addEventListener('click', function(){ expandAll(); setTimeout(function(){ window.print(); }, 60); setTimeout(restoreAll, 1500); });
  var _share = document.getElementById('btn-share');
  if(_share) _share.addEventListener('click', function(){
    if(navigator.share){ navigator.share({ title: SHARE_TITLE, text: SHARE_TITLE, url: SHARE_URL }).catch(function(){}); return; }
    var done = function(){ var o = _share.innerHTML; _share.innerHTML = '<span class="i">✓</span> Link copied'; _share.classList.add('ok'); setTimeout(function(){ _share.innerHTML = o; _share.classList.remove('ok'); }, 1600); };
    if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(SHARE_URL).then(done, function(){ _cp(SHARE_URL); done(); }); }
    else { _cp(SHARE_URL); done(); }
  });
  function _cp(t){ var ta=document.createElement('textarea'); ta.value=t; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); try{document.execCommand('copy');}catch(e){} document.body.removeChild(ta); }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.copy');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    var text = b.getAttribute('data-c') || '';
    var done = function () { var o = b.textContent; b.textContent = '✓ copied'; b.classList.add('ok'); setTimeout(function () { b.textContent = o; b.classList.remove('ok'); }, 1300); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallback(text); done(); });
    } else { fallback(text); done(); }
    function fallback(t) { var ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (x) {} document.body.removeChild(ta); }
  });
</script>
</body>
</html>
`;

writeFileSync(join(here, "index.html"), html);
console.log(`status page rebuilt · ${activity.length} commits · ${stamp}`);
