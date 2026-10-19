---
title: "Reading what the compiler says"
description: "Where diagnostics appear, and how to check a whole project in CI."
sidebar:
  order: 4
---

Every build prints Hozo's diagnostics: `@hozo/vite` warns per file, and `@hozo/metro` stops on an error. To check a whole project without building it, for an agent's loop or for CI, run the audit:

```sh
npx @hozo/migration-audit . --format json
```

Each finding carries its `file`, `location.line` and `location.column`, its `code` and `severity`, and a message that says what to change. For example, a `role="heading"` with no `aria-level` produces `ARIA_INCOMPLETE_PATTERN`.

There is no editor or linter plugin, and none is planned (#263). The diagnostics already reach whoever runs the build, and in an agent-driven loop that is the agent.
