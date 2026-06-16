<!-- BEGIN CROSSHELIX MANAGED BLOCK -->
# CrossHelix for Codex

Use CrossHelix only for non-trivial repo work where local repo evidence helps: unfamiliar areas, broad edits, responsibility-sensitive changes, impact/test focus, or handoff.

CrossHelix is installed in this repo. Use CrossHelix for this repo. Detailed CrossHelix skill: `.agents/skills/crosshelix-codex/SKILL.md`.

Skip CrossHelix for trivial edits, non-repo questions, already-visible one-file fixes, and tiny work where direct reading is cheaper. Do not pass the exact noisy user prompt into CrossHelix; convert the task into precise repo terms, and run `crosshelix reindex --full` if `crosshelix status` shows a missing or stale index before relying on `prepare`/`search`.
<!-- END CROSSHELIX MANAGED BLOCK -->

<!-- SCOPIAN-GUIDE-START agent=codex version=v0.2.5-A -->
# Scopian Instructions for Coding Agents

Use Scopian only for repository planning/building or scope-sensitive code work.

Do not use Scopian for casual, non-repo, translation, summarization, or general explanation tasks.

AGENTS.md is a project instruction file used by multiple coding agents, not only Codex.

For detailed Scopian workflow, use `.agents/skills/scopian/SKILL.md` when available.

Core workflow:
1. Run `scopian view index --format=pack`.
2. Inspect exact refs with `scopian section show <ref>`.
3. Convert noisy user requests into concise scope-check phrases in source vocabulary.
4. Run `scopian guard "<scope-check phrase>" --format=minimal` or `--format=pack`.
5. Treat guard as evidence retrieval, not a scope decision.
6. Decide from evidence and log with `scopian decision record agent`.
7. Ask the user for B/D, mixed, or insufficient evidence.
8. Use glossary only for user-confirmed semantic bridges.
9. Use buffer decisions only for real user-approved scope decisions.

Do not silently expand scope.
Use the current command surface only.
<!-- SCOPIAN-GUIDE-END agent=codex -->
