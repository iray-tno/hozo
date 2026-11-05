// The modules compiled output imports, as Vite's dependency optimizer has to
// be told them (#1698).
//
// The optimizer finds a project's dependencies by scanning its source before
// any plugin has transformed it, so an import that only compiled output
// contains -- `@hozo/core/generated/text-input-dom-props` from a `TextInput`
// -- is discovered while serving instead. Vite then re-optimizes and reloads
// the page, which a dev server survives and Vitest's browser mode does not.
// Every cold cache, so every CI run, pays it.

import { createRequire } from 'node:module'
import path from 'node:path'
import { GENERATED_SPECIFIERS } from '@hozo/compiler/lower'

/**
 * The generated modules this project can resolve from an installed package.
 *
 * One the project cannot resolve is left out, because Vite reports every
 * `optimizeDeps.include` entry it fails to resolve: `@hozo/rn-compat` is a
 * name compiled output can import, and most projects never install it.
 *
 * A linked package -- a workspace `@hozo/core` -- is left out too. Vite does
 * not pre-bundle a linked package's main entry, so pre-bundling its
 * generated leaves alone would give them a second copy of every module they
 * share with it, contexts included. Vite serves a linked package as source,
 * which is what these imports then are as well, and they need no
 * optimization to be found.
 */
export function injectedDependencies(root: string): string[] {
  const require = createRequire(path.join(root, 'package.json'))
  return GENERATED_SPECIFIERS.filter((specifier) => {
    try {
      return require.resolve(specifier).split(path.sep).includes('node_modules')
    } catch {
      return false
    }
  })
}
