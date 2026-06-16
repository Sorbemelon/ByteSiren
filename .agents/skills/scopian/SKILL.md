---
name: scopian
description: Use for repo planning/building tasks that need Scopian scope evidence, source-boundary protection, guard evidence statements, agent decision logging, or post-implementation drift checks.
---

<!-- SCOPIAN-GUIDE-START agent=codex version=v0.2.5-skill-refine -->
# Scopian Skill — Codex

## Core model

Scopian is a local scope-evidence retriever for repository planning/building.

It does not decide scope truth. Codex decides from evidence, logs the agent decision when useful, and asks the user when source boundaries, B/D evidence, or insufficient evidence could affect the task.

Canonical scope authority, strongest first:

1. selected Scope Sources in the Active Scope View
2. approved Scope Buffer records
3. view-local `context.yml` as retrieval wiring only
4. generated files as projections, not source of truth

## Use Scopian when

Use Scopian before non-trivial repo planning/building, especially when the task may touch:

- product behavior or public docs
- `docs/scopian/sources/`
- `docs/scopian/source_registry.yml`
- generated Scopian view files
- billing, payment, auth, RBAC, privacy, database, deployment, external integration, destructive data, uploads, or security-sensitive behavior
- source/spec sync, missing source docs, or implementation/spec drift

Do not use Scopian for casual conversation, non-repo questions, translation, general explanation, or tiny wording answers that do not plan/build/change the repo.

## Command map: use current names

There is no top-level `status`, `diff`, or `repo` command.

Use:

```bash
scopian inspect              # read-only health/status
scopian check diff           # change-set drift check
scopian check repo           # broader repo-vs-scope coverage check
scopian merge integrate      # after external/branch merges only
```

If `scopian` is not installed in the shell, use the project runner form:

```bash
PYTHONPATH=src py -3.11 -m scopian <command>
```

## Efficient default workflow

For non-trivial repo work:

1. Inspect only if needed:
   ```bash
   scopian inspect
   ```
   Do not run full inspect on every tiny task.

2. Get the active evidence surface:
   ```bash
   scopian view index --format=pack
   ```

3. Inspect exact refs until the relevant vocabulary and A/L/B/D evidence are clear:
   ```bash
   scopian section show <ref>
   ```

4. Convert the user request into concise scope-check phrase(s). Do not pass noisy raw prompts by default.

   Bad:
   ```bash
   scopian guard "Can you build the whole workspace settings page with billing, invitations, checkout, and team role management?"
   ```

   Better split:
   ```bash
   scopian guard "billing checkout" --format=pack --no-write
   scopian guard "team invitations" --format=pack --no-write
   scopian guard "workspace settings" --format=minimal
   ```

5. Use `--no-write` for planning-only or review-only phases:
   ```bash
   scopian guard "<scope-check phrase>" --format=pack --no-write
   ```

6. Use minimal for routine checks; pack for risky/ambiguous/B-D-near checks:
   ```bash
   scopian guard "<scope-check phrase>" --format=minimal
   scopian guard "<scope-check phrase>" --format=pack
   ```

7. Decide from evidence. If the decision matters and artifact writes are allowed, log it:
   ```bash
   scopian decision record agent \
     --task "<scope-check phrase>" \
     --evidence-statement <evidence_statement> \
     --decision proceed|ask_user|stop|needs_human \
     --evidence-ref <ref> \
     --rationale "<short rationale from cited evidence>" \
     --agent codex
   ```

8. Implement only after the evidence/decision is clear.

9. After implementation, use drift checks:
   ```bash
   scopian check diff
   scopian check repo
   ```
   Use `check diff` for the changed set. Use `check repo` only when broader repo-vs-scope coverage is useful.

10. If no Scopian attempt command exists in the current build, provide a compact implementation completion summary in the final answer or handoff:
    - task
    - result: success / partial / failed / blocked
    - changed files
    - validation run
    - Scopian evidence/decision refs used
    - remaining risks

