import {
  FloatingPositioner,
  type NativeTriggerProps,
  type Placement,
  Portal,
  type UseHoverTriggerOptions,
  useHoverTrigger,
} from '@hozo/behaviors/native'
import {
  type ComponentRef,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefObject,
  useRef,
} from 'react'
import type { StyleProp, View, ViewStyle } from 'react-native'

/**
 * What React Native hands back for a `<View>`.
 *
 * Was a shape of our own with `measureInWindow` on it, which is the one
 * method this file calls -- and which could not be given to a `<View ref>`,
 * so the ref a caller received here was not the ref `FloatingPositioner`
 * wanted. React Native names this type; naming it again differently is how
 * the two drifted.
 */
export type NativeMeasurable = ComponentRef<typeof View>

export interface TooltipProps extends Omit<UseHoverTriggerOptions, 'anchorRef' | 'floatingRef'> {
  /**
   * Tailwind classes, the same prop the Web half takes.
   *
   * On a tag the compiler lowers it is gone by runtime, replaced by a
   * `StyleSheet` entry. Anywhere else it is carried and ignored here --
   * this side has no CSS engine to resolve a class list against -- and
   * the type still has to accept it, because an app is type-checked
   * against the source the compiler reads rather than its output.
   */
  className?: string
  content: ReactNode
  children?:
    | ReactNode
    | ((props: {
        ref: RefObject<NativeMeasurable | null>
        triggerProps: NativeTriggerProps
        isOpen: boolean
      }) => ReactNode)
  placement?: Placement
  offset?: number
  crossAxisOffset?: number
  flip?: boolean
  shift?: boolean
  portal?: boolean
  style?: StyleProp<ViewStyle>
}

/**
 * Headless Universal Tooltip component for React Native.
 */
export function Tooltip({
  content,
  children,
  placement = 'top',
  offset = 8,
  crossAxisOffset = 0,
  flip = true,
  shift = true,
  portal = true,
  openDelay,
  closeDelay,
  disabled,
  openOnLongPress = true,
  open,
  defaultOpen,
  onOpenChange,
  style,
}: TooltipProps) {
  const anchorRef = useRef<NativeMeasurable | null>(null)

  const { isOpen, triggerProps } = useHoverTrigger({
    open,
    defaultOpen,
    onOpenChange,
    openDelay,
    closeDelay,
    disabled,
    openOnLongPress,
  })

  let triggerNode: ReactNode

  if (typeof children === 'function') {
    triggerNode = children({
      ref: anchorRef,
      triggerProps,
      isOpen,
    })
  } else if (isValidElement(children)) {
    // Named so the injection is checked; see the Web half.
    const child = children as ReactElement<{
      ref?: Ref<NativeMeasurable>
      onHoverIn?: () => void
      onHoverOut?: () => void
      onLongPress?: () => void
    }>
    triggerNode = cloneElement(child, {
      ref: anchorRef,
      onHoverIn: () => {
        child.props.onHoverIn?.()
        triggerProps.onHoverIn()
      },
      onHoverOut: () => {
        child.props.onHoverOut?.()
        triggerProps.onHoverOut()
      },
      onLongPress: () => {
        child.props.onLongPress?.()
        triggerProps.onLongPress()
      },
    })
  } else {
    triggerNode = children
  }

  const floatingContent = isOpen ? (
    <FloatingPositioner
      anchorRef={anchorRef}
      placement={placement}
      offset={offset}
      crossAxisOffset={crossAxisOffset}
      flip={flip}
      shift={shift}
      style={style}
    >
      {content}
    </FloatingPositioner>
  ) : null

  return (
    <>
      {triggerNode}
      {portal ? <Portal>{floatingContent}</Portal> : floatingContent}
    </>
  )
}
