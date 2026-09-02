import React, { type ReactNode } from 'react'

export interface SemanticsNativeProps {
  children?: ReactNode
  style?: any
  testID?: string
  nativeID?: string
  role?: string
  accessibilityRole?: string
  accessibilityLabel?: string
  accessibilityHint?: string
  accessible?: boolean
}

export interface TimeNativeProps extends SemanticsNativeProps {
  dateTime?: string
  datetime?: string
}

export function Main({ role = 'main', ...props }: SemanticsNativeProps) {
  return React.createElement('View', { role, ...props })
}

export function Header({ role = 'banner', ...props }: SemanticsNativeProps) {
  return React.createElement('View', { role, ...props })
}

export function Footer({ role = 'contentinfo', ...props }: SemanticsNativeProps) {
  return React.createElement('View', { role, ...props })
}

export function Aside({ role = 'complementary', ...props }: SemanticsNativeProps) {
  return React.createElement('View', { role, ...props })
}

export function Search({ role = 'search', ...props }: SemanticsNativeProps) {
  return React.createElement('View', { role, ...props })
}

export function Section(props: SemanticsNativeProps) {
  return React.createElement('View', props)
}

export function Article({ role = 'article', ...props }: SemanticsNativeProps) {
  return React.createElement('View', { role, ...props })
}

export function Nav({ role = 'navigation', ...props }: SemanticsNativeProps) {
  return React.createElement('View', { role, ...props })
}

export function Figure({ role = 'figure', ...props }: SemanticsNativeProps) {
  return React.createElement('View', { role, ...props })
}

export function Figcaption(props: SemanticsNativeProps) {
  return React.createElement('Text', props)
}

export function Time(props: TimeNativeProps) {
  return React.createElement('Text', props)
}

export function Address(props: SemanticsNativeProps) {
  return React.createElement('View', props)
}
