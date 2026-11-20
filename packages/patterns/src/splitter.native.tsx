import { hozoTextChildren, useHozoMessage } from '@hozo/behaviors'
import { useDrag1D } from '@hozo/behaviors/native'
import { usePressableInteraction } from '@hozo/behaviors/pressable-interaction'
import { hozoAuthoredStyle } from '@hozo/engine/generated/gap-styles'
import { hozoClasses } from '@hozo/engine/project'
import { type ReactNode, useId } from 'react'
import { type StyleProp, type TextStyle, View, type ViewStyle } from 'react-native'
import {
  type SplitterSide,
  type SplitterSizeProps,
  type SplitterState,
  splitterSign,
  useSplitterState,
} from './splitter-state.ts'
import { splitTextStyle } from './text-style.native.ts'

export type { SplitterSide } from './splitter-state.ts'

export interface SplitterHandleState {
  hovered: boolean
  focused: boolean
  focusVisible: boolean
  'data-dragging': boolean
  'data-collapsed': boolean
}

export interface SplitterProps extends SplitterSizeProps {
  label: string
  controls: string
  side?: SplitterSide
  orientation?: 'vertical' | 'horizontal'
  className?: string
  /** @internal Complete prepared handle class contribution (RFC 010). */
  hozoSplitterStyle?: (state: SplitterHandleState) => StyleProp<ViewStyle>
  style?: StyleProp<ViewStyle>
}

export interface ResizablePaneProps extends SplitterSizeProps {
  side: SplitterSide
  label: string
  children: ReactNode
  className?: string
  paneClassName?: string
  handleClassName?: string
  /** @internal Complete prepared root class contribution (RFC 010). */
  hozoResizablePaneStyle?: () => StyleProp<ViewStyle>
  /** @internal Complete prepared pane class contribution (RFC 010). */
  hozoPaneStyle?: () => StyleProp<ViewStyle | TextStyle>
  /** @internal Complete prepared handle class contribution (RFC 010). */
  hozoHandleStyle?: (state: SplitterHandleState) => StyleProp<ViewStyle>
  style?: StyleProp<ViewStyle>
  paneStyle?: StyleProp<ViewStyle>
  handleStyle?: StyleProp<ViewStyle>
}

function Handle({
  state,
  side,
  label,
  className,
  hozoStyle,
  style,
  valueText,
}: {
  state: SplitterState
  side: SplitterSide
  hozoStyle?: (state: SplitterHandleState) => StyleProp<ViewStyle>
} & Pick<SplitterProps, 'label' | 'className' | 'style' | 'valueText'>) {
  const message = useHozoMessage()
  const { state: interaction, handlers } = usePressableInteraction({
    focusVisible: 'keyboard-input',
  })
  const vertical = side === 'start' || side === 'end'
  const sign = splitterSign(side)
  const drag = useDrag1D({
    axis: vertical ? 'x' : 'y',
    onStart: state.begin,
    onMove: (delta) => state.move(delta * sign),
    onEnd: (delta) => state.end(delta * sign),
    onCancel: state.cancel,
  })
  const facts = {
    ...interaction,
    disabled: false,
    enabled: false,
    readOnly: true,
    'data-dragging': drag.dragging,
    'data-collapsed': state.collapsed,
  }
  return (
    <View
      accessible
      focusable
      accessibilityRole="adjustable"
      accessibilityLabel={message('hozo.splitter.label', { label })}
      accessibilityValue={{
        min: state.collapsed ? state.collapsedSize : state.min,
        max: state.max,
        now: state.current,
        text: valueText?.(state.current) ?? message('hozo.splitter.value', { size: state.current }),
      }}
      accessibilityActions={[
        { name: 'increment' },
        { name: 'decrement' },
        ...(state.collapsible
          ? [
              {
                name: 'toggle',
                label: message(state.collapsed ? 'hozo.splitter.expand' : 'hozo.splitter.collapse'),
              },
            ]
          : []),
      ]}
      onAccessibilityAction={(event) => {
        const action = event.nativeEvent.actionName
        if (action === 'toggle') state.toggle()
        else if (action === 'increment' || action === 'decrement')
          state.commit(
            state.change(state.current + (action === 'increment' ? state.step : -state.step)),
          )
      }}
      hitSlop={vertical ? { left: 22, right: 22 } : { top: 22, bottom: 22 }}
      // Above its neighbours, so `hitSlop` reaches over the pane when the pane
      // comes after the handle (`side` end or bottom): React Native gives an
      // overlapping touch to the sibling with the higher `zIndex`. `hitSlop`
      // never reaches past the parent's bounds, so on the surface's side of
      // the pane it is cut off there whatever the order. Before the classes,
      // so an explicit class or style can still say otherwise.
      style={[
        { zIndex: 1 },
        hozoStyle
          ? hozoStyle({
              hovered: interaction.hovered,
              focused: interaction.focused,
              focusVisible: interaction.focusVisible,
              'data-dragging': drag.dragging,
              'data-collapsed': state.collapsed,
            })
          : hozoClasses(className, facts),
        hozoAuthoredStyle(style),
      ]}
      onFocus={handlers.focus}
      onBlur={handlers.blur}
      onPointerEnter={handlers.hoverIn}
      onPointerLeave={handlers.hoverOut}
      onPointerDown={handlers.pointerDown}
      {...drag.handlers}
    />
  )
}

