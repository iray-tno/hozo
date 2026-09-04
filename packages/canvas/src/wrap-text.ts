import type { TextProps } from './scene.tsx'

/**
 * Where a run of text may be broken, and how it is filled into lines.
 *
 * One implementation, shared by both renderers and by the hit test, for a
 * reason worth stating: `Intl.Segmenter` does not exist on React Native.
 * Hermes implements `Collator`, `DateTimeFormat` and `NumberFormat` and
 * nothing else from ECMA-402's later additions -- `intl402/Segmenter/` is
 * on its test262 skip list, and there is no Segmenter in its platform
 * Intl on either Android or Apple. So "use `Intl.Segmenter` where it
 * exists" would mean a dictionary on the Web and a fallback on every
 * phone, permanently, and the same string breaking in different places
 * depending on where it was opened.
 *
 * The rules here are a practical subset of UAX #14: spaces, the
 * boundaries around CJK, and the two kinsoku classes that keep Japanese
 * punctuation off the start and end of a line. Deterministic, and the
 * same on both platforms. Line *positions* still differ, because the
 * fonts differ -- but that is a measurement, and each renderer's
 * measurement is its own.
 */

/**
 * Characters that may be broken between, rather than only after a space.
 *
 * Kana, ideographs, Hangul, and the fullwidth forms. UAX #14 calls this
 * ID, and it is what makes Japanese wrap at all: a sentence of it holds
 * no spaces, so a space-only breaker leaves it on one line forever.
 */
function isIdeographic(codePoint: number) {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x11ff) || // Hangul Jamo
    (codePoint >= 0x2e80 && codePoint <= 0x303f) || // CJK radicals, punctuation
    (codePoint >= 0x3040 && codePoint <= 0x30ff) || // Hiragana, Katakana
    (codePoint >= 0x3130 && codePoint <= 0x318f) || // Hangul compatibility
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) || // Extension A
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) || // Unified ideographs
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) || // Hangul syllables
    (codePoint >= 0xf900 && codePoint <= 0xfaff) || // Compatibility ideographs
    (codePoint >= 0xff00 && codePoint <= 0xff60) || // Fullwidth forms
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x20000 && codePoint <= 0x3ffff) // Extensions B and beyond
  )
}

/**
 * 行頭禁則: what may not begin a line.
 *
 * Closing brackets, the small kana, the sound marks, and the punctuation
 * that belongs to the word before it. A line starting with 。 is the
 * thing everyone recognises as wrong without being able to name it.
 */
const NO_START = new Set([
  ...')]}）〕］｝〉》」』】〙〗｣、。，．・：；？！‼⁇ー〜～',
  ...'ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ',
  ...'々〻゛゜‐–—…‥%‰℃°',
])

/** 行末禁則: what may not end a line. Opening brackets, and the leading marks. */
const NO_END = new Set([...'([{（〔［｛〈《「『【〘〖｢＄￥＃＠§'])

/**
 * Whether the text may be broken between two adjacent code points.
 *
 * Spaces are handled by the caller, which absorbs them into the line they
 * end rather than carrying them to the next.
 */
function breakableBetween(before: string, after: string) {
  if (NO_END.has(before) || NO_START.has(after)) return false
  const beforePoint = before.codePointAt(0) ?? 0
  const afterPoint = after.codePointAt(0) ?? 0
  return isIdeographic(beforePoint) || isIdeographic(afterPoint)
}

/**
 * The smallest pieces the text may be split into, spaces included.
 *
 * A chunk is what has to travel together: a Latin word with the spaces
 * that follow it, or a single ideograph. Nothing here hyphenates, so a
 * word longer than the width goes on a line of its own and overflows --
 * a break inside it would be a guess at a language's rules.
 */
function chunk(text: string): string[] {
  const points = [...text]
  const chunks: string[] = []
  let current = ''
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index] as string
    const next = points[index + 1]
    current += point
    if (next === undefined) break
    // A run of spaces ends a chunk, and stays with the line it ends.
    if (point === ' ' && next !== ' ') {
      chunks.push(current)
      current = ''
      continue
    }
    if (next === ' ') continue
    if (breakableBetween(point, next)) {
      chunks.push(current)
      current = ''
    }
  }
  if (current !== '') chunks.push(current)
  return chunks
}

/**
 * Greedily fills lines no wider than `maxWidth`, measured by `widthOf`.
 *
 * Greedy rather than balanced (Knuth-Plass and the like): a chart label
 * is two or three lines, where the two agree, and greedy is the rule
 * every browser and both renderers already follow for everything else on
 * the screen.
 *
 * `\n` always breaks, and a line's trailing spaces are dropped -- they
 * would otherwise push a line over the width with nothing visible in the
 * space they take.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  widthOf: (run: string) => number,
): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const piece of chunk(paragraph)) {
      const candidate = line + piece
      if (line !== '' && widthOf(candidate.trimEnd()) > maxWidth) {
        lines.push(line.trimEnd())
        line = piece.trimStart()
      } else {
        line = candidate
      }
    }
    lines.push(line.trimEnd())
  }
  return lines
}

/**
 * Every line of a run, with the baseline each one sits on.
 *
 * One line when there is no `maxWidth`, so everything downstream is
 * written against lines rather than against a special case. Lives here
 * rather than in the hit test because both renderers need it too, and
 * a renderer importing from the hit test would have the arrow pointing
 * the wrong way.
 */
export function textLines(props: TextProps, widthOf: (run: string) => number) {
  const height = (props.lineHeight ?? 1.2) * props.fontSize
  const texts =
    props.maxWidth === undefined ? [props.text] : wrapText(props.text, props.maxWidth, widthOf)
  return texts.map((text, index) => ({ text, y: props.y + index * height }))
}
