import { parse } from 'postcss'

/** A read-only consumer must not ask Tailwind to execute project modules. */
export class ExecutableStylesheetError extends Error {}

export function assertStaticStylesheet(css: string, file: string): void {
  // Parse CSS, not substrings: comments, quoted values and selectors can all
  // contain the word @plugin without asking Tailwind to load a module.
  const ast = parse(css, { from: file })
  ast.walkAtRules((rule) => {
    const name = rule.name.toLowerCase()
    if (name === 'plugin' || name === 'config' || rule.name.includes('\\')) {
      throw new ExecutableStylesheetError(
        `${file}:${rule.source?.start?.line ?? '?'}: @${rule.name} requires executable or unassessed configuration; not assessed`,
      )
    }
    if (
      (name === 'import' || name === 'reference') &&
      /(?:https?:|data:|\/\/)/i.test(rule.params)
    ) {
      throw new ExecutableStylesheetError(
        `${file}:${rule.source?.start?.line ?? '?'}: remote stylesheet imports are not assessed`,
      )
    }
  })
}
