import { hozoTextChildren, useHozoMessage } from '@hozo/behaviors'
import { useDrag1D } from '@hozo/behaviors/native'
import { usePressableInteraction } from '@hozo/behaviors/pressable-interaction'
import { hozoClasses } from '@hozo/engine/project'
import { type ReactNode, useId } from 'react'
import { type StyleProp, View, type ViewStyle } from 'react-native'
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
  style?: StyleProp<ViewStyle>
}

export interface ResizablePaneProps extends SplitterSizeProps {
  side: SplitterSide
  label: string
  children: ReactNode
  className?: string
  paneClassName?: string
  handleClassName?: string
  style?: StyleProp<ViewStyle>
  paneStyle?: StyleProp<ViewStyle>
  handleStyle?: StyleProp<ViewStyle>
}

function Handle({
  state,
  side,
  label,
  className,
  style,
  valueText,
}: {
  state: SplitterState
  side: SplitterSide
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
      style={[hozoClasses(className, facts), style]}
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
  const splitter = (
    <Handle
      state={state}
      side={side}
      label={label}
      className={handleClassName}
      style={handleStyle}
      valueText={valueText}
    />
  )
  return (
    <View
      style={[
        hozoClasses(className),
        style,
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
          hozoClasses(paneClassName),
          paneStyle,
          {
            [vertical ? 'width' : 'height']: state.current,
            flexShrink: 0,
            overflow: 'hidden',
            display: state.collapsed ? 'none' : 'flex',
          },
        ]}
      >
        {hozoTextChildren(children)}
      </View>
      {side === 'start' || side === 'top' ? splitter : null}
    </View>
  )
}
