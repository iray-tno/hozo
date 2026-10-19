---
title: "Design decisions"
description: "Settled design questions, with the evidence and what would reopen them."
sidebar:
  order: 3
---

Some of Hozo's behaviour looks arbitrary until you know the investigation
behind it. Those answers are kept as decision records in the repository, each
with its evidence, what was rejected, and what would make it worth reopening.
The index, with every record, is
[docs/decisions](https://github.com/iray-tno/hozo/tree/main/docs/decisions).

The ones that most shape what you write:

- [002, What Hozo abstracts, and what it carries](https://github.com/iray-tno/hozo/blob/main/docs/decisions/002-what-hozo-abstracts.md)
- [003, Which Tailwind variants Hozo compiles](https://github.com/iray-tno/hozo/blob/main/docs/decisions/003-which-variants-hozo-compiles.md)
- [009, A caller's class beats a component's resting look and loses to its state](https://github.com/iray-tno/hozo/blob/main/docs/decisions/009-a-callers-class-sits-between-rest-and-state.md)
- [010, A module React Native can load writes primitives, not HTML elements](https://github.com/iray-tno/hozo/blob/main/docs/decisions/010-primitives-not-tags.md)

The design document, [docs/proposal.md](https://github.com/iray-tno/hozo/blob/main/docs/proposal.md),
is in Japanese.
