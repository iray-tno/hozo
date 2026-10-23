import { useHozoMessage } from '@hozo/behaviors'
import { hozoScrollable } from '@hozo/engine'
import { CodeLines } from '@hozo/typography/code/lines'
import { codeText, normalizeCodeLines } from '@hozo/typography/code/model'
import { type CSSProperties, useId } from 'react'
import { type CodeBlockOptions, codeBlockLabels, codeLineStart } from './code-block-types.ts'
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
  const { title, name, captionNamesFigure } = codeBlockLabels(props, message('hozo.code.label'))
  const lines = normalizeCodeLines(props.lines, props.tabSize)
  const start = codeLineStart(props.lineNumbers)
  const hasMarks = lines.some((line) => line.mark)
  const gutter = Boolean(props.lineNumbers || hasMarks)
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
        role={props.wrap ? undefined : 'region'}
        aria-label={props.wrap ? undefined : message('hozo.code.contents', { title: name })}
        style={{ overflowX: props.wrap ? undefined : 'auto', minWidth: 0 }}
        {...(props.wrap ? {} : hozoScrollable())}
      >
        <CodeLines
          {...props}
          lines={lines}
          className={undefined}
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
