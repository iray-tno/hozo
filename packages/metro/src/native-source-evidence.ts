import type { CompiledSourceCopy } from '@hozo/compiler'

interface IdentifierEdit {
  start: number
  end: number
  delta: number
}

/** Renames each component's `hozoN`/`hozoN_suffix` style/JSX identifiers:
 * compileNative starts counting from hozo0 per root, so merging styles without
 * namespacing would collide. Evidence records this existing pass as it happens. */
export function namespaceHozoIdentifiers(
  text: string,
  rootIndex: number,
  changes?: IdentifierEdit[],
): string {
  if (!changes) return text.replace(/\bhozo(\d+)/g, `hozo_r${rootIndex}_$1`)
  return text.replace(/\bhozo(\d+)/g, (name, index, start) => {
    const replacement = `hozo_r${rootIndex}_${index}`
    changes.push({ start, end: start + name.length, delta: replacement.length - name.length })
    return replacement
  })
}

/** A copied fragment touched by renaming is no longer verbatim. Drop it as a
 * whole; untouched fragments shift by preceding edits in one ordered pass. */
export function namespaceNativeJsx(
  jsx: string,
  rootIndex: number,
  sourceCopies?: CompiledSourceCopy[],
) {
  if (!sourceCopies) return { text: namespaceHozoIdentifiers(jsx, rootIndex) }
  const changes: IdentifierEdit[] = []
  const text = namespaceHozoIdentifiers(jsx, rootIndex, changes)
  const copies: CompiledSourceCopy[] = []
  let at = 0,
    delta = 0
  for (const copy of sourceCopies) {
    while (at < changes.length && changes[at]!.end <= copy.emittedStart)
      delta += changes[at++]!.delta
    if (at < changes.length && changes[at]!.start < copy.emittedEnd) continue
    copies.push({
      ...copy,
      emittedStart: copy.emittedStart + delta,
      emittedEnd: copy.emittedEnd + delta,
    })
  }
  return { text, copies }
}
