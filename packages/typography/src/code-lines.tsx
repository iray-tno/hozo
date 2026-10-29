// biome-ignore-all lint/suspicious/noArrayIndexKey: code lines and tokens use source-position identity
import { useHozoMessage } from '@hozo/behaviors'
import {
  initialRange,
  ListMetrics,
  type WindowRange,
  windowRange,
} from '@hozo/primitives/windowing'
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { type CodeLine, type CodeMark, type CodeToken, widestCodeLine } from './code/model.ts'
import { codeKey, useCodeRows, useNormalizedCodeLines } from './code/reuse.ts'

export { codeKey, useNormalizedCodeLines }

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
  /**
   * @internal Everything `renderGutter` draws from besides the line and its
   * index, as `codeKey` gives it. Without it, a gutter's rows are not reused.
   */
  gutterKey?: string
  /**
   * @internal The element the lines scroll in. Given, only the lines near
   * the visible ones are mounted; CodeBlock decides when (#1380).
   */
  scroller?: RefObject<HTMLElement | null>
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
// The whole text of a windowed block, for a screen reader: its own reading
// moves through the document without scrolling the block, so it would stop
// at the last mounted line (#1408). One plain row per line costs a fraction
// of the token rows it stands in for. Line breaks are kept, not collapsed,
// and select-all and copy stay with the visible rows. Not
// `content-visibility: auto`, which would be cheaper still: Chrome then
// leaves the text out of the accessibility tree.
const readable: CSSProperties = { ...hidden, whiteSpace: 'pre' }
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

// What a line is taken to be before one has been measured, and how many go
// in the first paint: a viewport's worth at ordinary sizes, so the server's
// HTML shows the top of the block rather than a gap.
const ESTIMATED_LINE = 20
const INITIAL_LINES = 40
// Two viewports either side, as on Native (#1382), and enough new lines per
// pass that 20px lines fill a viewport in a commit or two.
const WINDOW_SIZE = 5
const LINES_PER_BATCH = 50
// The server has nothing to measure, and `useLayoutEffect` warns there.
const useBrowserLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect

/**
 * Which lines to mount, from where `scroller` is scrolled to.
 *
 * The arithmetic is the Web `FlatList`'s, but the lines stay one `<pre>` in
 * the scroller `CodeBlock` already has rather than becoming rows of a list:
 * what is mounted is still code to a screen reader, and the region still
 * scrolls sideways. Lines are measured after every commit and whenever the
 * scroller resizes, which is when a wrapped line can change height.
 */
function useLineWindow(count: number, scroller: RefObject<HTMLElement | null> | undefined) {
  const code = useRef<HTMLElement>(null)
  const metricsRef = useRef<ListMetrics>(undefined as unknown as ListMetrics)
  if (metricsRef.current === undefined) metricsRef.current = new ListMetrics(ESTIMATED_LINE)
  const metrics = metricsRef.current
  metrics.setKeys(Array.from({ length: count }, (_, index) => String(index)))
  const all: WindowRange = { first: 0, last: count - 1 }
  const [range, setRange] = useState(() => (scroller ? initialRange(count, INITIAL_LINES) : all))
  const rangeRef = useRef(range)
  rangeRef.current = range

  const update = useCallback(() => {
    const root = scroller?.current
    const list = code.current
    if (!root || !list || root.clientHeight === 0) return
    for (const line of list.querySelectorAll<HTMLElement>(':scope > [data-code-line]'))
      metrics.measure(line.dataset.codeLine ?? '', line.getBoundingClientRect().height)
    // Where line 0 starts in the scroller's content; padding above the lines
    // moves it.
    const origin =
      list.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop
    const next = windowRange({
      count,
      offset: root.scrollTop - origin,
      visibleLength: root.clientHeight,
      windowSize: WINDOW_SIZE,
      maxToRenderPerBatch: LINES_PER_BATCH,
      previous: rangeRef.current,
      metrics,
    })
    if (next.first === rangeRef.current.first && next.last === rangeRef.current.last) return
    rangeRef.current = next
    setRange(next)
  }, [count, scroller, metrics])

  // A mounted line is a measurable one, and measuring usually moves the
  // window, so this runs after every commit rather than only on scroll.
  useBrowserLayoutEffect(() => {
    update()
  })
  useEffect(() => {
    const root = scroller?.current
    if (!root) return
    root.addEventListener('scroll', update, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update)
    observer?.observe(root)
    return () => {
      root.removeEventListener('scroll', update)
      observer?.disconnect()
    }
  }, [scroller, update])

  if (!scroller) return { code, range: all, leading: 0, trailing: 0 }
  // Fewer lines than before can leave the window past the end until the
  // next update; draw what exists.
  const first = Math.max(0, Math.min(range.first, count - 1))
  const last = Math.min(range.last, count - 1)
  return {
    code,
    range: { first, last },
    leading: count ? metrics.offsetAt(first) : 0,
    trailing: count ? Math.max(0, metrics.offsetAt(count) - metrics.offsetAt(last + 1)) : 0,
  }
}

