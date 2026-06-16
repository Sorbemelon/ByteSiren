<!-- BEGIN CROSSHELIX MANAGED BLOCK -->
# CrossHelix for Claude Code

CrossHelix is installed in this repo. Use CrossHelix for this repo when repo evidence helps non-trivial work. Detailed skill: `.claude/skills/crosshelix/SKILL.md`.

Skip it for trivial edits, non-repo questions, already-visible one-file fixes, and tiny work where direct reading is cheaper. CrossHelix gives evidence; Claude Code still uses Read/Edit/Grep and project tests for live work. Convert the task into precise repo terms, and run `crosshelix reindex --full` if `crosshelix status` shows a missing or stale index before relying on `prepare`/`search`.
<!-- END CROSSHELIX MANAGED BLOCK -->

<!-- SCOPIAN-GUIDE-START agent=claude version=v0.2.5-A -->
# Scopian for Claude Code

Use Scopian only for repo planning/building and scope-sensitive work.

Do not use Scopian for casual, non-repo, translation, summarization, or general explanation tasks.

Detailed skill: `.claude/skills/scopian/SKILL.md`.

Workflow:
1. `scopian view index --format=pack`
2. `scopian section show <ref>`
3. Rewrite noisy prompts into concise scope-check phrases using source vocabulary.
4. `scopian guard "<scope-check phrase>" --format=minimal|pack`
5. Treat guard output as evidence, not a decision.
6. Log agent decisions with `scopian decision record agent`.
7. Ask the user when B/D, mixed, or insufficient evidence applies.
8. Use glossary for user-confirmed semantic bridges.
9. Use buffer records only for user-approved decisions.

Guide install does not install hooks. Use `scopian hooks install --agent claude` separately if wanted.

Do not silently expand scope.
Use the current command surface only.
<!-- SCOPIAN-GUIDE-END agent=claude -->
