---
title: "Getting started"
description: "Pick the page for your bundler or framework; they all take the same options."
sidebar:
  order: 0
  label: "Choose your stack"
---

Hozo plugs into the build you already have. Pick yours:

| Stack | Package | Page |
| --- | --- | --- |
| Vite 8+ | `@hozo/vite` | [Vite](./vite/) |
| Next.js (Turbopack or webpack) | `@hozo/next` | [Next.js](./next/) |
| React Native, Expo | `@hozo/metro` | [Metro](./metro/) |
| Astro | `@hozo/vite` | [Astro](./astro/) |
| Storybook | `@hozo/storybook` | [Storybook](./storybook/) |
| TanStack Start | `@hozo/vite` | [TanStack Start](./tanstack-start/) |

## The one option most projects need

Every integration takes the same options, and the only one most projects
need is `css` — the path to the Tailwind entry stylesheet that defines the
project's design tokens. Left out, Hozo looks for the usual filenames and
falls back to Tailwind's defaults if it finds none. If your tokens live
somewhere it did not guess, say so: a project compiled against the wrong
palette gets wrong numbers and unresolved variables, not an error.

## Before you start

- **Vite projects need Vite 8 or newer.** On Vite 6 or 7 the build fails at
  config load with an error that names neither Vite nor its version.
- **React Native 0.87 on Android needs one dependency pinned.** See
  [Metro](./metro/).
- If something else stops you, [Troubleshooting](../troubleshooting/) lists
  what others have hit.
