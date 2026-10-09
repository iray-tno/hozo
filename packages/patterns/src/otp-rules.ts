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
