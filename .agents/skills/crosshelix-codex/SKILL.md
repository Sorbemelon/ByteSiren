---
name: crosshelix-codex
description: Use for non-trivial Codex repo work that needs current local evidence, precise repo-term retrieval, docs/spec sync support, responsibility and impact review, guardcheck interpretation, and safe handoff memory. Skip trivial, formatting-only, already-open one-file edits, and non-repo questions.
---
<!-- BEGIN CROSSHELIX MANAGED BLOCK -->
# CrossHelix for Codex

Use this skill when Codex needs local repo-integrity evidence beyond the short `AGENTS.md` pointer. CrossHelix is a local, deterministic evidence layer for repo structure, indexed files, symbols, map links, sessions, decisions, notes, feedback, responsibility areas, impact, freshness, and handoff memory. Treat every result as evidence, not truth.

Codex still owns live reading, editing, shell work, and validation. CrossHelix does not edit source, does not run Codex tools, does not call LLM/cloud/vector services by default, does not perform Git merge/rebase/switch/commit/push, does not guarantee correctness, and does not replace human review or tests.

## Use / skip decision

Use CrossHelix for non-trivial repo work:

- unfamiliar code areas or vague repo tasks
- multi-file or responsibility-sensitive changes
- docs/spec/source synchronization that needs implementation evidence
- impact/test selection before or after edits
- continuation from another agent/session
- guardcheck or handoff before asking for acceptance
- stale, dirty, or broad repo state where indexed evidence may matter

Skip CrossHelix for:

- non-repo questions or general brainstorming
- formatting/spelling-only changes
- obvious one-line edits in an already-open file
- tiny tasks where direct reading is cheaper
- tasks where the user only wants a direct answer

It is fine to say: `CrossHelix was not needed for this trivial/non-repo task.`

## Freshness gate before retrieval

Before `search` or `prepare`, check `crosshelix status` or `crosshelix overview`.

- `current_for_head`: indexed evidence matches committed HEAD.
- `uncommitted worktree delta`: live files changed after the indexed snapshot; inspect live files before trusting indexed content.
- `stale_to_head`, missing index, stale graph, or a reindex recommendation: run `crosshelix reindex --full` when local writes are allowed.
- Audit-only or read-only work: do not reindex unless allowed; record stale evidence as a limitation.

Freshness is the main quality gate. On stale repos, broad `prepare` and `search` can return weak, guide/script-heavy, or empty refs.

## Query discipline

Do not pass the raw user prompt into CrossHelix by default. Convert the task into precise repo terms: symbols, functions, classes, commands, config keys, file stems, module paths, endpoint names, model names, or a short subsystem phrase.

For vague tasks, first use the repo shape to choose better terms:

```text
crosshelix overview
crosshelix search "auth login handler"
crosshelix prepare "auth login handler" --agent codex
```

If results are weak, do not assume CrossHelix is wrong. Narrow the query to exact repo terms from the output or live files:

```text
crosshelix search "AuthService validateSession"
crosshelix search "routes auth middleware token"
crosshelix prepare "AuthService validateSession tests" --agent codex
```

## Light-first workflow

Use the smallest useful path; do not run every command.

```text
status/overview -> reindex if stale and allowed -> search or prepare -> live reads -> responsibility/impact as needed -> edit + validate -> guardcheck -> handoff/memory when useful
```

1. Run `crosshelix status` or `crosshelix overview` for freshness and repo shape.
2. Reindex only when stale/missing and allowed.
3. Use `crosshelix search "<repo terms>"` for targeted lookup, or `crosshelix prepare "<short task terms>" --agent codex` for a focused implementation pack.
4. Use Codex file-reading tools before editing. Indexed content is not a substitute for live files.
5. Use `crosshelix expand file:<path>` only when indexed content is useful; it may flag drift.
6. Use `crosshelix neighbors file:<path> --limit 5` for map/retrieval neighbors and memory links, not as a call graph.
7. Use `crosshelix trace file:<path>` only when session, decision, note, feedback, or usage evidence matters.
8. Use `crosshelix responsibility map` before structure-sensitive or broad edits.
9. Use `crosshelix impact --files ...`, `--staged`, `--since`, or `--range` to choose review and test focus.
10. Run project validation, then `crosshelix guardcheck` before asking for acceptance on meaningful work.

Keep heavy reports for risky or broad changes, stale/repair investigations, guardcheck warnings, or explicit human requests.

## Docs / spec / source-sync workflow

