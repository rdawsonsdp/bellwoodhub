"""
Central configuration for the Bellwood Mayor's Office Email RAG POC.

Every tunable lives here so the corpus is reproducible and the pipeline is
re-runnable. Loads secrets from .env (gitignored).
"""
from __future__ import annotations

import datetime as _dt
import os
from pathlib import Path

from dotenv import load_dotenv

# ──────────────────────────────────────────────────────────────────────────
# Paths
# ──────────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent
CORPUS_DIR = ROOT / "corpus"
AUTHORED_DIR = CORPUS_DIR / "authored"          # LLM-authored content units
SEED_FILE = CORPUS_DIR / "seed_emails.json"     # canonical generated corpus
MIGRATIONS_DIR = ROOT / "migrations"

load_dotenv(ROOT / ".env")

# ──────────────────────────────────────────────────────────────────────────
# Secrets / connections
# ──────────────────────────────────────────────────────────────────────────
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "").strip()
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
SUPABASE_PROJECT_REF = os.environ.get("SUPABASE_PROJECT_REF", "rqbkxoniqmuyvvpjbegu").strip()

# ──────────────────────────────────────────────────────────────────────────
# Reproducibility
# ──────────────────────────────────────────────────────────────────────────
RANDOM_SEED = 42

# ──────────────────────────────────────────────────────────────────────────
# Corpus shape
# ──────────────────────────────────────────────────────────────────────────
CORPUS_SIZE = 10000                             # target email count (config var)

# Realistic medium-city municipal-inbox source mix (counts sum to CORPUS_SIZE).
# These are the streams that all "resolve to the same RAG database".
SOURCE_MIX = {
    "residents":   4600,   # constituent email (the inbox), incl. hero scenarios
    "interdept":   2100,   # interdepartmental memos / routing / status
    "police":       750,   # PD daily incident reports (blotter)
    "fire":         650,   # Fire/EMS daily run reports
    "business":    1100,   # licensing, signage, development, corridor
    "civic":        800,   # council/agenda, FOIA, vendors, regional agencies
}

# 3-year window ending shortly before the demo date (2026-06-20).
CORPUS_START = _dt.date(2023, 6, 20)
CORPUS_END = _dt.date(2026, 6, 22)

# The inbox we are searching belongs to the Mayor.
MAYOR_NAME = "Mayor Daniel R. Okonkwo"
MAYOR_EMAIL = "mayor@bellwood-demo.gov"
STAFF_DOMAIN = "bellwood-demo.gov"

# Topic taxonomy (poc.emails.topic).
TOPICS = [
    "roads",            # potholes, plowing, striping, signage
    "water_billing",    # bills, meters, shutoffs, billing disputes
    "drainage",         # flooding, sewer backups, storm drains, grading
    "code_enforcement", # weeds, junk, derelict property, parking
    "permits",          # building/driveway/fence permits, inspections
    "sanitation",       # garbage, recycling, bulk pickup, missed pickups
    "parks_events",     # Taste of Bellwood, park upkeep, programming
    "business",         # licensing, operating hours, signage, development
    "foia",             # records requests
    "complaint",        # catch-all grievances (noise, conduct, etc.)
    "thanks",           # gratitude / positive feedback
    "public_safety",    # police department daily incident reports (blotter)
    "fire_ems",         # fire department / EMS daily run reports
]

# ──────────────────────────────────────────────────────────────────────────
# Embeddings
# ──────────────────────────────────────────────────────────────────────────
EMBED_MODEL = "text-embedding-3-small"
EMBED_DIMS = 1536
EMBED_BATCH = 128                               # inputs per OpenAI embeddings call
EMBED_PRICE_PER_1M_TOKENS = 0.02                # USD, text-embedding-3-small
EMBED_ENCODING = "cl100k_base"                  # tiktoken encoding for chunking

# Optional grounded-answer synthesis in query.py --answer (chat model).
ANSWER_MODEL = "gpt-4o-mini"
ANSWER_PRICE_NOTE = "~$0.15/1M in, ~$0.60/1M out — fractions of a cent per question"

# ──────────────────────────────────────────────────────────────────────────
# Chunking
# ──────────────────────────────────────────────────────────────────────────
CHUNK_MAX_TOKENS = 450                          # ~300-500 token target
CHUNK_OVERLAP_TOKENS = 50
CHUNK_MIN_TOKENS = 20                           # don't emit tiny trailing chunks alone

# ──────────────────────────────────────────────────────────────────────────
# Database
# ──────────────────────────────────────────────────────────────────────────
SCHEMA = "poc"

# ──────────────────────────────────────────────────────────────────────────
# AI Chief of Staff — canonical pipeline (additive; the poc vars above are
# untouched so the existing OpenAI pipeline keeps working through the cutover).
# ──────────────────────────────────────────────────────────────────────────
CANONICAL_SCHEMA = "canonical"
DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001"

# Voyage embeddings — voyage-4-large @ 1024 (verified current; supersedes voyage-3).
# Parameterized so the dimension is set in ONE place and never hard-coded downstream.
VOYAGE_API_KEY = os.environ.get("VOYAGE_API_KEY", "").strip()
CANONICAL_EMBED_MODEL = os.environ.get("VOYAGE_MODEL", "voyage-4-large").strip()
CANONICAL_EMBED_DIM = int(os.environ.get("VOYAGE_DIM", "1024"))
VOYAGE_PRICE_PER_1M_TOKENS = 0.12               # voyage-4-large list price (cost-gate display only)
# Voyage input_type asymmetry: documents embedded as "document", queries as "query".
VOYAGE_INPUT_DOCUMENT = "document"
VOYAGE_INPUT_QUERY = "query"

# Claude routing (graduated autonomy). 70/20/10 Haiku/Sonnet/Opus blended.
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "").strip()
CLAUDE_HAIKU = os.environ.get("HAIKU_MODEL", "claude-haiku-4-5").strip()
CLAUDE_SONNET = os.environ.get("SONNET_MODEL", "claude-sonnet-4-6").strip()
CLAUDE_OPUS = os.environ.get("OPUS_MODEL", "claude-opus-4-8").strip()

# ──────────────────────────────────────────────────────────────────────────
# Scripted demo questions (query.py --demo). This is the answer key.
# ──────────────────────────────────────────────────────────────────────────
DEMO_QUESTIONS = [
    "What's the full history on the drainage and flooding problem at the property on Bohland Ave?",
    "What's our history with Gloria Bennett, and how should I handle her latest email?",
    "How have we handled noise and operating-hours complaints from businesses on St. Charles Road?",
    "What's still open right now that I haven't resolved?",
    "Summarize everything related to flooding and drainage this spring.",
    "Who has emailed me the most, and what about?",
    "Cross-reference the police and fire reports with resident complaints about the "
    "St. Charles Road bars — what's the full picture across every source?",
]


def require(name: str, value: str) -> str:
    """Fail loudly with a helpful message when a required secret is missing."""
    if not value:
        raise SystemExit(
            f"[config] {name} is not set. Add it to {ROOT / '.env'} "
            f"(see .env.example) and re-run."
        )
    return value