Do not invent an unavailable Scopian command.

## Read guard output correctly

Guard returns evidence statements, not permission.

- `blocking_evidence_found`: B evidence applies or may apply. Do not edit; ask/stop and log.
- `decision_evidence_found`: D evidence applies or may apply. Ask user before editing.
- `mixed_evidence_found`: A/L plus B/D evidence. Reconcile by meaning; usually ask.
- `no_blocking_evidence_found`: no direct B/D evidence was retrieved. This is not proof of in-scope.
- `insufficient_evidence`: not enough selected evidence. Inspect more or ask.

Exit code 0 does not mean "approved"; it only means no direct blocking/decision evidence was found in retrieved evidence.

## Source-of-truth boundary rules

Treat these as protected source-boundary files:

```text
docs/scopian/sources/**
docs/scopian/source_registry.yml
docs/scopian/views/<view>/VIEW.md
```

Do not create a new Scope Source, edit a source boundary, register a file, or refresh generated views just because implementation evidence exists.

Use this decision table:

| Situation | Codex behavior |
|---|---|
| Known update inside existing source meaning | Edit existing source only after evidence review and phase approval. |
| New context not represented in sources | Prepare Buffer candidate and ask user. |
| Implementation detail not represented in sources | Prepare Buffer candidate and ask user. |
| Implementation deviates from source spec | Prepare Buffer candidate and ask user. |
| Requested source file is missing | Ask user whether to merge into existing source, keep Buffer-only, or create/register a new source later. |
| New source file | Ask user first. |
| Source registry change | Ask user first. |
| Generated view refresh | Run only after approved source/registry edits. |

Hard stops:

- Do not register a new source because a file or implementation evidence exists.
- Do not promote private progress-report facts into public source docs without user approval.
- Do not treat `no_blocking_evidence_found` as permission to edit sources.
- Do not turn a requested-but-missing source filename into an automatic registry change.
- Do not refresh generated views in a planning-only phase.

## Buffer-first source/spec sync workflow

For source-spec sync or docs/scopian source edits:

1. Run:
   ```bash
   scopian inspect
   scopian sources list
   scopian view index --format=pack
   ```
2. Inspect relevant refs:
   ```bash
   scopian section show <ref>
   ```
3. Run a planning guard:
   ```bash
   scopian guard "<source spec sync task>" --format=pack --no-write
   ```
4. Detect:
   - source gaps
   - missing source files
   - implementation/spec deviations
   - extra implementation context not represented in sources
5. Prepare Buffer candidates in the plan; do not write them yet.
6. Ask the user which path to approve:
   - merge into an existing registered source
   - keep as Buffer-only
   - create/register a new source later
7. Only after explicit approval:
   - edit approved existing source docs, or
   - record approved Buffer decision, or
   - create/register a new source if the user explicitly approved that source-boundary change
8. Run:
   ```bash
   scopian view refresh
   ```
   only after approved source/registry edits.

`buffer record decision` requires a user-approved summary and a real user reply excerpt. Do not fabricate either.

## Write policy

- `guard --format=minimal` does not write a GUARD record by default.
- `guard --format=pack` writes a GUARD record by default.
- Use `--no-write` for planning-only phases.
- Use `--write` only when you intentionally want a GUARD record.

## CrossHelix handoff

Use Scopian first for scope. Use CrossHelix afterward for repo/code context and integrity.

Do not ask CrossHelix to re-derive active scope unless the task is specifically about Scopian docs, scope traceability, or audit work.

## Never do

- Do not silently expand scope.
- Do not use removed commands: `scopian sections` or `scopian source`.
- Do not use top-level `status`, `diff`, or `repo`; use `inspect`, `check diff`, and `check repo`.
- Do not edit/register sources or source registry without explicit approval.
- Do not record user approval unless the user actually approved.
- Do not run Scopian for non-repo/non-build tasks.
<!-- SCOPIAN-GUIDE-END agent=codex -->
