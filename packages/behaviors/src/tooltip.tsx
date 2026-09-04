import {
  type CSSProperties,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefObject,
  useRef,
} from 'react'
import { DismissableLayer } from './dismissable-layer.tsx'
import type { BasePlacement, Placement } from './floating-geometry.ts'
import { FloatingPositioner } from './floating-positioner.tsx'
import {
  type TriggerProps,
  type UseHoverTriggerOptions,
  useHoverTrigger,
} from './hover-trigger.tsx'
import { Portal } from './portal.tsx'

export interface TooltipProps
  extends Omit<UseHoverTriggerOptions, 'anchorRef' | 'floatingRef' | 'placement'> {
  content: ReactNode
  children?:
    | ReactNode
    | ((props: {
        ref: React.RefObject<HTMLElement | null>
        triggerProps: TriggerProps
        isOpen: boolean
      }) => ReactNode)
  placement?: Placement
  offset?: number
  crossAxisOffset?: number
  flip?: boolean
  shift?: boolean
  portal?: boolean
  className?: string
  style?: CSSProperties
  arrowPadding?: number
}

/**
 * Headless Universal Tooltip component for Web.
 * Connects useHoverTrigger, FloatingPositioner, Portal, and DismissableLayer.
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
  hoverableContent = true,
  openOnFocus = true,
  open,
  defaultOpen,
  onOpenChange,
  className,
  style,
  arrowPadding = 4,
  contentId,
}: TooltipProps) {
  const anchorRef = useRef<HTMLElement | null>(null)
  const basePlacement = (placement.split('-')[0] || 'top') as BasePlacement

  const { isOpen, setIsOpen, triggerProps, contentProps } = useHoverTrigger({
    open,
    defaultOpen,
    onOpenChange,
    openDelay,
    closeDelay,
    disabled,
    hoverableContent,
    openOnFocus,
    anchorRef,
    placement: basePlacement,
    contentId,
  })

  let triggerNode: ReactNode

  if (typeof children === 'function') {
    triggerNode = children({
      ref: anchorRef,
      triggerProps,
      isOpen,
    })
  } else if (isValidElement(children)) {
    // Clone element to inject ref and event listeners seamlessly
    // The props this is about to inject, named here so the injection can
    // be checked. It used to end in , which turned the one call
    // that has to agree with the child into the one call that could not
    // disagree with anything.
    const child = children as ReactElement<{
      ref?: Ref<HTMLElement>
      'aria-describedby'?: string
      onPointerEnter?: (e: React.PointerEvent) => void
      onPointerLeave?: (e: React.PointerEvent) => void
      onFocus?: (e: React.FocusEvent) => void
      onBlur?: (e: React.FocusEvent) => void
      onKeyDown?: (e: React.KeyboardEvent) => void
    }>
    triggerNode = cloneElement(child, {
      ref: anchorRef,
      onPointerEnter: (e: React.PointerEvent) => {
        child.props.onPointerEnter?.(e)
        triggerProps.onPointerEnter(e)
      },
      onPointerLeave: (e: React.PointerEvent) => {
        child.props.onPointerLeave?.(e)
        triggerProps.onPointerLeave(e)
      },
      onFocus: (e: React.FocusEvent) => {
        child.props.onFocus?.(e)
        triggerProps.onFocus(e)
      },
      onBlur: (e: React.FocusEvent) => {
        child.props.onBlur?.(e)
        triggerProps.onBlur(e)
      },
      onKeyDown: (e: React.KeyboardEvent) => {
        child.props.onKeyDown?.(e)
        triggerProps.onKeyDown(e)
      },
      'aria-describedby': triggerProps['aria-describedby'],
    })
  } else {
    triggerNode = (
      <span
        ref={anchorRef as unknown as RefObject<HTMLSpanElement>}
        {...triggerProps}
        style={{ display: 'inline-block' }}
      >
        {children}
      </span>
    )
  }

  const floatingContent = isOpen ? (
    <DismissableLayer onDismiss={() => setIsOpen(false)}>
      <FloatingPositioner
        anchorRef={anchorRef}
        placement={placement}
        offset={offset}
        crossAxisOffset={crossAxisOffset}
        flip={flip}
        shift={shift}
        arrowPadding={arrowPadding}
        className={className}
        style={{
          pointerEvents: hoverableContent ? 'auto' : 'none',
          ...style,
        }}
      >
        <div id={triggerProps['aria-describedby']} role="tooltip" {...contentProps}>
          {content}
        </div>
      </FloatingPositioner>
    </DismissableLayer>
  ) : null

  return (
    <>
      {triggerNode}
      {portal ? <Portal>{floatingContent}</Portal> : floatingContent}
    </>
  )
}
