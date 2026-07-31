import fs from "fs";
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
import("../lib/agents/constants").then(async ({ TASK_PROFILE }) => {
  const { completeMeta } = await import("../lib/agents/claude");
  for (const task of Object.keys(TASK_PROFILE) as (keyof typeof TASK_PROFILE)[]) {
    const p = TASK_PROFILE[task];
    const knobs = `${p.model} effort=${(p as {effort?:string}).effort ?? "—"} thinking=${p.thinking}`;
    try {
      const r = await completeMeta({ task, system: "Answer in one word.", user: "ping" });
      console.log(`✓ ${task.padEnd(11)} ${knobs.padEnd(52)} in=${r.inputTokens} out=${r.outputTokens} "${r.text.slice(0,14)}"`);
    } catch (e) {
      console.log(`✗ ${task.padEnd(11)} ${knobs.padEnd(52)} ${(e as Error).message.slice(0,110)}`);
    }
  }
});
