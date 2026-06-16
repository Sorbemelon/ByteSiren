---
name: scopian
description: Evidence-first Scopian workflow for repo planning/building tasks; protect source boundaries, retrieve scope evidence, decide as agent, log decisions, and ask users before B/D or source-of-truth changes.
---

<!-- SCOPIAN-GUIDE-START agent=claude version=v0.2.5-skill-refine -->
# Scopian Skill — Claude

## Core model

Scopian is a local scope-evidence retriever for repository planning and building.

Scopian does not decide scope truth. Claude must decide from evidence, explain uncertainty, and ask the user when source boundaries, B/D evidence, or insufficient evidence could affect the work.

Authority order:

1. selected Scope Sources in the Active Scope View
2. approved Scope Buffer records
3. view-local `context.yml` as retrieval wiring only
4. generated files as projections, not source of truth

Use Scopian to make scope evidence visible, citable, and hard to skip. Do not turn it into an autonomous classifier.

## Use Scopian when

Use Scopian for non-trivial repository planning/building, especially when the request may touch:

- product behavior
- repo files/folders
- generated docs/artifacts
- `docs/scopian/sources/`
- `docs/scopian/source_registry.yml`
- billing, payment, auth, RBAC, privacy, database, deployment, external integration, destructive data, uploads, or security-sensitive behavior
- source/spec sync, missing source docs, or implementation/spec drift

Do not use Scopian for casual conversation, non-repo questions, translation, generic explanations, personal advice, or tiny wording answers that do not plan/build/change the repo.

## Current command names

There is no top-level `status`, `diff`, or `repo`.

Use:

```bash
scopian inspect              # read-only health/status
scopian check diff           # change-set drift check
scopian check repo           # broader repo-vs-scope coverage check
scopian merge integrate      # after external/branch merges only
```

If the executable is unavailable, use the module form used by the project:

```bash
PYTHONPATH=src py -3.11 -m scopian <command>
```

## Efficient Scopian workflow

For non-trivial repo work:

1. Check health only when useful:
   ```bash
   scopian inspect
   ```
   Do not run full inspect on every tiny task.

2. Retrieve the active scope surface:
   ```bash
   scopian view index --format=pack
   ```

3. Inspect exact source refs:
   ```bash
   scopian section show <ref>
   ```

4. Convert noisy user wording into concise scope-check phrases. Preserve the risky action and affected object/system. Split multi-topic prompts.

   Bad:
   ```bash
   scopian guard "Can you build the whole workspace settings page with billing, invitations, checkout, and team role management?"
   ```

   Better:
   ```bash
   scopian guard "billing checkout" --format=pack --no-write
   scopian guard "team invitations" --format=pack --no-write
   scopian guard "workspace settings" --format=minimal
   ```

5. Use no-write guard for planning-only/review-only phases:
   ```bash
   scopian guard "<scope-check phrase>" --format=pack --no-write
   ```

6. Use minimal for routine evidence checks and pack for risky/ambiguous/B-D-near checks:
   ```bash
   scopian guard "<scope-check phrase>" --format=minimal
   scopian guard "<scope-check phrase>" --format=pack
   ```

7. Decide from evidence. If the phase allows Scopian artifact writes and the decision matters, log the agent decision:
   ```bash
   scopian decision record agent \
     --task "<scope-check phrase>" \
     --evidence-statement <evidence_statement> \
     --decision proceed|ask_user|stop|needs_human \
     --evidence-ref <ref> \
     --rationale "<short rationale from cited evidence>" \
     --agent claude
   ```

8. If the user explicitly approves a scope interpretation/change, record that separately:
   ```bash
   scopian buffer record decision ...
   ```

9. After implementation, use:
   ```bash
   scopian check diff
   ```
   for change-set drift. Use `scopian check repo` only for broader repo-vs-current-scope coverage.

10. If the current build has no Scopian attempt-record command, finish with a compact implementation completion log in the final response or handoff:
    - task
    - result: success / partial / failed / blocked
    - changed files
    - validation run
    - Scopian evidence/decision refs used
    - remaining risks

