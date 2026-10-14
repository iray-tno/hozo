/**
 * What an `OtpInput` keeps from what was typed, pasted or autofilled.
 *
 * One function for both platforms, because the field is one real input and
 * everything arrives through it -- a keystroke, a paste of the whole code, the
 * operating system filling it from a text message. A code pasted with its
 * spaces or dashes ("123 456", "123-456") is the code; a letter in a numeric
 * code is not part of it.
 */

export type OtpType = 'number' | 'text'

export function otpValue(raw: string, length: number, type: OtpType): string {
  const kept = type === 'number' ? raw.replace(/\D/g, '') : raw.replace(/[\s-]/g, '')
  return Array.from(kept).slice(0, Math.max(0, length)).join('')
}

/** Which cell the next character lands in; the last one once the code is whole. */
export function otpActiveIndex(value: string, length: number): number {
  return Math.min(Array.from(value).length, Math.max(0, length - 1))
}

/** Host selections use UTF-16 offsets; virtual cells count code points. */
export interface OtpSelection {
  value: string
  start: number
  end: number
}

/** A caret is truthful only for a reported collapsed selection of this value. */
export function otpCaret(value: string, length: number, selection: OtpSelection | null) {
  if (!selection || selection.value !== value || selection.start !== selection.end || length <= 0)
    return null
  if (!Number.isInteger(selection.start) || selection.start < 0 || selection.start > value.length)
    return null
  // Do not draw a caret inside a surrogate pair even if a malformed host
  // event reports it. A cell never splits a character in either backend.
  const before = value.slice(0, selection.start)
  if (/[\uD800-\uDBFF]$/.test(before)) return null
  const position = Array.from(before).length
  return { index: Math.min(position, length - 1), after: position >= length }
}
