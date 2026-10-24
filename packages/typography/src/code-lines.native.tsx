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
import { type CodeLine, type CodeMark, normalizeCodeLines } from './code/model.ts'

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
}

const split = (style: CodeStyle) =>
  hozoSplitTextStyle(StyleSheet.flatten(style) ?? {}) as [ViewStyle, TextStyle]

export function CodeLines(props: CodeLinesProps) {
  const message = useHozoMessage()
  const dark = useHozoDark()
  const inheritedSize = useContext(HozoTextSizeContext)
  const theme = props.theme ?? (dark ? 'dark' : 'light')
  const lines = normalizeCodeLines(props.lines, props.tabSize)
  const [box, text] = split([hozoClasses(props.className), props.style])
  const labels: Record<CodeMark, string> = {
    ins: message('hozo.code.added'),
    del: message('hozo.code.removed'),
    mark: message('hozo.code.highlighted'),
  }
  const fontSize = typeof text.fontSize === 'number' ? text.fontSize : inheritedSize
  const lineHeight = text.lineHeight ?? fontSize * 1.5
  return (
    <View style={[box, props.wrap ? { alignSelf: 'stretch', minWidth: 0 } : undefined]}>
      {lines.map((line, index) => {
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
                { flexGrow: 1, flexShrink: props.wrap ? 1 : 0, minWidth: 0 },
              ]}
            >
              {tokens.map((token, at) => (
                <Text
                  key={at}
                  style={{
                    color:
                      typeof token.color === 'string'
                        ? token.color
                        : (token.color?.[theme] ?? token.color?.light),
                    fontStyle: token.italic ? 'italic' : undefined,
                    fontWeight: token.bold ? '700' : undefined,
                    textDecorationLine: token.underline ? 'underline' : undefined,
                  }}
                >
                  {token.text}
                </Text>
              ))}
            </Text>
          </View>
        )
      })}
    </View>
  )
}
