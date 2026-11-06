import type { SourceEdit, SourceProvenance } from '@hozo/compiler/lower'
import type { InstanceOwnerCallerPreview } from '@hozo/compiler/project'

/** Compose only compiler-issued edits in proven unchanged Native source runs.
 * No search, reparsing or diff of generated JSX can authorize a mapped site.
 * A failure anywhere retains the entire ordinary output and its raw classes.
 */
export function composeNativeOwnerCaller(
  source: string,
  ordinary: string | null,
  provenance: SourceProvenance,
  preview: InstanceOwnerCallerPreview['preview'],
): string | null {
  const output = ordinary ?? source
  const prelude = preview.modulePrelude
  if (
    !provenance.matches(output) ||
    !prelude ||
    !preview.edits.includes(prelude) ||
    prelude.spanStart !== prelude.spanEnd
  )
    return ordinary
  const edits: SourceEdit[] = []
  for (const edit of preview.edits) {
    const insertion = edit.spanStart === edit.spanEnd
    // A planner-issued module prelude at authored offset zero precedes imports
    // even if ordinary lowering removed/rehomed the original first import.
    // All other insertions must survive the exact source-provenance mapping.
    const range =
      edit === prelude && edit.spanStart === 0 && !source.startsWith('#!')
        ? { spanStart: 0, spanEnd: 0 }
        : insertion
          ? provenance.emittedInsertion(output, edit.spanStart)
          : provenance.emitted(output, edit.spanStart, edit.spanEnd)
    if (!range) return ordinary
    edits.push({ ...range, replacement: edit.replacement })
  }
  edits.sort((a, b) => a.spanStart - b.spanStart || a.spanEnd - b.spanEnd)
  if (
    edits.some(
      (edit, index) =>
        index > 0 &&
        (edit.spanStart < edits[index - 1]!.spanEnd ||
          edit.spanStart === edits[index - 1]!.spanStart),
    )
  )
    return ordinary
  let code = output
  for (const edit of edits.reverse())
    code = code.slice(0, edit.spanStart) + edit.replacement + code.slice(edit.spanEnd)
  return code
}
