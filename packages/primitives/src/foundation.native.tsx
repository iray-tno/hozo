import { HozoLink, HozoTextSizeContext, hozoTextChildren } from '@hozo/runtime'
import React, { type ComponentType, type ReactNode } from 'react'
import {
  type AccessibilityRole,
  Pressable as RNPressable,
  type PressableProps as RNPressableProps,
  Text as RNText,
  type TextProps as RNTextProps,
  type StyleProp,
  StyleSheet,
  type TextStyle,
  type ViewStyle,
} from 'react-native'

export type {
  HozoResponderEvent,
  HozoResponderTouch,
  HozoTouchHistory,
  HozoTouchTrack,
  ResponderProps,
} from '@hozo/runtime'
export type {
  ImageProps,
  TextInputProps,
  ViewProps,
} from 'react-native'
export { Image, TextInput, View } from 'react-native'
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

export interface ButtonProps {
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
}: ButtonProps) {
  const shared = {
    disabled,
    accessibilityLabel,
    accessibilityHint,
    accessibilityState: disabled === undefined ? undefined : { disabled },
    style,
    testID,
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
