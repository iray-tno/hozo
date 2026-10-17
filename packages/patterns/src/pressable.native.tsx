import {
  HozoInteractionContext,
  type HozoPressableInteractionState,
  usePressableInteraction,
} from '@hozo/behaviors/pressable-interaction'
import { type ComponentProps, type ReactNode, useMemo } from 'react'
import { Pressable as NativePressable, type StyleProp, type ViewStyle } from 'react-native'

export type InteractionState = HozoPressableInteractionState
interface Props extends Omit<ComponentProps<typeof NativePressable>, 'style' | 'children'> {
  style?: StyleProp<ViewStyle> | ((state: InteractionState) => StyleProp<ViewStyle>)
  children?: ReactNode | ((state: InteractionState) => ReactNode)
}

/** The primitive's same facts, without allocating animation nodes for a pattern. */
export function Pressable({
  style,
  children,
  onHoverIn,
  onHoverOut,
  onFocus,
  onBlur,
  onPointerDown,
  onKeyDown,
  onPressIn,
  onPressOut,
  ...props
}: Props) {
  const { state, handlers } = usePressableInteraction({ focusVisible: true })
  // A Text a caller nests reads this, as it would inside the primitive, so
  // a component's `hover:` text classes reach it (#974).
  const shared = useMemo(
    () => ({
      pressed: state.pressed,
      hovered: state.hovered,
      focused: state.focused,
      focusVisible: state.focusVisible,
    }),
    [state.pressed, state.hovered, state.focused, state.focusVisible],
  )
  const host = (
    <NativePressable
      {...props}
      onHoverIn={(event) => {
        handlers.hoverIn()
        onHoverIn?.(event)
      }}
      onHoverOut={(event) => {
        handlers.hoverOut()
        onHoverOut?.(event)
      }}
      onFocus={(event) => {
        handlers.focus()
        onFocus?.(event)
      }}
      onBlur={(event) => {
        handlers.blur()
        onBlur?.(event)
      }}
      onPointerDown={(event) => {
        handlers.pointerDown()
        onPointerDown?.(event)
      }}
      onKeyDown={(event) => {
        handlers.keyDown()
        onKeyDown?.(event)
      }}
      onPressIn={(event) => {
        handlers.pressIn()
        onPressIn?.(event)
      }}
      onPressOut={(event) => {
        handlers.pressOut()
        onPressOut?.(event)
      }}
      style={
        typeof style === 'function'
          ? ({ pressed }) => style({ ...state, pressed: pressed || state.pressed })
          : style
      }
    >
      {typeof children === 'function'
        ? ({ pressed }) => children({ ...state, pressed: pressed || state.pressed })
        : children}
    </NativePressable>
  )
  return <HozoInteractionContext.Provider value={shared}>{host}</HozoInteractionContext.Provider>
}
