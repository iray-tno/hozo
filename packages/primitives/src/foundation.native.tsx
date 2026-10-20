import { hozoTextChildren } from '@hozo/behaviors'
import { HozoTextSizeContext } from '@hozo/engine'
import React, { type ComponentRef, type ComponentType, type ReactNode, type Ref } from 'react'
import {
  type AccessibilityRole,
  Pressable as RNPressable,
  type PressableProps as RNPressableProps,
  Text as RNText,
  TextInput as RNTextInput,
  type TextProps as RNTextProps,
  type StyleProp,
  StyleSheet,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import {
  BUTTON_TRIGGER_PROPS_NATIVE,
  type ButtonDataProps,
  buttonDataProps,
  buttonTriggerProps,
} from './button-host-attributes.ts'
import { hozoButtonProps } from './button-host-props.native.ts'
import { HozoLink } from './link.native.tsx'
import { type NativeTextInputProps, nativeTextInputProps } from './text-input-props.native.ts'

export type {
  HozoResponderEvent,
  HozoResponderTouch,
  HozoTouchHistory,
  HozoTouchTrack,
  ResponderProps,
} from '@hozo/engine'
export type {
  ImageProps,
  ViewProps,
} from 'react-native'
export { Image, View } from 'react-native'
export type TextInputProps = NativeTextInputProps & { ref?: Ref<ComponentRef<typeof RNTextInput>> }

/** The canonical disabled contract also applies outside compiler-owned JSX. */
export function TextInput({ ref, ...props }: TextInputProps) {
  return <RNTextInput {...nativeTextInputProps(props)} ref={ref} />
}
export type {
  HozoImageSource,
  HozoImageSourceObject,
  HozoLayoutEvent,
  HozoLayoutRectangle,
  HozoStyle,
  UniversalProps,
} from './foundation.tsx'

export type TextProps = RNTextProps

export function Text({ children, style, ...props }: TextProps) {
  const size = StyleSheet.flatten(style)?.fontSize
  const text = React.createElement(RNText, { style, ...props }, children)
  if (size === undefined) return text
  return <HozoTextSizeContext.Provider value={size}>{text}</HozoTextSizeContext.Provider>
}

export interface PressableProps extends RNPressableProps {
  /**
   * The view this press target lands on.
   *
   * Declared rather than inherited, because React Native's own
   * `PressableProps` does not carry it: the `ref` is on the *component*
   * (`(props: Omit<PressableProps, 'ref'> & { ref?: Ref<PressableInstance> })`),
   * so a wrapper whose props are `PressableProps` rejects one. It is spread
   * through to `RNPressable` below either way -- this only stops TypeScript
   * refusing what already worked.
   *
   * A caller needs it to hand the control to something else: `Dialog`'s
   * `restoreFocusTo` is where this came up (#462).
   */
  // RN 0.86's Pressable ref is a View instance; later minors expose a
  // HostInstance. Derive it from the actual peer rather than widening it
  // beyond what that peer's Pressable accepts (and Dialog can restore).
  ref?: Ref<ComponentRef<typeof RNPressable>>
  href?: string
  external?: boolean
  replace?: boolean
  prefetch?: boolean
  target?: string
  rel?: string
  download?: boolean | string
}

export function Pressable({
  href,
  external,
  replace,
  prefetch,
  target: _target,
  rel: _rel,
  download: _download,
  ...props
}: PressableProps) {
  if (href === undefined) return <RNPressable {...props} />

  const Link = HozoLink as unknown as ComponentType<
    { href: string; external?: boolean; replace?: boolean; prefetch?: boolean } & RNPressableProps
  >
  return <Link href={href} external={external} replace={replace} prefetch={prefetch} {...props} />
}

export interface LinkProps {
  className?: string
  children?: ReactNode
  href: string
  external?: boolean
  replace?: boolean
  prefetch?: boolean
  target?: string
  rel?: string
  download?: boolean | string
  onPress?: (event: { defaultPrevented?: boolean }) => void
  disabled?: boolean
  style?: StyleProp<TextStyle>
  testID?: string
  nativeID?: string
  accessibilityLabel?: string
  accessibilityHint?: string
  accessibilityRole?: AccessibilityRole
}

export function Link({
  href,
  external,
  replace,
  prefetch,
  target: _target,
  rel: _rel,
  download: _download,
  ...props
}: LinkProps) {
  const NativeLink = HozoLink as unknown as ComponentType<
    { href: string; external?: boolean; replace?: boolean; prefetch?: boolean } & Omit<
      LinkProps,
      'href' | 'external' | 'replace' | 'prefetch'
    >
  >
  return (
    <NativeLink href={href} external={external} replace={replace} prefetch={prefetch} {...props} />
  )
}

export interface ButtonProps extends ButtonDataProps {
  className?: string
  children?: ReactNode
  onPress?: RNPressableProps['onPress']
  disabled?: boolean
  accessibilityLabel?: string
  accessibilityHint?: string
  href?: string
  external?: boolean
  replace?: boolean
  prefetch?: boolean
  target?: string
  rel?: string
  download?: boolean | string
  style?: StyleProp<ViewStyle>
  testID?: string
  nativeID?: string
  /**
   * What a wrapper writes to make this a trigger -- `Tooltip` measures the
   * ref and opens on hover or a long press (#1137). Forwarded to the
   * Pressable as given.
   */
  ref?: Ref<ComponentRef<typeof RNPressable>>
  onFocus?: RNPressableProps['onFocus']
  onBlur?: RNPressableProps['onBlur']
  onHoverIn?: RNPressableProps['onHoverIn']
  onHoverOut?: RNPressableProps['onHoverOut']
  onLongPress?: RNPressableProps['onLongPress']
}

export type ButtonNativeProps = ButtonProps

export function Button({
  children,
  onPress,
  disabled,
  accessibilityLabel,
  accessibilityHint,
  href,
  external,
  replace,
  prefetch,
  style,
  testID,
  nativeID,
  ...metadata
}: ButtonProps) {
  const shared = {
    ...hozoButtonProps(buttonDataProps(metadata)),
    ...buttonTriggerProps(metadata, BUTTON_TRIGGER_PROPS_NATIVE),
    disabled,
    accessibilityLabel,
    accessibilityHint,
    accessibilityState: disabled === undefined ? undefined : { disabled },
    style,
    testID,
    nativeID,
  }
  if (href !== undefined) {
    const NativeLink = HozoLink as unknown as ComponentType<
      { href: string; children?: ReactNode } & Omit<ButtonProps, 'href' | 'children'>
    >
    return (
      <NativeLink
        href={href}
        external={external}
        replace={replace}
        prefetch={prefetch}
        onPress={onPress}
        {...shared}
      >
        {children}
      </NativeLink>
    )
  }
  return (
    <RNPressable accessibilityRole="button" onPress={onPress} {...shared}>
      {hozoTextChildren(children)}
    </RNPressable>
  )
}
// A label a pressable can hand its text styles to (#876); see `hozoTextStyle`.
;(Text as { hozoLabelText?: boolean }).hozoLabelText = true
