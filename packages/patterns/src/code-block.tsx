import { useHozoMessage } from '@hozo/behaviors'
import { hozoScrollable } from '@hozo/engine'
import { CodeLines } from '@hozo/typography/code/lines'
import { codeText, normalizeCodeLines } from '@hozo/typography/code/model'
import { type CSSProperties, useId, useRef } from 'react'
import {
  type CodeBlockOptions,
  codeBlockLabels,
  codeBlockWindowed,
  codeLineStart,
} from './code-block-types.ts'
import { CodeCopy } from './code-copy.tsx'

export interface CodeBlockProps extends CodeBlockOptions {
  className?: string
  lineClassName?: string
  gutterClassName?: string
  insClassName?: string
  delClassName?: string
  markClassName?: string
  copyClassName?: string
  captionClassName?: string
  style?: CSSProperties
  lineStyle?: CSSProperties
  gutterStyle?: CSSProperties
  insStyle?: CSSProperties
  delStyle?: CSSProperties
  markStyle?: CSSProperties
  copyStyle?: CSSProperties
  captionStyle?: CSSProperties
}

export function CodeBlock(props: CodeBlockProps) {
  const message = useHozoMessage()
  const id = useId()
  const scroller = useRef<HTMLDivElement>(null)
  const { title, name, captionNamesFigure } = codeBlockLabels(props, message('hozo.code.label'))
  const lines = normalizeCodeLines(props.lines, props.tabSize)
  const start = codeLineStart(props.lineNumbers)
  const hasMarks = lines.some((line) => line.mark)
  const gutter = Boolean(props.lineNumbers || hasMarks)
  // Either axis makes the lines a region a keyboard has to be able to scroll.
  const scrolls = !props.wrap || props.maxHeight !== undefined
  const scrollable = scrolls ? hozoScrollable() : undefined
  const width = `${(props.lineNumbers ? String(start + lines.length - 1).length : 0) + (hasMarks ? 2 : 0) + 1}ch`
  return (
    <figure
      className={props.className}
      style={{ margin: 0, ...props.style }}
      aria-labelledby={captionNamesFigure ? id : undefined}
      aria-label={captionNamesFigure ? undefined : name}
    >
      <figcaption id={id} className={props.captionClassName} style={props.captionStyle}>
        {title}
      </figcaption>
      <div
        // One ref for both: spread after it, the scrollable's replaced it,
        // and the windowed lines never heard the region scroll.
        ref={(element) => {
          scroller.current = element
          scrollable?.ref(element)
        }}
        role={scrolls ? 'region' : undefined}
        aria-label={scrolls ? message('hozo.code.contents', { title: name }) : undefined}
        style={{
          overflowX: props.wrap ? undefined : 'auto',
          overflowY: props.maxHeight === undefined ? undefined : 'auto',
          maxHeight: props.maxHeight,
          minWidth: 0,
        }}
      >
        <CodeLines
          {...props}
          lines={lines}
          className={undefined}
          scroller={codeBlockWindowed(props, lines.length) ? scroller : undefined}
          style={{ fontFamily: 'monospace', lineHeight: 1.5 }}
          renderGutter={
            gutter
              ? (line, index) => (
                  <span
                    aria-hidden="true"
                    data-code-mark={line.mark}
                    className={
                      [
                        props.gutterClassName,
                        line.mark ? props[`${line.mark}ClassName`] : undefined,
                      ]
                        .filter(Boolean)
                        .join(' ') || undefined
                    }
                    style={{
                      flex: `0 0 ${width}`,
                      textAlign: 'right',
                      whiteSpace: 'pre',
                      userSelect: 'none',
                      ...props.gutterStyle,
                    }}
                  >
                    {hasMarks
                      ? `${line.mark === 'ins' ? '+' : line.mark === 'del' ? '−' : line.mark === 'mark' ? '•' : ' '} `
                      : ''}
                    {props.lineNumbers ? start + index : ''}
                  </span>
                )
              : undefined
          }
        />
      </div>
      {props.copy ? (
        <CodeCopy
          text={typeof props.copy === 'object' ? props.copy.text : codeText(props.lines)}
          className={props.copyClassName}
          style={props.copyStyle}
        />
      ) : null}
    </figure>
  )
}
