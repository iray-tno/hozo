# Upstream gh-stack skill

This repository vendors the official GitHub skill so agents can read the same
reviewed workflow without relying on a machine-specific installation.

- Repository: [github/gh-stack](https://github.com/github/gh-stack)
- Release: `v0.2.1`, matching the CLI used when this copy was installed
- Commit: `29a36d314be664583705f18e41cebdf2b61ad514`
- Source directory: [`skills/gh-stack`](https://github.com/github/gh-stack/tree/29a36d314be664583705f18e41cebdf2b61ad514/skills/gh-stack)
- License: [MIT](LICENSE), copied from that commit's repository root

`SKILL.md` and the three files under `references/` are unmodified upstream
files. The skill's own metadata says `0.2.0` in the `v0.2.1` release; this is
upstream metadata, not a reason to rewrite it or fetch a floating branch.
`UPSTREAM.md` is Hozo's provenance note; `AGENTS.md` owns Hozo-specific policy.

Installed with the Codex skill-installer helper using these arguments:

```text
--repo github/gh-stack --path skills/gh-stack
--ref 29a36d314be664583705f18e41cebdf2b61ad514 --dest .agents/skills
```

To update, choose an explicit upstream release/commit alongside the intended
CLI version, inspect the skill/reference diff, retain the license and update
this note in the same PR. Do not overwrite an existing installation or follow
upstream `main` automatically. When an installed CLI differs, inspect its
actual `--help` before using a flag from the skill. Skill examples do not grant
permission to merge, prune or modify another agent's stack/worktree.
