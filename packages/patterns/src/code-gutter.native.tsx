import { hozoClasses } from '@hozo/engine/project'
import type { NormalizedCodeLine } from '@hozo/typography/code/lines/native'
import type { CodeMark } from '@hozo/typography/code/model'
import type { ReactNode } from 'react'
import { type StyleProp, Text, type TextStyle, View, type ViewStyle } from 'react-native'
import { splitTextStyle } from './text-style.native.ts'

type CodeStyle = StyleProp<ViewStyle | TextStyle>
type Mark = CodeMark | undefined

export interface CodeGutterProps {
  lineNumbers?: unknown
  lineClassName?: string
  gutterClassName?: string
  insClassName?: string
  delClassName?: string
  markClassName?: string
  lineStyle?: CodeStyle
  gutterStyle?: CodeStyle
  insStyle?: CodeStyle
  delStyle?: CodeStyle
  markStyle?: CodeStyle
}

const MARKS: readonly Mark[] = [undefined, 'ins', 'del', 'mark']
const facts = (mark: Mark) => ({
  'data-code-mark': Boolean(mark),
  'data-code-mark=ins': mark === 'ins',
  'data-code-mark=del': mark === 'del',
  'data-code-mark=mark': mark === 'mark',
})

/** What a gutter cell shows for one line: its mark glyph, then its number. */
export function gutterText(mark: Mark, number: number | undefined, hasMarks: boolean): string {
  const glyph = mark === 'ins' ? '+' : mark === 'del' ? '−' : mark === 'mark' ? '•' : ' '
  return `${hasMarks ? `${glyph} ` : ''}${number ?? ''}`
}

/** A gutter cell's box and text under a mark, as each row resolves them. */
export function gutterStyles(props: CodeGutterProps, mark: Mark): [ViewStyle, TextStyle] {
  return splitTextStyle([
    hozoClasses(props.gutterClassName, facts(mark)),
    mark ? hozoClasses(props[`${mark}ClassName`], facts(mark)) : undefined,
    props.gutterStyle,
  ])
}

// A row as `useCodeLineRows` resolves it, for the column to be measured against.
const lineStyles = (props: CodeGutterProps, mark: Mark) =>
  splitTextStyle([
    hozoClasses(props.lineClassName, facts(mark)),
    mark ? hozoClasses(props[`${mark}ClassName`], facts(mark)) : undefined,
    props.lineStyle,
    mark ? props[`${mark}Style`] : undefined,
  ])

// Anything that would make a row taller than its text, or a cell other than
// one line of the column. Left and right are refused on a row because the
// column is placed from the start edge, which they do not say.
const TALLER = [
  'padding',
  'paddingVertical',
  'paddingTop',
  'paddingBottom',
  'margin',
  'marginVertical',
  'marginTop',
  'marginBottom',
  'borderWidth',
  'borderTopWidth',
  'borderBottomWidth',
  'height',
  'maxHeight',
  'top',
  'bottom',
  'position',
  'transform',
] as const
const SIDEWAYS = [
  'paddingLeft',
  'paddingRight',
  'marginLeft',
  'marginRight',
  'borderLeftWidth',
  'borderRightWidth',
  'left',
  'right',
  'start',
  'end',
] as const
const CELL_MARGINS = ['marginHorizontal', 'marginStart', 'marginEnd'] as const

const sameApartFromBackground = (a: ViewStyle, b: ViewStyle) => {
  const rest = (style: ViewStyle): Record<string, unknown> => {
    const { backgroundColor: _, ...others } = style
    return others
  }
  const [restA, restB] = [rest(a), rest(b)]
  const keys = new Set([...Object.keys(restA), ...Object.keys(restB)])
  return [...keys].every((key) => JSON.stringify(restA[key]) === JSON.stringify(restB[key]))
}

export interface GutterColumn {
  /** Each row's stand-in for its cell, holding the column's width open. */
  spacer: ReactNode
  /** The whole gutter, to draw over the rows. */
  column: ReactNode
}

/**
 * The gutter as one column beside the lines, instead of a cell in each row
 * (#1432), when that draws the same thing; otherwise `undefined`, and each
 * row keeps its cell.
 *
 * A cell is a View and a Text with its styles resolved, for every line; on
 * the Android emulator that was about a quarter of a 1000-line block's mount.
 * The column is one Text with every cell's text on its own line, and a
 * nested Text for each run of marked lines whose text is styled differently.
 *
 * That is the same drawing only if every row is one line of the column high.
 * So it needs unwrapped lines, rows and cells with nothing that adds height
 * (vertical padding, borders, margins), and one line height for the lines and
 * the gutter under every mark. A mark's cell may differ from an unmarked one
 * only by its background, drawn behind its run. Rows still draw their own
 * backgrounds, so each row keeps a spacer where its cell was.
 */