Do not invent an unavailable Scopian command.

## Read guard output correctly

Guard is an evidence retriever.

Evidence statement guide:

- `blocking_evidence_found`: B evidence applies or may apply. Do not edit. Ask/stop and log.
- `decision_evidence_found`: D evidence applies or may apply. Ask user before editing.
- `mixed_evidence_found`: A/L plus B/D evidence. Reconcile by meaning; usually ask.
- `no_blocking_evidence_found`: no direct B/D evidence was retrieved. This is not proof of in-scope.
- `insufficient_evidence`: selected evidence is missing/weak. Inspect more or ask.

Exit code 0 is not approval. It means no direct blocking/decision evidence was found in retrieved evidence.

## Source-of-truth boundary rules

Treat these as protected:

```text
docs/scopian/sources/**
docs/scopian/source_registry.yml
docs/scopian/views/<view>/VIEW.md
```

A missing source file, new source concept, or implementation/spec mismatch is a scope-control event, not an automatic file-creation task.

Use this decision table:

| Situation | Claude behavior |
|---|---|
| Known source update within existing source meaning | Edit existing source only after evidence review and phase approval. |
| New context not represented in sources | Prepare Buffer candidate and ask user. |
| Additional implementation detail not represented in sources | Prepare Buffer candidate and ask user. |
| Implementation deviates from current source spec | Prepare Buffer candidate and ask user. |
| Missing requested source file | Ask user whether to merge, keep Buffer-only, or approve a new source. |
| New source file | Ask user first. |
| Source registry change | Ask user first. |
| Generated view refresh | Run only after approved source/registry edits. |

Hard stops:

- Do not register a new source because implementation evidence exists.
- Do not promote private progress-report facts into public source docs without user approval.
- Do not treat `no_blocking_evidence_found` as permission to edit sources.
- Do not turn a requested-but-missing source filename into an automatic registry change.
- Do not refresh generated views in a planning-only phase.

## Buffer-first source/spec sync workflow

For source-spec sync or Scopian source edits:

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
3. Run a no-write guard:
   ```bash
   scopian guard "<source spec sync task>" --format=pack --no-write
   ```
4. Detect source gaps, missing source files, implementation/spec deviations, and extra implementation context.
5. Prepare Buffer candidates in your plan. Do not write real buffer records yet.
6. Ask the user which path is approved:
   - merge into existing registered source
   - keep Buffer-only
   - create/register a new source later
7. Only after explicit approval, perform the approved source/buffer/registry action.
8. Refresh generated views only after approved source/registry edits:
   ```bash
   scopian view refresh
   ```

`buffer record decision` requires user-approved summary text and a real user reply excerpt. Do not fake approval.

## Write policy

- `guard --format=minimal` does not write a GUARD record by default.
- `guard --format=pack` writes a GUARD record by default.
- Use `--no-write` for planning-only/review-only phases.
- Use `--write` only when a GUARD record is intentionally needed.

## Glossary bridges

Use glossary only for user-confirmed recurring semantic bridges.

Example:
- user says `prune`
- source says `permanent deletion`

Ask the user if these mean the same scope concept. If confirmed, record and approve glossary. Glossary helps retrieval; it does not approve scope.

## CrossHelix handoff

Use Scopian first for scope. Use CrossHelix afterward for repo/code context and integrity.

Do not ask CrossHelix to re-derive active scope unless the task is about Scopian docs, scope traceability, or documentation/audit work.

## Never do

- Do not silently expand scope.
- Do not use removed commands: `scopian sections` or `scopian source`.
- Do not use top-level `status`, `diff`, or `repo`; use `inspect`, `check diff`, and `check repo`.
- Do not edit/register sources or source registry without explicit approval.
- Do not record a Buffer decision unless the user explicitly approved the buffer summary.
- Do not run Scopian for non-repo/non-build tasks.
<!-- SCOPIAN-GUIDE-END agent=claude -->
