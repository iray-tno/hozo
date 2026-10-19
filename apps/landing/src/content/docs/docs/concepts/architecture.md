---
title: "Architecture"
description: "From source, through one IR, to the Web and Native backends."
sidebar:
  order: 2
---

```
                       Application
                           │
             ┌─────────────┴─────────────┐
             │                           │
        @hozo/core                Existing RN code
             │                           │
             └─────────────┬─────────────┘
                           │
                           ▼
                    Hozo Compiler
                      (Rust core)
                           │
             ┌─────────────┼─────────────┐
             │             │             │
          Style IR    Semantic IR    Diagnostics
             │             │             │
             └─────────────┼─────────────┘
                           │
                       Hozo IR
                           │
             ┌─────────────┴─────────────┐
             │                           │
         Web backend                Native backend
             │                           │
        DOM + CSS + ARIA           React Native
        semantic HTML              View / Text
                                     StyleSheet
```
