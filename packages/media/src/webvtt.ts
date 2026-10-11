import type { MediaCue } from './caption-types.ts'

export class WebVTTParseError extends Error {
  constructor(
    readonly code: 'invalid-webvtt' | 'unsupported-webvtt',
    readonly line: number,
    reason: string,
  ) {
    super(`WebVTT line ${line}: ${reason}`)
    this.name = 'WebVTTParseError'
  }
}

const entities: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': '\u00a0',
  '&lrm;': '\u200e',
  '&rlm;': '\u200f',
}

function timestamp(value: string, line: number): number {
  const match = /^(?:(\d{2,}):)?([0-5]\d):([0-5]\d)\.(\d{3})$/.exec(value)
  if (!match)
    throw new WebVTTParseError('invalid-webvtt', line, `invalid timestamp ${JSON.stringify(value)}`)
  const milliseconds =
    Number(match[1] ?? 0) * 3_600_000 +
    Number(match[2]) * 60_000 +
    Number(match[3]) * 1_000 +
    Number(match[4])
  if (!Number.isSafeInteger(milliseconds))
    throw new WebVTTParseError('invalid-webvtt', line, 'timestamp exceeds millisecond precision')
  return milliseconds / 1_000
}

function plainText(value: string, line: number): string {
  if (value.includes('-->'))
    throw new WebVTTParseError(
      'invalid-webvtt',
      line,
      'cue text cannot contain -->; check block separators',
    )
  if (value.includes('<'))
    throw new WebVTTParseError(
      'unsupported-webvtt',
      line,
      'cue markup and inline timestamps are not plain text',
    )
  // Decode once, then leave the result as text. An escaped tag must never
  // become markup merely because this converter decoded &lt;.
  return value.replace(/&(?:amp|lt|gt|nbsp|lrm|rlm);|&/g, (reference) => {
    const decoded = entities[reference]
    if (decoded === undefined)
      throw new WebVTTParseError(
        'unsupported-webvtt',
        line,
        'unsupported or unterminated character reference',
      )
    return decoded
  })
}

/** Convert the explicitly bounded plain-text WebVTT subset; no I/O or DOM. */
export function parsePlainTextWebVTT(input: string): readonly MediaCue[] {
  if (typeof input !== 'string')
    throw new WebVTTParseError('invalid-webvtt', 1, 'expected decoded WebVTT text')
  const lines = input
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
  const nullLine = lines.findIndex((line) => line.includes('\0'))
  if (nullLine !== -1)
    throw new WebVTTParseError(
      'invalid-webvtt',
      nullLine + 1,
      'NUL is not supported in WebVTT text',
    )
  if (!/^WEBVTT(?:[ \t].*)?$/.test(lines[0] ?? '') || lines[0]!.includes('-->'))
    throw new WebVTTParseError('invalid-webvtt', 1, 'expected a WEBVTT signature')
  if (lines[1] !== '')
    throw new WebVTTParseError(
      lines[1]?.includes('X-TIMESTAMP-MAP') ? 'unsupported-webvtt' : 'invalid-webvtt',
      2,
      'expected a blank line after WEBVTT; header metadata and timestamp maps are not supported',
    )
  const cues: MediaCue[] = []
  const identifiers = new Set<string>()
  let previousStart = 0
  let index = 2
  while (index < lines.length) {
    if (lines[index] === '') {
      index++
      continue
    }
    const first = index
    while (index < lines.length && lines[index] !== '') index++
    const block = lines.slice(first, index)
    if (/^NOTE(?:[ \t]|$)/.test(block[0]!)) {
      const arrow = block.findIndex((line) => line.includes('-->'))
      if (arrow !== -1)
        throw new WebVTTParseError('invalid-webvtt', first + arrow + 1, 'NOTE cannot contain -->')
      continue
    }
    if (/^(?:STYLE|REGION)[ \t]*$/.test(block[0]!))
      throw new WebVTTParseError(
        'unsupported-webvtt',
        first + 1,
        'STYLE and REGION blocks require a richer renderer',
      )
    let offset = 0
    if (!block[0]!.includes('-->')) {
      const identifier = block[0]!
      if (identifiers.has(identifier))
        throw new WebVTTParseError('invalid-webvtt', first + 1, 'duplicate cue identifier')
      identifiers.add(identifier)
      offset = 1
    }
    const line = first + offset + 1
    const timing = /^(\S+)[ \t]+-->[ \t]+(\S+)(.*)$/.exec(block[offset] ?? '')
    if (!timing)
      throw new WebVTTParseError('invalid-webvtt', line, 'expected start --> end cue timings')
    const start = timestamp(timing[1]!, line)
    const end = timestamp(timing[2]!, line)
    if (end <= start)
      throw new WebVTTParseError('invalid-webvtt', line, 'cue end must be after start')
    if (start < previousStart)
      throw new WebVTTParseError(
        'invalid-webvtt',
        line,
        'cue starts must be in nondecreasing order',
      )
    if (timing[3]!.trim())
      throw new WebVTTParseError(
        'unsupported-webvtt',
        line,
        'cue settings require a richer renderer',
      )
    const text = block
      .slice(offset + 1)
      .map((text, position) => plainText(text, line + position + 1))
      .join('\n')
    if (!text.trim())
      throw new WebVTTParseError('invalid-webvtt', line + 1, 'expected nonempty cue text')
    previousStart = start
    cues.push({ start, end, text })
  }
  // No partially parsed cues escape when a later block is unsupported/invalid.
  return cues
}
