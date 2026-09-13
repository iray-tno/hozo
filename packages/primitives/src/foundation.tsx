// Canonical authored primitives. The compiler normally lowers these to a
// platform element, but these implementations keep uncompiled and partially
// compiled source useful instead of turning compilation into a runtime
// requirement.

import {
  type HozoDomStyle,
  HozoLink,
  HozoPressable,
  type HozoPressableProps,
  HozoTextInput,
  type HozoTextInputProps,
  hozoDomStyle,
  type ResponderProps,
  useResponderDomProps,
} from '@hozo/runtime'
import {
  type AriaRole,
  type CSSProperties,
  type MouseEventHandler,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'

export type {
  HozoResponderEvent,
  HozoResponderTouch,
  HozoTouchHistory,
  HozoTouchTrack,
  ResponderProps,
} from '@hozo/runtime'

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

function useLayoutRef<T extends HTMLElement>(onLayout?: (event: HozoLayoutEvent) => void) {
  const elementRef = useRef<T>(null)
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

  return elementRef
}

export interface ViewProps extends UniversalProps, ResponderProps {
  className?: string
  children?: ReactNode
}

export function View({ className, children, onLayout, ...universal }: ViewProps) {
  const ref = useLayoutRef<HTMLDivElement>(onLayout)
  const responder = useResponderDomProps(ref, universal)
  return (
    <div ref={ref} className={className} {...universalDomProps(universal)} {...responder}>
      {children}
    </div>
  )
}

export interface TextProps extends UniversalProps {
  className?: string
  children?: ReactNode
}

export function Text({ className, children, onLayout, ...universal }: TextProps) {
  const ref = useLayoutRef<HTMLSpanElement>(onLayout)
  return (
    <span ref={ref} className={className} {...universalDomProps(universal)}>
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
  ...universal
}: ImageProps) {
  const ref = useLayoutRef<HTMLImageElement>(onLayout)
  const [failedSource, setFailedSource] = useState<HozoImageSource>()
  const webSrc =
    (failedSource === src ? undefined : webImageSource(src)) ?? webImageSource(defaultSource)
  return (
    <img
      ref={ref}
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
}

export function Link({ children, ...props }: LinkProps) {
  return <HozoLink {...props}>{children}</HozoLink>
}

export interface ButtonProps {
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
}: ButtonProps) {
  if (href != null) {
    return (
      <HozoLink
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
        onPress={onPress as MouseEventHandler<HTMLAnchorElement>}
      >
        {children}
      </HozoLink>
    )
  }
  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      data-hozo-disabled={disabled ? '' : undefined}
      aria-label={accessibilityLabel}
      aria-description={accessibilityHint}
      data-testid={testID}
      onClick={onPress as MouseEventHandler<HTMLButtonElement>}
    >
      {children}
    </button>
  )
}
