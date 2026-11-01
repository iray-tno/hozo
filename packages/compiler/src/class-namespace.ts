import type { SourceEdit } from './source-provenance.ts'

/**
 * Renames this component's `hozo-N` class names to be unique across every
 * component in the project.
 *
 * `compile()` starts counting from `hozo-0` independently per root, so two
 * components in the same source file would collide once their CSS is merged
 * into one companion file. `rootIndex` settles that half.
 *
 * `scope` settles the other half, and it was missing. Every *module* also
 * started again at `hozo-r0-0`, and the companion stylesheets are all
 * loaded into one document -- so a page holding two compiled modules had
 * two unrelated rule sets answering to `.hozo-r0-8`, and the one that
 * loaded last styled both. In the Storybook demo that made an `<article>`
 * whose only class was `space-y-2` come out on a red background: the
 * destructive button's rules, from another file entirely.
 *
 * `hozo-view` and the other wordless base classes are intentionally shared
 * and must NOT be touched by this; the digits are what makes a name local.
 *
 * The lookahead rather than `\b` so a name that already carries a scope
 * cannot be rewritten a second time -- an all-digit hash would otherwise
 * read as the counter.
 */
export function namespaceHozoClasses(
  text: string,
  rootIndex: number,
  scope: string,
  edits?: SourceEdit[],
): string {
  if (!edits) return text.replace(/\bhozo-(\d+)(?![\w-])/g, `hozo-${scope}-r${rootIndex}-$1`)
  return text.replace(/\bhozo-(\d+)(?![\w-])/g, (match, counter, offset) => {
    const replacement = `hozo-${scope}-r${rootIndex}-${counter}`
    edits.push({ spanStart: offset, spanEnd: offset + match.length, replacement })
    return replacement
  })
}
