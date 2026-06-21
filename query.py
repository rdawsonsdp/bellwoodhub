#!/usr/bin/env python3
"""
query.py — ask the Bellwood mayor's inbox a question.

  python query.py "what's the history on 2218 Bohland Ave?"
  python query.py "history with Gloria" --person "Gloria Bennett"
  python query.py "noise complaints" --address "St. Charles Rd" --since 2025-01-01
  python query.py --demo                 # run the scripted demo questions
  python query.py "..." --answer         # also synthesize a grounded answer

Embeds the question, runs pgvector cosine nearest-neighbor over poc.email_chunks,
and returns the top matches WITH each source email's subject, sender and date so
every answer is traceable. Optional --person / --address / --since / --until
filters join through poc.email_entities / poc.emails. Two demo questions are
aggregate by nature ("who emails me the most", "what's still open") and are
answered with dedicated SQL.
"""
from __future__ import annotations

import argparse
import re
import sys
import textwrap

from openai import OpenAI

import config
import db
from corpus import personas
from normalize import normalize_address, normalize_person

# Distinctive streets we auto-detect in a question to apply an --address filter.
AUTO_STREETS = [
    "Bohland Ave", "St. Charles Rd", "Mannheim Rd", "25th Ave", "19th Ave",
    "Eastern Ave", "Bellwood Ave", "Washington Blvd", "Granville Ave", "Hirsch Ave",
    "Englewood Ave", "50th Ave", "Marshall Ave", "Geneva Ave", "Rice Ave", "Harvard Ave",
]


def auto_filters(question, person, address):
    """Detect a known constituent name or a distinctive street in the question and
    apply it as a person/address filter (unless the user already set one)."""
    notes = []
    if not person:
        ql = question.lower()
        for p in personas.PERSONAS.values():
            if p.get("role") in ("resident", "business") and p["name"].lower() in ql:
                person = p["name"]
                notes.append(f"person={person}")
                break
    if not address:
        for st in AUTO_STREETS:
            core = st.rsplit(" ", 1)[0]  # drop the suffix token
            if re.search(r"\b" + re.escape(core) + r"\b", question, re.IGNORECASE):
                address = st
                notes.append(f"address={st}")
                break
    return person, address, notes

_client: OpenAI | None = None


def client() -> OpenAI:
    global _client
    if _client is None:
        config.require("OPENAI_API_KEY", config.OPENAI_API_KEY)
        _client = OpenAI(api_key=config.OPENAI_API_KEY)
    return _client


def embed(text: str) -> list[float]:
    r = client().embeddings.create(model=config.EMBED_MODEL, input=[text])
    return r.data[0].embedding


# ───────────────────────────── retrieval ────────────────────────────────────
def search(conn, question, k=8, person=None, address=None, since=None, until=None,
           topic=None) -> list[dict]:
    qv = embed(question)
    where, params = ["TRUE"], {}
    if person:
        where.append(
            "e.id IN (SELECT email_id FROM poc.email_entities "
            "WHERE entity_type='person' AND entity_norm ILIKE %(person)s)"
        )
        params["person"] = f"%{normalize_person(person)}%"
    if address:
        where.append(
            "e.id IN (SELECT email_id FROM poc.email_entities "
            "WHERE entity_type='address' AND entity_norm ILIKE %(address)s)"
        )
        params["address"] = f"%{normalize_address(address)}%"
    if since:
        where.append("e.date_sent >= %(since)s")
        params["since"] = since
    if until:
        where.append("e.date_sent <= %(until)s")
        params["until"] = until
    if topic:
        where.append("e.topic = %(topic)s")
        params["topic"] = topic
    params["k"] = k
    params["qv"] = qv

    sql = f"""
        WITH q AS (SELECT %(qv)s::extensions.vector AS v)
        SELECT e.subject, e.from_name, e.from_email, e.to_email, e.direction,
               e.topic, e.date_sent, e.message_id, e.thread_id, c.chunk_text,
               (c.embedding <=> (SELECT v FROM q)) AS distance
        FROM poc.email_chunks c
        JOIN poc.emails e ON e.id = c.email_id
        WHERE {" AND ".join(where)}
        ORDER BY c.embedding <=> (SELECT v FROM q)
        LIMIT %(k)s
    """
    with conn.cursor() as cur:
        cur.execute(sql, params)
        cols = [d.name for d in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]


