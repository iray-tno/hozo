import { useDrag1D, useHozoMessage } from '@hozo/behaviors'
import { type CSSProperties, type ReactNode, useId, useLayoutEffect, useRef } from 'react'
import {
  type SplitterSide,
  type SplitterSizeProps,
  type SplitterState,
  splitterSign,
  useSplitterState,
} from './splitter-state.ts'

export type { SplitterSide } from './splitter-state.ts'

export interface SplitterProps extends SplitterSizeProps {
  label: string
  controls: string
  side?: SplitterSide
  orientation?: 'vertical' | 'horizontal'
  className?: string
  style?: CSSProperties
}

export interface ResizablePaneProps extends SplitterSizeProps {
  side: SplitterSide
  label: string
  children: ReactNode
  className?: string
  paneClassName?: string
  handleClassName?: string
  style?: CSSProperties
  paneStyle?: CSSProperties
  handleStyle?: CSSProperties
}

function Handle({
  state,
  side,
  label,
  controls,
  className,
  style,
  valueText,
  handleRef,
}: {
  state: SplitterState
  side: SplitterSide
  handleRef?: React.Ref<HTMLDivElement>
} & Pick<SplitterProps, 'label' | 'controls' | 'className' | 'style' | 'valueText'>) {
  const message = useHozoMessage()
  const vertical = side === 'start' || side === 'end'
  const sign = splitterSign(side)
  const drag = useDrag1D({
    axis: vertical ? 'x' : 'y',
    onStart: state.begin,
    onMove: (delta) => state.move(delta * sign),
    onEnd: (delta) => state.end(delta * sign),
    onCancel: state.cancel,
  })
  return (
    <div
      ref={handleRef}
      role="separator"
      tabIndex={0}
      aria-label={message('hozo.splitter.label', { label })}
      aria-controls={controls}
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-valuemin={state.collapsed ? state.collapsedSize : state.min}
      aria-valuemax={state.max}
      aria-valuenow={state.current}
      aria-valuetext={
        valueText?.(state.current) ?? message('hozo.splitter.value', { size: state.current })
      }
      className={className}
      // Above its neighbours, so the reach below can be grabbed over them and
      // a focus ring drawn past the handle's edges is not painted under them.
      // Inline rather than a class, so a caller's classes cannot reorder it;
      // an explicit `style` still can.
      style={{
        position: 'relative',
        zIndex: 1,
        ...style,
        touchAction: 'none',
        userSelect: 'none',
      }}
      data-dragging={drag.dragging ? '' : undefined}
      data-collapsed={state.collapsed ? '' : undefined}
      {...drag.handlers}
      onKeyDown={(event) => {
        if (
          state.key(
            event.key,
            side,
            getComputedStyle(event.currentTarget).direction === 'rtl',
            event.shiftKey,
          )
        )
          event.preventDefault()
      }}
    >
      {/* What a pointer grabs, apart from what is painted: the Web half of
          Native's `hitSlop`. It reaches the same distance either side of the
          handle, so a handle drawn as a thin line is grabbed around that line
          and not beside it. A child of the handle, so its presses are the
          handle's. */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          inset: vertical ? `0 -${HANDLE_REACH}px` : `-${HANDLE_REACH}px 0`,
        }}
      />
    </div>
  )
}

/** How far past each edge of a handle a pointer can grab it on Web, in px. */
const HANDLE_REACH = 4

export function Splitter(props: SplitterProps) {
  const state = useSplitterState(props)
  return (
    <Handle
      {...props}
      state={state}
      side={props.side ?? (props.orientation === 'horizontal' ? 'top' : 'start')}
    />
  )
}

export function ResizablePane(props: ResizablePaneProps) {
  const {
    side,
    label,
    children,
    className,
    paneClassName,
    handleClassName,
    style,
    paneStyle,
    handleStyle,
    valueText,
  } = props
  const state = useSplitterState(props)
  const id = useId()
  const vertical = side === 'start' || side === 'end'
  const pane = useRef<HTMLElement>(null)
  const handle = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (state.collapsed && pane.current?.contains(document.activeElement)) handle.current?.focus()
  }, [state.collapsed])
  const splitter = (
    <Handle
      state={state}
      side={side}
      label={label}
      controls={id}
      className={handleClassName}
      style={handleStyle}
      valueText={valueText}
      handleRef={handle}
    />
  )
  return (
    <div
      className={className}
      style={{
        // One layer above the surface beside the pane, so the handle's reach
        // and focus ring extend over that surface too. A `View` is positioned,
        // so without this the surface, coming later, is painted and hit over
        // them. One layer and no more: the handle's own `zIndex` is decided in
        // here, so it does not rise over the page's menus and dialogs. Before
        // `style`, so an explicit style can say otherwise.
        position: 'relative',
        zIndex: 1,
        ...style,
        display: 'flex',
        flexDirection: vertical ? 'row' : 'column',
        flexShrink: 0,
      }}
    >
      {side === 'end' || side === 'bottom' ? splitter : null}
      <section
        ref={pane}
        id={id}
        aria-label={label}
        inert={state.collapsed || undefined}
        className={paneClassName}
        style={
          {
            ...paneStyle,
            '--hozo-pane-size': `${state.current}px`,
            [vertical ? 'width' : 'height']: 'var(--hozo-pane-size)',
            flexShrink: 0,
            boxSizing: 'border-box',
            display: state.collapsed ? 'none' : undefined,
            minWidth: 0,
            minHeight: 0,
            overflow: 'hidden',
            // Whatever `zIndex` the pane's content uses stays inside the pane,
            // so none of it rises over the handle's reach.
            isolation: 'isolate',
          } as CSSProperties
        }
      >
        {children}
      </section>
      {side === 'start' || side === 'top' ? splitter : null}
    </div>
  )
}