export function Splitter(props: SplitterProps) {
  if (props.hozoSplitterStyle && props.className !== undefined)
    throw new Error('Prepared Splitter styles must consume className')
  const state = useSplitterState(props)
  return (
    <Handle
      {...props}
      hozoStyle={props.hozoSplitterStyle}
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
    hozoResizablePaneStyle,
    hozoPaneStyle,
    hozoHandleStyle,
    style,
    paneStyle,
    handleStyle,
    valueText,
  } = props
  if (hozoResizablePaneStyle && className !== undefined)
    throw new Error('Prepared ResizablePane styles must consume className')
  if (hozoPaneStyle && paneClassName !== undefined)
    throw new Error('Prepared ResizablePane styles must consume paneClassName')
  if (hozoHandleStyle && handleClassName !== undefined)
    throw new Error('Prepared ResizablePane styles must consume handleClassName')
  const state = useSplitterState(props)
  const id = useId()
  const vertical = side === 'start' || side === 'end'
  const paneClassStyle = hozoPaneStyle
    ? hozoPaneStyle()
    : paneClassName
      ? hozoClasses(paneClassName)
      : undefined
  const authoredPaneStyle = hozoAuthoredStyle(paneStyle)
  const [paneBox, paneText] =
    paneClassStyle !== undefined || authoredPaneStyle !== undefined
      ? splitTextStyle([paneClassStyle, authoredPaneStyle])
      : [undefined, undefined]
  const splitter = (
    <Handle
      state={state}
      side={side}
      label={label}
      className={handleClassName}
      hozoStyle={hozoHandleStyle}
      style={handleStyle}
      valueText={valueText}
    />
  )
  return (
    <View
      style={[
        hozoResizablePaneStyle
          ? hozoResizablePaneStyle()
          : className
            ? hozoClasses(className)
            : undefined,
        hozoAuthoredStyle(style),
        { flexDirection: vertical ? 'row' : 'column', flexShrink: 0 },
      ]}
    >
      {side === 'end' || side === 'bottom' ? splitter : null}
      <View
        nativeID={id}
        role="region"
        accessibilityLabel={label}
        importantForAccessibility={state.collapsed ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={state.collapsed}
        style={[
          paneBox,
          {
            [vertical ? 'width' : 'height']: state.current,
            flexShrink: 0,
            overflow: 'hidden',
            display: state.collapsed ? 'none' : 'flex',
          },
        ]}
      >
        {hozoTextChildren(children, paneText)}
      </View>
      {side === 'start' || side === 'top' ? splitter : null}
    </View>
  )
}
