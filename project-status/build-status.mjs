/*
 * build-status.mjs — regenerate the shareable status page from PM data + git activity.
 *
 * Inputs:  project-status/status.json  (PM-authored narrative)
 *          `git log`                   (recent activity — what you pushed)
 * Output:  project-status/index.html   (self-contained, deploy as static site)
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
const stripTags = (s) => String(s || "").replace(/<[^>]+>/g, "");
const pillClass = { done: "s-done", "in progress": "s-prog", prog: "s-prog", pending: "s-pend", blocked: "s-block", "at risk": "s-risk", risk: "s-risk" };
const dotColor = { done: "var(--done)", prog: "var(--prog)", "in progress": "var(--prog)", pending: "var(--pend)", blocked: "var(--block)", risk: "var(--risk)" };

// ── recent activity from git (the "PM sees your pushes" part) ──
function gitActivity(n = 12) {
  try {
    const out = execSync(`git -C "${here}/.." log -n ${n} --pretty=format:'%h%x1f%ad%x1f%s' --date='format:%b %d'`, { encoding: "utf8" });
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
  <h2>Risks</h2>
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
<meta name="theme-color" content="#0d1422" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="Bellwood PM" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<style>
  :root{--line:#283041;--ink:#e8eef6;--muted:#9bb0c9;--dim:#6b7e98;--done:#34c98b;--prog:#67adff;--pend:#7d8ea3;--block:#ff6b5e;--risk:#f0a33c;--accent:#e7b53c;--panel:#141b27;}
  *{box-sizing:border-box}
  body{margin:0;background:radial-gradient(130% 90% at 18% -8%,#16243c 0%,#0d1422 45%,#0a0e15 100%);min-height:100vh;color:var(--ink);font:15px/1.62 'Public Sans',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}
  .wrap{max-width:980px;margin:0 auto;padding:40px 22px 64px}
  header{border-bottom:1px solid var(--line);padding-bottom:22px;margin-bottom:24px}
  .eyebrow{font:600 11px/1 ui-monospace,monospace;letter-spacing:.16em;text-transform:uppercase;color:var(--accent)}
  h1{font-size:31px;margin:11px 0 6px;font-weight:700;letter-spacing:-.01em}
  .tagline{color:var(--muted);font-size:15.5px;max-width:680px}
  .meta{margin-top:14px;font:12px/1.6 ui-monospace,monospace;color:var(--dim)}
  .live{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--done);margin-right:6px;box-shadow:0 0 0 0 rgba(52,201,139,.6);animation:p 1.8s infinite}
  @keyframes p{0%{box-shadow:0 0 0 0 rgba(52,201,139,.5)}70%{box-shadow:0 0 0 7px rgba(52,201,139,0)}100%{box-shadow:0 0 0 0 rgba(52,201,139,0)}}
  .headline{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:12px;padding:16px 18px;margin:0 0 26px;font-size:16px}
  h2{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);margin:32px 0 13px;font-weight:700}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(225px,1fr));gap:12px}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:14px 15px}
  .card .k{font-size:12.5px;color:var(--muted)} .card .v{margin-top:5px;font-size:13.5px;font-weight:600}
  details.gcard{cursor:pointer}
  details.gcard>summary{list-style:none;position:relative;outline:none}
  details.gcard>summary::-webkit-details-marker{display:none}
  details.gcard>summary::before{content:""}
  details.gcard>summary::after{content:"›";position:absolute;top:-1px;right:0;color:var(--dim);font-size:16px;transition:transform .15s}
  details.gcard[open]>summary::after{transform:rotate(90deg)}
  details.gcard:hover{border-color:var(--accent)}
  details.gcard .det{margin:11px 0 1px;font-size:12.5px}
  .copy{cursor:pointer;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--dim);border-radius:6px;font:600 10px/1.5 ui-monospace,monospace;padding:1px 6px;margin-left:6px;white-space:nowrap;vertical-align:middle}
  .copy:hover{color:var(--ink);border-color:var(--accent)}
  .copy.ok{color:var(--done);border-color:var(--done)}
  .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:7px;vertical-align:middle}
  .board{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line);border-radius:11px;overflow:hidden}
  .board th{text-align:left;font:600 11px/1 ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);padding:11px 14px}
  .board td{padding:11px 14px;border-top:1px solid var(--line);font-size:13.5px;vertical-align:top}
  .pill{display:inline-block;padding:3px 10px;border-radius:999px;font:600 11px/1.5 ui-monospace,monospace;white-space:nowrap}
  .s-done{color:var(--done);background:rgba(52,201,139,.13)}.s-prog{color:var(--prog);background:rgba(103,173,255,.13)}
  .s-pend{color:var(--pend);background:rgba(125,142,163,.13)}.s-block{color:var(--block);background:rgba(255,107,94,.13)}.s-risk{color:var(--risk);background:rgba(240,163,60,.13)}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:680px){.two{grid-template-columns:1fr}}
  .callout{border-radius:12px;padding:15px 18px}
  .callout.ok{background:rgba(52,201,139,.08);border:1px solid rgba(52,201,139,.3)}
  .callout.block{background:rgba(255,107,94,.08);border:1px solid rgba(255,107,94,.3)}
  ul.log{list-style:none;padding:0;margin:0}
  ul.log li{padding:9px 0;border-top:1px solid var(--line);color:var(--muted);font-size:13.5px}
  ul.log li b{color:var(--ink)} ul.log code{color:var(--accent)}
  code{font-family:ui-monospace,monospace;color:var(--accent);font-size:12px}
  .tag{display:inline-block;margin-left:5px;padding:1px 6px;border-radius:5px;background:rgba(255,255,255,.07);color:var(--dim);font:600 9.5px/1.4 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.05em}
  details>summary{cursor:pointer;list-style:none;display:flex;align-items:flex-start;gap:7px}
  details>summary::-webkit-details-marker{display:none}
  details>summary::before{content:"▸";color:var(--accent);font-size:11px;line-height:1.5;transition:transform .15s}
  details[open]>summary::before{transform:rotate(90deg)}
  details>summary:hover{color:var(--ink)}
  .det{margin:9px 0 2px 17px;padding:11px 13px;border-left:2px solid var(--accent);background:rgba(103,173,255,.06);border-radius:0 8px 8px 0;color:var(--muted);font-size:13px;line-height:1.6}
  /* ── mobile: collapse every table row into a stacked card ── */
  @media(max-width:640px){
    .wrap{padding:24px 13px 64px}
    h1{font-size:23px;line-height:1.15}
    .tagline{font-size:14px}
    .meta{font-size:11px;line-height:1.7}
    h2{margin:26px 0 11px}
    .headline{font-size:14.5px;padding:14px 15px}
    .grid{grid-template-columns:1fr;gap:9px}
    .card .v{font-size:14px}
    .two{grid-template-columns:1fr;gap:11px}
    table.board{border:0;background:transparent}
    .board thead{position:absolute;left:-9999px;top:-9999px}
    .board tr{display:block;background:var(--panel);border:1px solid var(--line);border-radius:12px;margin-bottom:10px;padding:12px 14px}
    .board td{display:block;border:0;padding:3px 0;font-size:13.5px}
    .board td:empty{display:none}
    .board td.idc{font:600 12px/1.4 ui-monospace,monospace;color:var(--accent);margin-bottom:1px}
    .board td.main{font-weight:600;color:var(--ink);font-size:14.5px;margin:1px 0 7px;line-height:1.4}
    .board td[data-label]{display:flex;gap:9px;align-items:baseline;color:var(--muted)}
    .board td[data-label]::before{content:attr(data-label);flex:0 0 84px;color:var(--dim);font:600 10px/1.8 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.04em}
    .det{margin-left:0;font-size:13px}
    details>summary{font-size:14px;line-height:1.4}
  }
  footer{margin-top:42px;padding-top:18px;border-top:1px solid var(--line);color:var(--dim);font-size:12px}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="eyebrow">Project Status</div>
    <h1>${esc(data.project)}</h1>
    <div class="tagline">${esc(data.tagline)}</div>
    <div class="meta"><span class="live"></span>Auto-updated on push · ${esc(stamp)}${activity[0] ? " · latest: " + esc(activity[0].subject) : ""}</div>
  </header>

  <div class="headline">${data.headline}</div>

  <h2>Status at a glance</h2>
  <div class="grid">${glanceCards}</div>

  ${corpusCards ? `<h2>Corpus narrative — the pitch in the numbers</h2><div class="grid">${corpusCards}</div>` : ""}

  <h2>Task board</h2>
  <div class="two">${boards}</div>

  <h2>Top blocker</h2>
  <div class="callout ${data.blocker.class}">${data.blocker.text}</div>
  ${issuesTable}
  ${risksTable}
  ${depsTable}
  ${decisionsBlock}

  <h2>Activity — from git (auto)</h2>
  <ul class="log">${activityRows}</ul>

  <footer>Generated by the Project Manager · ${esc(data.project)} · ${esc(stamp)} · synthetic data only, no real personal information.</footer>
</div>
<script>
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
