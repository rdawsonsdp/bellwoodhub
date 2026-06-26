"""
ingest/ — the ingestion plane (R1: connectors ONLY land data into the canonical
model; no capability ever reads a raw source).

The five-step connector contract (design §5):
    1. pull       — source-specific acquisition
    2. normalize  — to one Envelope (who/what/when/where/department/source/source_ref)
    3. resolve    — entities against the shared assertion ledger (deterministic
                    inline; ambiguous → review queue, never a silent hard-merge)
    4. classify   — department / topic / urgency / sensitivity / PII
    5. index_emit — chunk, embed, write canonical, emit a change event

Adding the Nth source touches zero capability code — only a new Connector.
"""
from .envelope import Envelope, ingest_key

__all__ = ["Envelope", "ingest_key"]
