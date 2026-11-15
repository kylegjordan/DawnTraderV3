# B-CONVERSATION-INDEX — inputs gathered before Step 1 (Infra Claude, 2026-11-16)

> Placed by Kyle: KD-83 (widened 2026-11-15T23:26:20Z) and KD-88 (`pm/DECISIONS.md`), pre-sprint after B-TOKEN-WATCH-FOLLOWUP-MEMORY's 48-hour read. Langston's shape ruling `1571670111532621857`: conditions 1-5; P1 census of all sources first. KD-88 brings the Codex chats in (supersedes KD-1 for #1238's Codex leg); Langston and Coltrane wait on Kyle's yes, asked with the two cost figures through PM.

## Existing archive coverage (measured 2026-11-16 ~00:45Z, laptop `~/.claude/transcript-archive`, dated day files per alias)
- Earliest day file: CC-A 2026-04-15 · CC-B 05-11 · CC-C 05-11 · CC-INFRA 07-23 · CC-PM 11-04; all run to 11-15.
- Days 2026-08-01..11-15 with NO day file from any alias (15): 08-02, 08-08, 08-11..08-15, 08-23, 09-17, 10-14, 10-15, 11-01, 11-02, 11-11, 11-12. Not yet classified (Codex-crew days vs trimmed history the Drive additive backup may hold) — P1 settles it. Nested transcripts carry no date in their name and are not in this count.

## Command Center's method (its own description from its notes, 2026-11-16; NOT re-read at its code — read its docs before reuse)
- Kyle's separate Command Center system (repo `C:\CommandCenter`; docs `docs/INDEX_PLAN.md`, `SEARCH_FIX_PLAN.md`, `SYSTEM_MANUAL.md`, `BLUEPRINT.md` = rebuild kit; eval set `tools/kb_eval.py`). Read only; change nothing there; Kyle's private Drive folder is out of scope.
- Per-source SQLite (keyword) + one compact vector index (faiss IVF-PQ with rescore, ~0.7 GB); originals stay where they are, only the index is kept.
- Long-running per-source crawlers under systemd; heavy OCR/embedding worker at low priority; vectors refresh hourly; heartbeats + a usage card + a daily alert; after a restart confirm counts move.
- Index built from extracted text + local embeddings, not per-item model summaries — so no per-item API cost. Models used at question time over search results.
- Dedup by SHA-256; every result carries source type + source id so it opens the original.
- Its lessons: build status/heartbeat first; never run crawlers from a folder a deploy replaces; test search as the app's own user (root-owned SQLite -shm files hid half the databases); cap results per document; size for the vector index before it grows.
- ⇒ Design question for Step 1/2: KD-83 says "use lesser model agents"; Command Center indexes text with local embeddings instead. Measure both on a sample (cost + search quality) before quoting Kyle.
