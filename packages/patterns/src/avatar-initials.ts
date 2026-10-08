import type { useHozoMessage } from '@hozo/behaviors'

/**
 * The letters an avatar shows when it has no picture.
 *
 * A name written in words -- "Ada Lovelace" -- gives the first letter of its
 * first and last words, "AL", as every product that draws initials does. A
 * name written without spaces -- 田中太郎, 김민준 -- gives its first character
 * only: there is no word boundary to take a second letter after, and two
 * characters of a CJK name are a different, more personal abbreviation than
 * an application should guess at. A project that knows better passes
 * `initials` itself.
 *
 * Counted in graphemes, not code units, so an emoji or an accented letter
 * written with a combining mark is one letter rather than half of one.
 * `Intl.Segmenter` where the engine has it; otherwise code points, which are
 * right for everything except combining sequences.
 */
export function avatarInitials(name: string, locale?: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  const first = firstGrapheme(words[0] as string, locale)
  const last = words.length > 1 ? firstGrapheme(words[words.length - 1] as string, locale) : ''
  return (first + last).toLocaleUpperCase(locale)
}

function firstGrapheme(word: string, locale?: string): string {
  const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter
  if (typeof Segmenter === 'function') {
    const [first] = new Segmenter(locale, { granularity: 'grapheme' }).segment(word)
    return first?.segment ?? ''
  }
  return Array.from(word)[0] ?? ''
}

export type HozoAvatarStatus = 'online' | 'offline' | 'busy'

/** The name a reader hears, or `undefined` for a decorative avatar. */
export function avatarLabel(
  message: ReturnType<typeof useHozoMessage>,
  name: string | undefined,
  status: HozoAvatarStatus | undefined,
  explicit: string | undefined,
): string | undefined {
  if (explicit !== undefined) return explicit
  if (!name) return undefined
  if (!status) return name
  return message('hozo.avatar.label', { name, status: message(STATUS_KEY[status]) })
}

const STATUS_KEY = {
  online: 'hozo.avatar.statusOnline',
  offline: 'hozo.avatar.statusOffline',
  busy: 'hozo.avatar.statusBusy',
} as const
