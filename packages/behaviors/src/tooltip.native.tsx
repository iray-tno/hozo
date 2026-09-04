import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useRef,
} from 'react'
import type { Placement } from './floating-geometry.ts'
import { FloatingPositioner } from './floating-positioner.native.tsx'
import {
  type NativeTriggerProps,
  type UseHoverTriggerOptions,
  useHoverTrigger,
} from './hover-trigger.native.tsx'
import { Portal } from './portal.native.tsx'

export type NativeMeasurable = {
  measureInWindow?: (
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => void
}

export interface TooltipProps extends Omit<UseHoverTriggerOptions, 'anchorRef' | 'floatingRef'> {
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
  style?: Record<string, unknown> | unknown[]
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
    const child = children as ReactElement<{
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
    } as any)
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
