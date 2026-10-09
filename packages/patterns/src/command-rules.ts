/**
 * Which commands a palette shows for what was typed, best first.
 *
 * A palette is searched by people who know roughly what they want and type
 * a fragment of it, so the ranking is the one that answers that: a label that
 * starts with the query beats one with a word starting with it, which beats
 * one merely containing it, which beats one whose letters only appear in
 * order ("prj" for "Create project"). `keywords` are searched the same way
 * and rank one step below the label, so "preferences" finds "Settings"
 * without outranking an exact label. Ties keep the order the commands were
 * given in, which is the application's order of importance.
 *
 * Case-insensitive and locale-aware (`toLocaleLowerCase`); the comparison is
 * of characters, not code units, so an accented letter counts once.
 */

export interface RankableCommand {
  label: string
  keywords?: readonly string[]
  disabled?: boolean
}

const PREFIX = 0
const WORD = 1
const CONTAINS = 2
const SUBSEQUENCE = 3
const NONE = Number.POSITIVE_INFINITY

function score(text: string, query: string, locale?: string): number {
  const haystack = text.toLocaleLowerCase(locale)
  if (haystack.startsWith(query)) return PREFIX
  if (haystack.split(/[\s\-_/.]+/).some((word) => word.startsWith(query))) return WORD
  if (haystack.includes(query)) return CONTAINS
  const letters = Array.from(haystack)
  let at = 0
  for (const character of Array.from(query)) {
    at = letters.indexOf(character, at)
    if (at === -1) return NONE
    at += 1
  }
  return SUBSEQUENCE
}

/** Indices into `commands`, best match first; every command when `query` is blank. */
export function rankCommands(
  commands: readonly RankableCommand[],
  query: string,
  locale?: string,
): number[] {
  const wanted = query.trim().toLocaleLowerCase(locale)
  if (wanted === '') return commands.map((_, index) => index)
  return commands
    .map((command, index) => {
      const label = score(command.label, wanted, locale)
      const keyword = Math.min(
        NONE,
        ...(command.keywords ?? []).map((word) => score(word, wanted, locale) + 0.5),
      )
      return { index, rank: Math.min(label, keyword) }
    })
    .filter((entry) => entry.rank !== NONE)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.index)
}

/**
 * The next command to make active, moving `step` from `from` and skipping the
 * disabled ones -- and stopping at the ends rather than wrapping, as a
 * listbox's arrow keys do in the Authoring Practices. `null` when nothing can
 * be active.
 */
export function nextActive(
  order: readonly number[],
  commands: readonly RankableCommand[],
  from: number | null,
  step: 1 | -1,
): number | null {
  const enabled = order.filter((index) => !commands[index]?.disabled)
  if (enabled.length === 0) return null
  if (from === null) return step === 1 ? (enabled[0] as number) : (enabled.at(-1) as number)
  const position = enabled.indexOf(from)
  if (position === -1) return enabled[0] as number
  const next = Math.min(Math.max(position + step, 0), enabled.length - 1)
  return enabled[next] as number
}