export function CodeLines(props: CodeLinesProps) {
  const message = useHozoMessage()
  const lines = useNormalizedCodeLines(props.lines, props.tabSize)
  const labels: Record<CodeMark, string> = {
    ins: message('hozo.code.added'),
    del: message('hozo.code.removed'),
    mark: message('hozo.code.highlighted'),
  }
  const shown = useLineWindow(lines.length, props.scroller)
  const renderLine = useCodeRows(
    lines,
    props.renderGutter && props.gutterKey === undefined
      ? undefined
      : codeKey([
          props.theme,
          props.wrap,
          labels,
          props.gutterKey,
          props.lineClassName,
          props.insClassName,
          props.delClassName,
          props.markClassName,
          props.lineStyle,
          props.insStyle,
          props.delStyle,
          props.markStyle,
        ]),
    drawLine,
  )
  const renderReadable = useCodeRows(lines, codeKey(labels), drawReadable)
  function drawReadable(line: (typeof lines)[number], index: number) {
    return (
      <span key={index} style={{ display: 'block' }}>
        {line.mark ? `${labels[line.mark]}: ` : null}
        {line.tokens.map((token) => token.text).join('')}
      </span>
    )
  }
  function drawLine(line: (typeof lines)[number], index: number) {
    const Tag = line.mark ?? 'span'
    const className =
      [props.lineClassName, line.mark ? props[`${line.mark}ClassName`] : undefined]
        .filter(Boolean)
        .join(' ') || undefined
    return (
      <span key={index} data-code-line={index} style={{ display: 'flex', minWidth: '100%' }}>
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
                typeof token.color === 'object' && !props.theme ? 'hozo-code-token' : undefined
              }
              style={tokenStyle(token, props.theme)}
            >
              {token.text}
            </span>
          ))}
        </Tag>
      </span>
    )
  }
  // An unwrapped block cannot be as wide as a line it has not mounted, so the
  // widest one is drawn once more, at no height and hidden from reading and
  // find-in-page, to hold the scrolling width open, as on Native.
  const widest = props.scroller && !props.wrap ? widestCodeLine(lines) : undefined
  return (
    <>
      <style href="hozo-code-tokens" precedence="hozo-base">
        {tokenCss}
      </style>
      {props.scroller ? (
        <pre dir="ltr" style={readable}>
          <code>{lines.map(renderReadable)}</code>
        </pre>
      ) : null}
      <pre
        // Windowed, the rows are only what is on screen; the text above is
        // what is read.
        aria-hidden={props.scroller ? true : undefined}
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
        <code ref={shown.code} style={{ font: 'inherit' }}>
          {widest ? (
            <span
              aria-hidden="true"
              style={{ display: 'block', width: 'max-content', height: 0, visibility: 'hidden' }}
            >
              {renderLine(widest.line, widest.index)}
            </span>
          ) : null}
          {shown.leading ? (
            <span aria-hidden="true" style={{ display: 'block', height: shown.leading }} />
          ) : null}
          {lines
            .slice(shown.range.first, shown.range.last + 1)
            .map((line, at) => renderLine(line, shown.range.first + at))}
          {shown.trailing ? (
            <span aria-hidden="true" style={{ display: 'block', height: shown.trailing }} />
          ) : null}
        </code>
      </pre>
    </>
  )
}
