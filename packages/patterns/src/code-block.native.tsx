import { useHozoMessage } from '@hozo/behaviors'
import { HozoTextSizeContext } from '@hozo/engine'
import { hozoClasses } from '@hozo/engine/project'
import {
  codeRowKey,
  useCodeLineRows,
  useNormalizedCodeLines,
} from '@hozo/typography/code/lines/native'
import { codeText, widestCodeLine } from '@hozo/typography/code/model'
import { useContext } from 'react'
import {
  FlatList,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native'
import {
  type CodeBlockOptions,
  codeBlockLabels,
  codeBlockWindowed,
  codeLineStart,
} from './code-block-types.ts'
import { CodeCopy } from './code-copy.native.tsx'
import { splitTextStyle } from './text-style.native.ts'

type CodeStyle = StyleProp<ViewStyle | TextStyle>
export interface CodeBlockProps extends CodeBlockOptions {
  className?: string
  lineClassName?: string
  gutterClassName?: string
  insClassName?: string
  delClassName?: string
  markClassName?: string
  copyClassName?: string
  captionClassName?: string
  style?: CodeStyle
  lineStyle?: CodeStyle
  gutterStyle?: CodeStyle
  insStyle?: CodeStyle
  delStyle?: CodeStyle
  markStyle?: CodeStyle
  copyStyle?: StyleProp<ViewStyle>
  captionStyle?: StyleProp<TextStyle>
}

export function CodeBlock(props: CodeBlockProps) {
  const message = useHozoMessage()
  const inheritedSize = useContext(HozoTextSizeContext)
  const { title, name } = codeBlockLabels(props, message('hozo.code.label'))
  const lines = useNormalizedCodeLines(props.lines, props.tabSize)
  const start = codeLineStart(props.lineNumbers)
  const hasMarks = lines.some((line) => line.mark)
  const gutter = Boolean(props.lineNumbers || hasMarks)
  const [box, text] = splitTextStyle([hozoClasses(props.className), props.style])
  const fontSize = text.fontSize ?? inheritedSize
  const lineHeight = text.lineHeight ?? fontSize * 1.5
  const width =
    ((props.lineNumbers ? String(start + lines.length - 1).length : 0) + (hasMarks ? 2 : 0) + 1) *
    fontSize
  const rows = useCodeLineRows({
    ...props,
    lines,
    className: undefined,
    style: [{ fontFamily: 'monospace', fontSize, lineHeight }, text],
    gutterKey: codeRowKey(
      [
        start,
        width,
        hasMarks,
        props.lineNumbers,
        fontSize,
        lineHeight,
        StyleSheet.flatten(props.gutterStyle),
      ],
      [props.gutterClassName, props.insClassName, props.delClassName, props.markClassName],
    ),
    renderGutter: gutter
      ? (line, index) => {
          const facts = {
            'data-code-mark': Boolean(line.mark),
            'data-code-mark=ins': line.mark === 'ins',
            'data-code-mark=del': line.mark === 'del',
            'data-code-mark=mark': line.mark === 'mark',
          }
          const [gutterBox, gutterText] = splitTextStyle([
            hozoClasses(props.gutterClassName, facts),
            line.mark ? hozoClasses(props[`${line.mark}ClassName`], facts) : undefined,
            props.gutterStyle,
          ])
          return (
            <View
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
              style={[{ width, flexShrink: 0 }, gutterBox]}
            >
              <Text
                style={[
                  { fontFamily: 'monospace', fontSize, lineHeight, textAlign: 'right' },
                  gutterText,
                ]}
              >
                {hasMarks
                  ? `${line.mark === 'ins' ? '+' : line.mark === 'del' ? '−' : line.mark === 'mark' ? '•' : ' '} `
                  : ''}
                {props.lineNumbers ? start + index : ''}
              </Text>
            </View>
          )
        }
      : undefined,
  })
  const windowed = codeBlockWindowed(props, rows.lines.length)
  const whole = <View style={rows.style}>{rows.lines.map(rows.renderLine)}</View>
  const content = windowed ? (
    <FlatList
      data={rows.lines}
      keyExtractor={(_, index) => String(index)}
      renderItem={({ item, index }) => rows.renderLine(item, index)}
      style={{ maxHeight: props.maxHeight }}
      contentContainerStyle={rows.style}
      // React Native's default window of 21 viewports. A window of 5 was
      // measured against it on the Android emulator and scrolled worse
      // (frame p50 85-98ms against 54-67ms) without mounting faster (#1382).
      nestedScrollEnabled
    />
  ) : props.maxHeight === undefined ? (
    whole
  ) : (
    <ScrollView style={{ maxHeight: props.maxHeight }} nestedScrollEnabled>
      {whole}
    </ScrollView>
  )
  // A windowed list cannot be as wide as a line it has not mounted, so the
  // widest line is drawn once more, at no height and out of the reading
  // order, to hold the scrolling width open for the ones that come later.
  const widest = !windowed || props.wrap ? undefined : widestCodeLine(rows.lines)
  return (
    <View role="figure" accessibilityLabel={name} style={box}>
      <Text
        style={[text, StyleSheet.flatten(hozoClasses(props.captionClassName)), props.captionStyle]}
      >
        {title}
      </Text>
      {props.wrap ? (
        content
      ) : (
        <ScrollView horizontal>
          {widest ? (
            <View>
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{ height: 0, overflow: 'hidden' }}
              >
                {rows.renderLine(widest.line, widest.index)}
              </View>
              {content}
            </View>
          ) : (
            content
          )}
        </ScrollView>
      )}
      {props.copy ? (
        <CodeCopy
          text={typeof props.copy === 'object' ? props.copy.text : codeText(props.lines)}
          className={props.copyClassName}
          style={props.copyStyle}
        />
      ) : null}
    </View>
  )
}
