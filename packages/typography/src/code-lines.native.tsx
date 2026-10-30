// biome-ignore-all lint/suspicious/noArrayIndexKey: code lines and tokens use source-position identity
import { useHozoMessage } from '@hozo/behaviors'
import { HozoTextSizeContext, hozoSplitTextStyle } from '@hozo/engine'
import { useHozoDark } from '@hozo/engine/generated/environment'
import { hozoClasses } from '@hozo/engine/project'
import { type ReactNode, useContext } from 'react'
import {
  type StyleProp,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native'
import {
  type CodeLine,
  type CodeMark,
  type DrawnCodeToken,
  drawnCodeTokens,
  type normalizeCodeLines,
} from './code/model.ts'
import { codeKey, useCodeRows, useNormalizedCodeLines } from './code/reuse.ts'

export { useNormalizedCodeLines }

type CodeStyle = StyleProp<ViewStyle | TextStyle>
export interface CodeLinesProps {
  lines: readonly CodeLine[] | string
  tabSize?: number
  theme?: string
  wrap?: boolean
  className?: string
  lineClassName?: string
  insClassName?: string
  delClassName?: string
  markClassName?: string
  style?: CodeStyle
  lineStyle?: CodeStyle
  insStyle?: CodeStyle
  delStyle?: CodeStyle
  markStyle?: CodeStyle
  /** @internal A separate gutter supplied by CodeBlock. */
  renderGutter?: (line: CodeLine, index: number) => ReactNode
  /**
   * @internal Everything `renderGutter` draws from besides the line and its
   * index, as `codeRowKey` gives it. Without it, a gutter's rows are not reused.
   */
  gutterKey?: string
}

const MARK_FACTS = [undefined, 'ins', 'del', 'mark'].map((mark) => ({
  'data-code-mark': Boolean(mark),
  'data-code-mark=ins': mark === 'ins',
  'data-code-mark=del': mark === 'del',
  'data-code-mark=mark': mark === 'mark',
}))

/**
 * @internal One string for everything a row is drawn from besides its line
 * and index, with styles flattened and classes resolved under each mark, so
 * an equal key means an equal row. `undefined` when a value cannot be written
 * out (an animated style, say): then nothing is reused.
 */
export function codeRowKey(
  values: readonly unknown[],
  classNames: readonly (string | undefined)[] = [],
): string | undefined {
  return codeKey([
    values,
    classNames.map((name) => MARK_FACTS.map((facts) => hozoClasses(name, facts))),
  ])
}

const split = (style: CodeStyle) =>
  hozoSplitTextStyle(StyleSheet.flatten(style) ?? {}) as [ViewStyle, TextStyle]

// Only what the run sets, so that on the line itself an unset colour still
// leaves the line's own.
function runStyle(run: DrawnCodeToken | undefined): TextStyle {
  return {
    ...(run?.color ? { color: run.color } : {}),
    ...(run?.italic ? { fontStyle: 'italic' } : {}),
    ...(run?.bold ? { fontWeight: '700' } : {}),
    ...(run?.underline ? { textDecorationLine: 'underline' } : {}),
  }
}

/** A line after `normalizeCodeLines`: its tokens are always a list. */
export type NormalizedCodeLine = ReturnType<typeof normalizeCodeLines>[number]

export interface CodeLineRows {
  lines: readonly NormalizedCodeLine[]
  style: StyleProp<ViewStyle>
  renderLine: (line: NormalizedCodeLine, index: number) => ReactNode
}

/**
 * @internal What `CodeLines` draws, one line at a time: the normalized lines,
 * the box around them, and the row for any one line.
 *
 * Separate from `CodeLines` so that `CodeBlock` can hand the rows to a
 * `FlatList` and mount only the lines near the visible ones (#1289), with
 * each row the same element the full list draws.
 */
export function useCodeLineRows(props: CodeLinesProps): CodeLineRows {
  const message = useHozoMessage()
  const dark = useHozoDark()
  const inheritedSize = useContext(HozoTextSizeContext)
  const theme = props.theme ?? (dark ? 'dark' : 'light')
  const lines = useNormalizedCodeLines(props.lines, props.tabSize)
  const [box, text] = split([hozoClasses(props.className), props.style])
  const labels: Record<CodeMark, string> = {
    ins: message('hozo.code.added'),
    del: message('hozo.code.removed'),
    mark: message('hozo.code.highlighted'),
  }
  const fontSize = typeof text.fontSize === 'number' ? text.fontSize : inheritedSize
  const lineHeight = text.lineHeight ?? fontSize * 1.5
  const key =
    props.renderGutter && props.gutterKey === undefined
      ? undefined
      : codeRowKey(
          [
            theme,
            fontSize,
            lineHeight,
            props.wrap,
            text,
            labels,
            props.gutterKey,
            ...[props.lineStyle, props.insStyle, props.delStyle, props.markStyle].map((style) =>
              StyleSheet.flatten(style),
            ),
          ],
          [props.lineClassName, props.insClassName, props.delClassName, props.markClassName],
        )
  const renderLine = useCodeRows(lines, key, drawLine)
  function drawLine(line: NormalizedCodeLine, index: number) {
    const facts = {
      'data-code-mark': Boolean(line.mark),
      'data-code-mark=ins': line.mark === 'ins',
      'data-code-mark=del': line.mark === 'del',
      'data-code-mark=mark': line.mark === 'mark',
    }
    const [lineBox, lineText] = split([
      hozoClasses(props.lineClassName, facts),
      line.mark ? hozoClasses(props[`${line.mark}ClassName`], facts) : undefined,
      props.lineStyle,
      line.mark ? props[`${line.mark}Style`] : undefined,
    ])
    const tokens = line.tokens
    const content = tokens.map((token) => token.text).join('')
    const runs = drawnCodeTokens(tokens, theme)
    return (
      <View key={index} style={[{ flexDirection: 'row', minHeight: lineHeight }, lineBox]}>
        {props.renderGutter?.(line, index)}
        <Text
          accessible
          accessibilityLabel={line.mark ? `${labels[line.mark]}: ${content}` : content}
          style={[
            { fontFamily: 'monospace', fontSize, lineHeight },
            text,
            lineText,
            // A line drawn in one style needs no nested Text: the run's style
            // goes on the line itself, which is the same drawing (#1431).
            runs.length === 1 ? runStyle(runs[0]) : undefined,
            { flexGrow: 1, flexShrink: props.wrap ? 1 : 0, minWidth: 0 },
          ]}
        >
          {runs.length === 1
            ? runs[0]?.text
            : runs.map((run, at) => (
                <Text key={at} style={runStyle(run)}>
                  {run.text}
                </Text>
              ))}
        </Text>
      </View>
    )
  }
  return {
    lines,
    style: [box, props.wrap ? { alignSelf: 'stretch', minWidth: 0 } : undefined],
    renderLine,
  }
}

export function CodeLines(props: CodeLinesProps) {
  const { lines, style, renderLine } = useCodeLineRows(props)
  return <View style={style}>{lines.map(renderLine)}</View>
}