export function gutterColumn(
  props: CodeGutterProps,
  lines: readonly NormalizedCodeLine[],
  options: {
    start: number
    hasMarks: boolean
    width: number
    fontSize: number
    lineHeight: number
  },
): GutterColumn | undefined {
  const used = MARKS.filter(
    (mark) => mark === undefined || lines.some((line) => line.mark === mark),
  )
  const rows = new Map(used.map((mark) => [mark, lineStyles(props, mark)]))
  const cells = new Map(used.map((mark) => [mark, gutterStyles(props, mark)]))
  // A row is at least `lineHeight` high unless its own minimum says otherwise.
  const height = (mark: Mark) => {
    const [box, text] = rows.get(mark) ?? [{}, {}]
    return Math.max(
      text.lineHeight ?? options.lineHeight,
      Number(box.minHeight ?? options.lineHeight),
    )
  }
  const inset = (box: ViewStyle) => {
    const values = [
      box.paddingStart ?? box.paddingHorizontal ?? 0,
      box.marginStart ?? box.marginHorizontal ?? 0,
      box.borderStartWidth ?? 0,
    ]
    return values.every((value) => typeof value === 'number')
      ? (values as number[]).reduce((sum, value) => sum + value, 0)
      : undefined
  }
  const pitch = height(undefined)
  const [plainRow] = rows.get(undefined) ?? [{}]
  const [plainCell, plainText] = cells.get(undefined) ?? [{}, {}]
  const start = inset(plainRow)
  const cellWidth = plainCell.width ?? options.width
  if (start === undefined || typeof cellWidth !== 'number') return undefined
  for (const mark of used) {
    const [row, text] = rows.get(mark) ?? [{}, {}]
    const [cell, cellText] = cells.get(mark) ?? [{}, {}]
    if (
      height(mark) !== pitch ||
      (text.lineHeight ?? options.lineHeight) !== pitch ||
      (cellText.lineHeight ?? options.lineHeight) !== pitch ||
      inset(row) !== start ||
      [...TALLER, ...SIDEWAYS].some((key) => key in row) ||
      [...TALLER, ...CELL_MARGINS].some((key) => key in cell) ||
      !sameApartFromBackground(cell, plainCell) ||
      (plainCell.backgroundColor !== undefined &&
        cell.backgroundColor !== plainCell.backgroundColor)
    )
      return undefined
  }

  // Runs of neighbouring lines under one mark: one nested Text and at most
  // one background each.
  const runs: { mark: Mark; from: number; texts: string[] }[] = []
  lines.forEach((line, index) => {
    const text = gutterText(
      line.mark,
      props.lineNumbers ? options.start + index : undefined,
      options.hasMarks,
    )
    const last = runs.at(-1)
    if (last && last.mark === line.mark) last.texts.push(text)
    else runs.push({ mark: line.mark, from: index, texts: [text] })
  })
  return {
    spacer: <View style={{ width: cellWidth, flexShrink: 0 }} />,
    column: (
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        pointerEvents="none"
        style={[
          plainCell,
          { position: 'absolute', top: 0, bottom: 0, start, width: cellWidth, minHeight: 0 },
        ]}
      >
        {runs.map((run) => {
          const background = run.mark ? cells.get(run.mark)?.[0].backgroundColor : undefined
          return background === undefined || background === plainCell.backgroundColor ? null : (
            <View
              key={run.from}
              style={{
                position: 'absolute',
                start: 0,
                end: 0,
                top: run.from * pitch,
                height: run.texts.length * pitch,
                backgroundColor: background,
              }}
            />
          )
        })}
        <Text
          style={[
            { fontFamily: 'monospace', fontSize: options.fontSize, textAlign: 'right' },
            plainText,
            { lineHeight: pitch },
          ]}
        >
          {runs.map((run, at) => {
            const text = `${run.texts.join('\n')}${at < runs.length - 1 ? '\n' : ''}`
            return run.mark ? (
              <Text key={run.from} style={cells.get(run.mark)?.[1]}>
                {text}
              </Text>
            ) : (
              text
            )
          })}
        </Text>
      </View>
    ),
  }
}
