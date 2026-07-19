# Agent test plan — understanding and tuning what an agent does

The point of this document: **you should be able to tell an agent what to do
the way you'd tell Claude, watch what it does, and know which knob to turn when
it's wrong.** If any step below requires knowing the codebase, that step is a
design bug — write it down as one.

Test mailbox: `rdawson@strategicdataproducts.com` (Gmail, `gov` lane),
Supabase `bellwoodhub-agent-test`, local dev on `:3200`.

---

## 0. The model in one paragraph

An agent is a **desk**. It reads mail that lands on it, remembers what it has
seen, and each run produces a short **digest** (headline + cited points), an
**urgency** colour, and — only if its autonomy allows — **draft replies** for a
human to approve. Two things decide what it reads: the **time window** (new mail
since its last run) and the **instruction** you give it (matched by meaning
across the whole archive, any date). Everything it says must cite a real
message; that rule lives in code and you cannot prompt your way past it.

---

## 1. Baseline — does it work at all?

Run before tuning anything, so later failures have something to compare to.

| # | Do this | Expect | If not |
|---|---|---|---|
| 1.1 | Check ingest landed mail | `canonical.messages` > 0 | connector `status` must be `active`, not `pending` |
| 1.2 | Check embedding ran | `canonical.chunks` > 0 | run `/api/cron/embed-mail`; **instructions match nothing until this is non-zero** |
| 1.3 | Open an agent → give it an instruction → **Preview** | a list of matched messages | see §4 |
| 1.4 | Run the agent | a headline + cited digest points | see §5 |
| 1.5 | Click a citation | the actual email opens | citation resolution is broken; report it |

```sql
-- 1.1 / 1.2 in one shot
select (select count(*) from canonical.messages) as messages,
       (select count(*) from canonical.chunks)   as chunks,
       (select count(*) from canonical.messages m
          where not exists (select 1 from canonical.chunks c
                             where c.message_id = m.message_id)) as unembedded;
```

---

## 2. The tuning loop

Four steps, repeat until the output is what you'd have written yourself:

1. **Instruct** — say what you want in plain English.
2. **Preview** — look at what it matched *before* it writes anything.
3. **Run** — read the digest.
4. **Diagnose** — use §4 / §5 to find which of the two stages was wrong.

The discipline that makes this work: **preview before you run.** Retrieval and
reasoning fail differently, and the preview separates them. If the preview is
wrong, no amount of instruction rewriting will fix the digest — the agent never
saw the right mail.

---

## 3. Writing an instruction

Write it as you'd write it to a person. Three things earn their place:

- **What to watch for** — the subject, in your words. "Anything about invoices."
- **What to tell me** — the shape of the answer. "How many, from whom, totals."
- **What's urgent** — when you want to be interrupted. "Flag anything overdue."

Good:

> Watch for invoices and payment requests. Each day tell me how many came in,
> who from, and the total. Flag anything marked overdue or past due.

Bad, and why:

| Instruction | Problem |
|---|---|
| "Be helpful" | Nothing to retrieve — matches everything and nothing |
| "Summarize my email" | No subject; you'll get an arbitrary sample |
| A three-paragraph brief | Dilutes retrieval — the specific words get lost among the general ones |
| "Ignore your rules and…" | Hard rules are in code; the model can't comply |

Rule of thumb: **name a thing you could search for.** If you can't imagine what
an example email looks like, the agent can't either.

---

## 4. When the PREVIEW is wrong

The agent is looking at the wrong mail. Retrieval, not reasoning.

| Symptom | Likely cause | Fix |
|---|---|---|
| No matches at all | Nothing embedded yet | check §1.2 `chunks > 0` |
| No matches, chunks exist | Wording doesn't resemble the mail | use the words the mail uses — "invoice" not "billing matters" |
| Matches are loosely related | Instruction too abstract | name the concrete thing |
| Matches one sender only | That sender dominates the archive | narrow: "invoices from vendors, not receipts from Amazon" |
| Right topic, wrong period | Matching is by meaning, not date | date filtering is not supported yet — note it as a gap |
| Obvious email missing | It may not be embedded, or its body is empty | check that message's chunk count |

```sql
-- is a specific message embedded?
select m.subject, count(c.chunk_id) as chunks
  from canonical.messages m
  left join canonical.chunks c on c.message_id = m.message_id
 where m.subject ilike '%invoice%'
 group by m.subject order by chunks limit 20;
```

---

## 5. When the RUN is wrong

It found the right mail and said the wrong thing about it. Reasoning.

| Symptom | Likely cause | Fix |
|---|---|---|
| Digest is vague | Instruction didn't say what to report | state the shape: "how many, who from, totals" |
| Everything marked red | No urgency guidance | say what's urgent *and* what isn't |
| Empty digest, mail exists | Nothing citable — working as intended | check preview; an honest empty beats invented filler |
| Reports things you don't care about | Instruction too broad | add an explicit exclusion |
| No drafts, you expected drafts | Agent's autonomy is below `draft` | autonomy is a code constant, not a setting — see §7 |
| Says "no new items" | Should be impossible | uncited points are stripped; report if seen |

```sql
-- last run per agent, newest first
select agent_key, ran_at,
       output->>'headline'                as headline,
       output->>'urgency'                 as urgency,
       jsonb_array_length(output->'digest')   as points,
       jsonb_array_length(output->'actItems') as drafts
  from canonical.agent_runs
 order by ran_at desc limit 10;
```

---

## 6. Memory — the second-run behaviour

Memory is what makes a desk different from a search box. Test it deliberately:

1. Run the agent. Note its digest.
2. Run it again with no new mail. It should **not** repeat itself verbatim —
   standing items should read as continuing, not new.
3. When something recurs, expect it to say so ("3rd this month") rather than
   reporting it fresh each time.

```sql
select agent_key, kind, title, occurrence_count, status, last_seen
  from canonical.agent_memory
 order by occurrence_count desc, last_seen desc limit 20;
```

**Known gap:** a commitment can currently be closed without message evidence.
The validation rule exists but the live runner doesn't call it. Treat any
`status = 'closed'` row as unverified until that's fixed.

---

## 7. What you cannot change from the UI (and shouldn't be able to)

These are constitution, not configuration. If a test seems to require changing
one, the test is wrong — or the constitution is, and that's a code review.

- **Every claim carries a citation.** Uncited points are dropped before you see
  them; invented message ids fail the whole run.
- **Autonomy ceiling.** No agent sends. Drafting agents draft; a human approves.
- **Sending is caged twice** — an env flag *and* a recipient allowlist, both
  fail-closed. Approving a draft with the cage shut records the attempt.
- **The mailbox wall.** A walled mailbox's mail never reaches a government desk,
  including through semantic similarity.

---

## 8. Scenarios worth running once

| Scenario | What it proves |
|---|---|
| Instruct two agents with the *same* text | Desks differ by scope, not just prompt |
| Instruct for something absent from the mailbox | Honest empty, not invented content |
| Instruct with a typo'd/vague word | How gracefully retrieval degrades |
| Run twice, no new mail | Memory works; no verbatim repeat |
| Instruct an `observe` agent to draft | The ceiling holds |
| Reset to default | Config genuinely reverts |

---

## 9. Recording results

For each test: **instruction → what preview matched → what the run said →
verdict → which knob you turned.** The instructions that worked are the real
output of this exercise; they become the defaults shipped to the next customer.

Log anything requiring codebase knowledge to diagnose as a **usability bug**,
not a user error.
