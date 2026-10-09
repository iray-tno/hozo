/**
 * Which picked files a `FileDropzone` keeps, and why it refused the rest.
 *
 * One function for both platforms: a browser hands over `File`s from a drop
 * or the file input, and React Native's picker hands over records with a
 * `uri`. Both are reduced to a name, a size and a type before anything is
 * decided, so the rules are the same wherever the file came from.
 *
 * `accept` is the `<input accept>` vocabulary: a MIME type (`image/png`), a
 * family (`image/*`) or an extension (`.pdf`). A file with no type -- some
 * platforms give none for an unfamiliar extension -- is judged by its name.
 */

export interface HozoPickedFile {
  name: string
  /** Bytes. */
  size: number
  /** The MIME type, or `''` when the platform gave none. */
  type: string
  /** React Native: where the picker put the file. */
  uri?: string
  /** The Web: the `File` itself, for uploading. */
  file?: File
}

export type HozoFileRejectionReason = 'type' | 'too-large' | 'too-small' | 'too-many'

export interface HozoFileRejection {
  file: HozoPickedFile
  reason: HozoFileRejectionReason
}

export interface FileRules {
  accept?: readonly string[]
  maxSize?: number
  minSize?: number
  /** One file unless true. */
  multiple?: boolean
  /** With `multiple`, at most this many in one pick. */
  maxFiles?: number
}

export function isAccepted(
  file: Pick<HozoPickedFile, 'name' | 'type'>,
  accept: readonly string[] | undefined,
): boolean {
  if (!accept || accept.length === 0) return true
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  return accept.some((raw) => {
    const rule = raw.trim().toLowerCase()
    if (rule.startsWith('.')) return name.endsWith(rule)
    if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1))
    return type === rule
  })
}

/** Splits a pick into the files kept and the reasons for the others, in order. */
export function sortFiles(
  files: readonly HozoPickedFile[],
  rules: FileRules,
): { accepted: HozoPickedFile[]; rejected: HozoFileRejection[] } {
  const accepted: HozoPickedFile[] = []
  const rejected: HozoFileRejection[] = []
  const limit = rules.multiple ? (rules.maxFiles ?? Number.POSITIVE_INFINITY) : 1
  for (const file of files) {
    if (!isAccepted(file, rules.accept)) rejected.push({ file, reason: 'type' })
    else if (rules.maxSize !== undefined && file.size > rules.maxSize)
      rejected.push({ file, reason: 'too-large' })
    else if (rules.minSize !== undefined && file.size < rules.minSize)
      rejected.push({ file, reason: 'too-small' })
    else if (accepted.length >= limit) rejected.push({ file, reason: 'too-many' })
    else accepted.push(file)
  }
  return { accepted, rejected }
}

/**
 * "2.4 MB", in the reader's locale: decimal units, as file managers on both
 * platforms count, one decimal place above a kilobyte.
 */
export function formatFileSize(bytes: number, locale?: string): string {
  const units = [
    ['byte', 1],
    ['kilobyte', 1e3],
    ['megabyte', 1e6],
    ['gigabyte', 1e9],
  ] as const
  let chosen: (typeof units)[number] = units[0]
  for (const unit of units) if (bytes >= unit[1]) chosen = unit
  const value = bytes / chosen[1]
  try {
    return new Intl.NumberFormat(locale, {
      style: 'unit',
      unit: chosen[0],
      unitDisplay: 'short',
      maximumFractionDigits: chosen[0] === 'byte' ? 0 : 1,
    }).format(value)
  } catch {
    // An engine without unit formatting -- older Hermes -- still says how much.
    const symbol = { byte: 'B', kilobyte: 'KB', megabyte: 'MB', gigabyte: 'GB' }[chosen[0]]
    return `${chosen[0] === 'byte' ? value : value.toFixed(1)} ${symbol}`
  }
}