For docs/spec synchronization, CrossHelix provides implementation evidence. It does not decide the canonical scope.

Use this flow:

1. `crosshelix status` or `overview`.
2. `crosshelix reindex --full` if stale and allowed.
3. Targeted `search` using implementation constants, endpoint names, model names, commands, file stems, or source-doc names.
4. `prepare "<short docs/spec sync terms>" --agent codex` only after the terms are precise.
5. Read live implementation files and approved source docs.
6. Compare evidence against the project’s source-of-truth mechanism: specs, ADRs, RFCs, Scopian, or human-approved scope docs.
7. If CrossHelix conflicts with the source of truth, produce a candidate mismatch/stale-spec list. Do not promote CrossHelix evidence into canonical docs without the project’s approval process.

If `prepare` says implementation refs or document-role refs are weak, treat that as retrieval quality evidence. Try a narrower query using exact constants, endpoint paths, model names, command names, or doc file stems.

## Guardcheck interpretation

`crosshelix guardcheck` is a risk/evidence review, not a release gate by itself.

- Treat source-edit safety findings, stale index, suspicious markers, generated artifacts, and impacted tests as review signals.
- Operational memory hygiene warnings, branch-lineage warnings, missing feedback records, or dirty-worktree warnings may be limits rather than product blockers.
- Explain which guardcheck findings affect the change and which are tool/process hygiene.
- Do not fabricate feedback or memory just to satisfy guardcheck.

## Memory, usage, and feedback

CrossHelix cannot read private agent transcripts. Record only evidence that will help a future human or agent.

Use memory after meaningful work, not for every tiny task:

```text
crosshelix log-usage --agent codex --files "src/services/auth_service.py,tests/test_auth_service.py" --note "Used service and test context."
crosshelix session update --agent codex --task "auth service validation" --status completed --files "src/services/auth_service.py,tests/test_auth_service.py" --note "Validated auth service behavior."
crosshelix note add --agent codex --type handoff --text "Validation complete; review token expiry edge cases next." --files "src/services/auth_service.py"
crosshelix decision add --state approved --text "Auth validation remains in the service layer."
```

For decisions, ask the human first, then record the approved or rejected decision. Use `decision replace decision:<id> --text "..."` when a new approved decision supersedes an older one.

Record feedback only when context was genuinely useful, stale, unhelpful, conflicting, too broad, or too narrow. Tie feedback to the real target: `brief:latest` for current prepare output, or exact `file:...` / `symbol:...` refs for code.

```text
crosshelix feedback add --agent codex --type useful_context --target brief:latest --reason "Brief surfaced the service file that guided the edit."
```

Do not fabricate notes, decisions, feedback, usage, tests, validation evidence, or handoff evidence.

## Snippet and output discipline

Prefer refs, file paths, evidence summaries, and test results over large pasted snippets. Use snippets only when the exact code matters for review. Avoid raw `.crosshelix/` content, ignored-file content, secrets, huge command output, or long copied diffs. If CrossHelix output is snippet-heavy, summarize the evidence and point to refs.

## Safety boundaries

Keep secrets private. Never put credentials, tokens, private env values, ignored-file contents, or `.crosshelix/` contents into notes, feedback, decisions, prompts, examples, or final answers. Do not ask CrossHelix to expand ignored or secret-like paths such as `.env`, `*.pem`, `*.key`, `id_rsa`, `*secret*`, or `*credential*`. Respect `.gitignore` and `.crosshelixignore`. Avoid unnecessary god-modules and structure drift. Ask or confirm when CrossHelix evidence conflicts with user intent or live repo reality.

## Quick reference

```text
crosshelix status
crosshelix overview
crosshelix reindex --full
crosshelix search "auth_service validateSession"
crosshelix prepare "auth service validation" --agent codex
crosshelix expand file:src/services/auth_service.py
crosshelix neighbors file:src/services/auth_service.py --limit 5
crosshelix responsibility map
crosshelix impact --files src/services/auth_service.py tests/test_auth_service.py
crosshelix guardcheck
crosshelix handoff
crosshelix session update --agent codex --task "auth service validation" --status in_progress --files "src/services/auth_service.py" --note "Reviewing validation flow."
crosshelix log-usage --agent codex --files "src/services/auth_service.py" --note "Used service context."
crosshelix feedback add --agent codex --type useful_context --target brief:latest --reason "Brief surfaced the service context."
```

The installed CrossHelix CLI is the source of truth for available commands.
<!-- END CROSSHELIX MANAGED BLOCK -->