def corpus_max_date(conn) -> str:
    with conn.cursor() as cur:
        cur.execute("SELECT max(date_sent)::date FROM poc.emails")
        return str(cur.fetchone()[0])


# ───────────────────────────── aggregates ───────────────────────────────────
def who_emails_most(conn, limit=8) -> str:
    gov = "%demo.gov"                       # excludes Bellwood staff AND outside agencies
    bellwood = "%@" + config.STAFF_DOMAIN
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT from_name, from_email, count(*) AS n,
                   string_agg(DISTINCT topic, ', ' ORDER BY topic) AS topics
            FROM poc.emails
            WHERE direction='inbound' AND from_email NOT LIKE %s
            GROUP BY from_name, from_email
            ORDER BY n DESC
            LIMIT %s
            """,
            (gov, limit),
        )
        residents = cur.fetchall()
        cur.execute(
            """
            SELECT from_name, from_email, count(*) AS n
            FROM poc.emails
            WHERE direction='inbound' AND from_email LIKE %s
            GROUP BY from_name, from_email
            ORDER BY n DESC
            LIMIT 5
            """,
            (bellwood,),
        )
        depts = cur.fetchall()
    out = ["  TOP CONSTITUENTS (by emails to the mayor):"]
    for name, email, n, topics in residents:
        out.append(f"    {n:4d}  {name} <{email}>")
        out.append(f"          topics: {topics}")
    out.append("\n  MOST ACTIVE INTERNAL SENDERS (departments / daily reports):")
    for name, email, n in depts:
        out.append(f"    {n:4d}  {name} <{email}>")
    return "\n".join(out)


def open_items(conn, k=10) -> list[dict]:
    """Recent inbound messages that read as unresolved/open."""
    qv = embed("issue still open, unresolved, pending, waiting on a response, "
               "not yet fixed, needs follow up, awaiting resolution")
    maxd = corpus_max_date(conn)
    sql = """
        WITH q AS (SELECT %(qv)s::extensions.vector AS v)
        SELECT e.subject, e.from_name, e.from_email, e.to_email, e.direction,
               e.topic, e.date_sent, e.message_id, e.thread_id, c.chunk_text,
               (c.embedding <=> (SELECT v FROM q)) AS distance
        FROM poc.email_chunks c
        JOIN poc.emails e ON e.id = c.email_id
        WHERE e.direction='inbound'
          AND e.date_sent >= (%(maxd)s::date - INTERVAL '100 days')
        ORDER BY c.embedding <=> (SELECT v FROM q)
        LIMIT %(k)s
    """
    with conn.cursor() as cur:
        cur.execute(sql, {"qv": qv, "k": k, "maxd": maxd})
        cols = [d.name for d in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]


_AGG_WHO = re.compile(r"who\b.*(email|wrote|contact|message).*(most|frequent)", re.I)
_AGG_OPEN = re.compile(r"(still\s+open|unresolved|outstanding|pending|haven'?t\s+\w+\s+resolv|"
                       r"not\s+resolved|still\s+need|open\s+right\s+now)", re.I)


# ───────────────────────────── rendering ────────────────────────────────────
def snippet(text: str, n=260) -> str:
    t = re.sub(r"\s+", " ", text).strip()
    return t if len(t) <= n else t[:n].rsplit(" ", 1)[0] + " …"


def render(rows: list[dict]) -> str:
    if not rows:
        return "  (no matches)"
    out = []
    for i, r in enumerate(rows, 1):
        score = 1 - float(r["distance"])
        d = str(r["date_sent"])[:10]
        arrow = "←in " if r["direction"] == "inbound" else "→out"
        out.append(f"  [{i}] {score:0.3f} {arrow} {d}  {r['from_name']} <{r['from_email']}>")
        out.append(f"      subj: {r['subject']}   ({r['topic']})")
        out.append(f"      {snippet(r['chunk_text'])}")
        out.append(f"      id: {r['message_id']}")
    return "\n".join(out)


def synthesize(question: str, rows: list[dict]) -> str:
    if not rows:
        return "  (no email context to answer from)"
    ordered = sorted(rows, key=lambda r: str(r["date_sent"]), reverse=True)  # newest first
    ctx = []
    for i, r in enumerate(ordered, 1):
        ctx.append(
            f"[{i}] {str(r['date_sent'])[:10]} | from {r['from_name']} <{r['from_email']}> | "
            f"subject: {r['subject']}\n{snippet(r['chunk_text'], 600)}"
        )
    context = "\n\n".join(ctx)
    msg = [
        {"role": "system", "content":
            "You are the Bellwood mayor's chief of staff. Answer the mayor's question "
            "using ONLY the email excerpts provided. Be concise and specific. Cite "
            "sources inline like [1], [2]. The excerpts are ordered NEWEST FIRST, so "
            "[1] is the most recent — when asked about the 'latest' or most recent "
            "email, use [1]. If the excerpts don't contain the answer, say so. When "
            "asked how to handle something, suggest a concrete next step."},
        {"role": "user", "content": f"Question: {question}\n\nEmail excerpts:\n{context}"},
    ]
    resp = client().chat.completions.create(model=config.ANSWER_MODEL, messages=msg, temperature=0.2)
    return textwrap.indent(resp.choices[0].message.content.strip(), "  ")


# ───────────────────────────── driver ───────────────────────────────────────
def answer_question(conn, question, args, force_answer=None) -> None:
    do_answer = args.answer if force_answer is None else force_answer

    if _AGG_WHO.search(question):
        print(who_emails_most(conn))
        return
    if _AGG_OPEN.search(question):
        rows = open_items(conn, k=args.k)
        print(render(rows))
        if do_answer:
            print("\n  ── grounded answer ──")
            print(synthesize(question, rows))
        return

    person, address, notes = auto_filters(question, args.person, args.address)
    if notes:
        print(f"  (auto-filter: {', '.join(notes)})")
    rows = search(conn, question, k=args.k, person=person, address=address,
                  since=args.since, until=args.until, topic=args.topic)
    print(render(rows))
    if do_answer:
        print("\n  ── grounded answer ──")
        print(synthesize(question, rows))


def main() -> None:
    ap = argparse.ArgumentParser(description="Ask the Bellwood mayor's inbox.")
    ap.add_argument("question", nargs="?", help="natural-language question")
    ap.add_argument("--person")
    ap.add_argument("--address")
    ap.add_argument("--since", help="YYYY-MM-DD")
    ap.add_argument("--until", help="YYYY-MM-DD")
    ap.add_argument("--topic")
    ap.add_argument("--k", type=int, default=8)
    ap.add_argument("--demo", action="store_true", help="run the scripted demo questions")
    ap.add_argument("--answer", action="store_true", help="synthesize a grounded answer")
    ap.add_argument("--no-answer", dest="answer", action="store_false")
    ap.set_defaults(answer=False)
    args = ap.parse_args()

    config.require("OPENAI_API_KEY", config.OPENAI_API_KEY)
    config.require("DATABASE_URL", config.DATABASE_URL)
    conn = db.connect()
    try:
        if args.demo:
            for i, q in enumerate(config.DEMO_QUESTIONS, 1):
                print("\n" + "═" * 72)
                print(f"  Q{i}. {q}")
                print("═" * 72)
                answer_question(conn, q, args, force_answer=True)  # demo always answers
            return
        if not args.question:
            ap.error("provide a question or --demo")
        answer_question(conn, args.question, args)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
