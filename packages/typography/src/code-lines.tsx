// biome-ignore-all lint/suspicious/noArrayIndexKey: code lines and tokens use source-position identity
import { useHozoMessage } from '@hozo/behaviors'
import type { CSSProperties, ReactNode } from 'react'
import { type CodeLine, type CodeMark, type CodeToken, normalizeCodeLines } from './code/model.ts'

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
  style?: CSSProperties
  lineStyle?: CSSProperties
  insStyle?: CSSProperties
  delStyle?: CSSProperties
  markStyle?: CSSProperties
  /** @internal A separate, non-selectable gutter supplied by CodeBlock. */
  renderGutter?: (line: CodeLine, index: number) => ReactNode
}

const hidden: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  userSelect: 'none',
}
const tokenCss =
  '.hozo-code-token{color:var(--hozo-code-light,inherit)}@media(prefers-color-scheme:dark){.hozo-code-token{color:var(--hozo-code-dark,var(--hozo-code-light,inherit))}}'

function tokenStyle(token: CodeToken, theme?: string): CSSProperties {
  const colors = typeof token.color === 'object' ? token.color : undefined
  return {
    color:
      typeof token.color === 'string'
        ? token.color
        : theme
          ? (colors?.[theme] ?? colors?.light)
          : undefined,
    ...(colors && !theme
      ? { '--hozo-code-light': colors.light, '--hozo-code-dark': colors.dark }
      : {}),
    fontStyle: token.italic ? 'italic' : undefined,
    fontWeight: token.bold ? 'bold' : undefined,
    textDecoration: token.underline ? 'underline' : undefined,
  } as CSSProperties
}

export function CodeLines(props: CodeLinesProps) {
  const message = useHozoMessage()
  const lines = normalizeCodeLines(props.lines, props.tabSize)
  const labels: Record<CodeMark, string> = {
    ins: message('hozo.code.added'),
    del: message('hozo.code.removed'),
    mark: message('hozo.code.highlighted'),
  }
  return (
    <>
      <style href="hozo-code-tokens" precedence="hozo-base">
        {tokenCss}
      </style>
      <pre
        className={props.className}
        dir="ltr"
        style={{
          margin: 0,
          fontFamily: 'monospace',
          lineHeight: 1.5,
          ...props.style,
          whiteSpace: props.wrap ? 'pre-wrap' : 'pre',
          overflowWrap: props.wrap ? 'anywhere' : undefined,
        }}
      >
        <code style={{ font: 'inherit' }}>
          {lines.map((line, index) => {
            const Tag = line.mark ?? 'span'
            const className =
              [props.lineClassName, line.mark ? props[`${line.mark}ClassName`] : undefined]
                .filter(Boolean)
                .join(' ') || undefined
            return (
              <span key={index} style={{ display: 'flex', minWidth: '100%' }}>
                {props.renderGutter?.(line, index)}
                <Tag
                  className={className}
                  data-code-mark={line.mark}
                  style={{
                    display: 'block',
                    flex: props.wrap ? '1 1 0' : '1 0 auto',
                    minWidth: 0,
                    minHeight: '1lh',
                    ...props.lineStyle,
                    ...(line.mark ? props[`${line.mark}Style`] : undefined),
                  }}
                >
                  {line.mark ? <span style={hidden}>{`${labels[line.mark]}: `}</span> : null}
                  {line.tokens.map((token, at) => (
                    <span
                      key={at}
                      className={
                        typeof token.color === 'object' && !props.theme
                          ? 'hozo-code-token'
                          : undefined
                      }
                      style={tokenStyle(token, props.theme)}
                    >
                      {token.text}
                    </span>
                  ))}
                </Tag>
              </span>
            )
          })}
        </code>
      </pre>
    </>
  )
}
