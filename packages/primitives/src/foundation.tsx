// Canonical authored primitives. The compiler normally lowers these to a
// platform element, but these implementations keep uncompiled and partially
// compiled source useful instead of turning compilation into a runtime
// requirement.

import {
  type HozoDomStyle,
  hozoDomStyle,
  hozoViewBase,
  hozoViewClassName,
  type ResponderProps,
  useResponderDomProps,
} from '@hozo/engine'
import {
  type AriaRole,
  type CSSProperties,
  type MouseEventHandler,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { type ButtonDataProps, buttonDataProps } from './button-host-attributes.ts'
import { HozoLink } from './link.ts'
import { HozoPressable, type HozoPressableProps } from './pressable.ts'
import { HozoTextInput, type HozoTextInputProps } from './text-input.ts'

export type {
  HozoResponderEvent,
  HozoResponderTouch,
  HozoTouchHistory,
  HozoTouchTrack,
  ResponderProps,
} from '@hozo/engine'

export interface HozoLayoutRectangle {
  x: number
  y: number
  width: number
  height: number
}

export interface HozoLayoutEvent {
  nativeEvent: { layout: HozoLayoutRectangle }
}

export type HozoStyle = HozoDomStyle

export interface UniversalProps {
  role?: AriaRole
  style?: HozoStyle
  testID?: string
  nativeID?: string
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only'
  accessibilityState?: {
    disabled?: boolean
    selected?: boolean
    checked?: boolean | 'mixed'
    busy?: boolean
    expanded?: boolean
  }
  accessibilityValue?: { min?: number; max?: number; now?: number; text?: string }
  accessibilityLiveRegion?: 'none' | 'polite' | 'assertive'
  accessibilityLabel?: string
  accessibilityHint?: string
  onLayout?: (event: HozoLayoutEvent) => void
}

function universalDomProps(props: UniversalProps) {
  const state = props.accessibilityState
  const value = props.accessibilityValue
  return {
    role: props.role,
    style: hozoDomStyle(props.style),
    'data-testid': props.testID,
    id: props.nativeID,
    'data-hozo-pointer-events': props.pointerEvents,
    'data-hozo-disabled': state?.disabled ? '' : undefined,
    'aria-disabled': state?.disabled,
    'aria-selected': state?.selected,
    'aria-checked': state?.checked,
    'aria-busy': state?.busy,
    'aria-expanded': state?.expanded,
    'aria-valuemin': value?.min,
    'aria-valuemax': value?.max,
    'aria-valuenow': value?.now,
    'aria-valuetext': value?.text,
    'aria-live':
      props.accessibilityLiveRegion === 'none' ? undefined : props.accessibilityLiveRegion,
    'aria-label': props.accessibilityLabel,
    'aria-description': props.accessibilityHint,
  } as const
}

/**
 * The element, for `onLayout` and the responder, and the caller's `ref` too.
 *
 * React Native's `View` takes a `ref`, and the compiled `<div>` passes one
 * straight through. This fallback held its own ref for `onLayout` and gave
 * the caller nothing, so whether `ref` worked depended on whether the
 * compiler had run. `setRef` hands the node to both.
 */
function useLayoutRef<T extends HTMLElement>(
  onLayout?: (event: HozoLayoutEvent) => void,
  forwarded?: Ref<T>,
) {
  const elementRef = useRef<T>(null)
  // A new function only when the caller's ref changes, so React detaches the
  // old one and attaches the new rather than re-running both every render.
  const setRef = useCallback(
    (node: T | null) => {
      elementRef.current = node
      if (typeof forwarded === 'function') forwarded(node)
      else if (forwarded) forwarded.current = node
    },
    [forwarded],
  )
  const callbackRef = useRef(onLayout)
  callbackRef.current = onLayout

  useEffect(() => {
    const element = elementRef.current
    if (!element || !callbackRef.current) return

    let previous = ''
    const emit = () => {
      const rect = element.getBoundingClientRect()
      const layout = {
        x: element.offsetLeft,
        y: element.offsetTop,
        width: rect.width,
        height: rect.height,
      }
      const key = `${layout.x}:${layout.y}:${layout.width}:${layout.height}`
      if (key === previous) return
      previous = key
      callbackRef.current?.({ nativeEvent: { layout } })
    }

    emit()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(emit)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { elementRef, setRef }
}

export interface ViewProps extends UniversalProps, ResponderProps {
  className?: string
  children?: ReactNode
  ref?: Ref<HTMLDivElement>
}

export function View({ className, children, onLayout, ref, ...universal }: ViewProps) {
  const { elementRef, setRef } = useLayoutRef<HTMLDivElement>(onLayout, ref)
  const responder = useResponderDomProps(elementRef, universal)
  return (
    <>
      {hozoViewBase()}
      <div
        ref={setRef}
        className={hozoViewClassName(className)}
        {...universalDomProps(universal)}
        {...responder}
      >
        {children}
      </div>
    </>
  )
}

export interface TextProps extends UniversalProps {
  className?: string
  children?: ReactNode
  ref?: Ref<HTMLSpanElement>
}

export function Text({ className, children, onLayout, ref, ...universal }: TextProps) {
  const { setRef } = useLayoutRef<HTMLSpanElement>(onLayout, ref)
  return (
    <span ref={setRef} className={className} {...universalDomProps(universal)}>
      {children}
    </span>
  )
}

export interface ImageProps extends UniversalProps {
  className?: string
  src: HozoImageSource
  defaultSource?: HozoImageSource
  alt?: string
  accessibilityLabel?: string
  onLoad?: (event: unknown) => void
  onError?: (event: unknown) => void
  ref?: Ref<HTMLImageElement>
}

export interface HozoImageSourceObject {
  uri?: string
  default?: string
}

export type HozoImageSource =
  | string
  | number
  | HozoImageSourceObject
  | readonly HozoImageSourceObject[]

function webImageSource(source?: HozoImageSource): string | undefined {
  if (typeof source === 'string') return source
  if (!source || typeof source !== 'object') return undefined
  if (Array.isArray(source)) {
    for (const candidate of source) {
      const resolved = webImageSource(candidate)
      if (resolved) return resolved
    }
    return undefined
  }
  const object = source as HozoImageSourceObject
  return typeof object.uri === 'string'
    ? object.uri
    : typeof object.default === 'string'
      ? object.default
      : undefined
}

export function Image({
  className,
  src,
  defaultSource,
  alt,
  accessibilityLabel,
  onLoad,
  onError,
  onLayout,
  ref,
  ...universal
}: ImageProps) {
  const { setRef } = useLayoutRef<HTMLImageElement>(onLayout, ref)
  const [failedSource, setFailedSource] = useState<HozoImageSource>()
  const webSrc =
    (failedSource === src ? undefined : webImageSource(src)) ?? webImageSource(defaultSource)
  return (
    <img
      ref={setRef}
      className={className}
      src={webSrc}
      alt={alt ?? accessibilityLabel ?? ''}
      onLoad={onLoad}
      onError={(event) => {
        setFailedSource(src)
        onError?.(event)
      }}
      {...universalDomProps(universal)}
    />
  )
}

export {
  HozoPressable as Pressable,
  type HozoPressableProps as PressableProps,
  HozoTextInput as TextInput,
  type HozoTextInputProps as TextInputProps,
}

export interface LinkProps {
  className?: string
  children?: ReactNode
  style?: CSSProperties
  testID?: string
  nativeID?: string
  accessibilityLabel?: string
  accessibilityHint?: string
  'aria-hidden'?: boolean
  href: string
  target?: '_blank' | '_self' | '_parent' | '_top' | string
  rel?: string
  download?: boolean | string
  external?: boolean
  replace?: boolean
  prefetch?: boolean
  onPress?: MouseEventHandler<HTMLAnchorElement>
  disabled?: boolean
}

export function Link({ children, ...props }: LinkProps) {
  return <HozoLink {...props}>{children}</HozoLink>
}

export interface ButtonProps extends ButtonDataProps {
  className?: string
  children?: ReactNode
  onPress?: MouseEventHandler<HTMLElement>
  disabled?: boolean
  accessibilityLabel?: string
  accessibilityHint?: string
  href?: string
  external?: boolean
  replace?: boolean
  prefetch?: boolean
  target?: '_blank' | '_self' | '_parent' | '_top' | string
  rel?: string
  download?: boolean | string
  testID?: string
  /** Stable host ID: DOM id on Web, nativeID on React Native. */
  nativeID?: string
}

export function Button({
  className,
  children,
  onPress,
  disabled,
  accessibilityLabel,
  accessibilityHint,
  href,
  external,
  replace,
  prefetch,
  target,
  rel,
  download,
  testID,
  nativeID,
  ...metadata
}: ButtonProps) {
  const data = buttonDataProps(metadata)
  if (href != null) {
    return (
      <HozoLink
        {...data}
        href={href}
        external={external}
        replace={replace}
        prefetch={prefetch}
        target={target}
        rel={rel}
        download={download}
        className={className}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        disabled={disabled}
        testID={testID}
        nativeID={nativeID}
        onPress={onPress as MouseEventHandler<HTMLAnchorElement>}
      >
        {children}
      </HozoLink>
    )
  }
  return (
    <>
      {hozoViewBase()}
      <button
        {...data}
        type="button"
        className={className}
        disabled={disabled}
        data-hozo-disabled={disabled ? '' : undefined}
        data-hozo-pressable={onPress && !disabled ? '' : undefined}
        aria-label={accessibilityLabel}
        aria-description={accessibilityHint}
        data-testid={testID}
        id={nativeID}
        onClick={onPress as MouseEventHandler<HTMLButtonElement>}
      >
        {children}
      </button>
    </>
  )
}
