import React, { type ReactNode } from 'react'
// The components rather than their names. These files used to render
// `React.createElement('View')`, and React Native resolves a string tag
// through its view config registry, where the registered names are
// `RCTView` and `RCTText` -- never `View` or `Text`. Every one of these
// would have thrown "View config getter callback for component `View`
// must be a function" on the first render. Nothing caught it because
// nothing imported these files: the tests next to them render the Web
// half through `react-dom/server`.
import {
  type AccessibilityRole,
  Pressable,
  type Role,
  type StyleProp,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native'

export interface SemanticsNativeProps {
  children?: ReactNode
  style?: StyleProp<ViewStyle>
  testID?: string
  nativeID?: string
  /**
   * React Native's own unions rather than `string`.
   *
   * `any` and a bare `string` are the same mistake at different sizes: a
   * prop that agrees with anything checks nothing. The Web half of this
   * file has always said `CSSProperties`; this half said `any`, so a Web-only
   * style or a role React Native has never heard of passed in silence.
   *
   * `Role` is the wider of the two and carries the landmark roles these
   * components exist for. `AccessibilityRole` is the older prop and does
   * not -- which is a difference this file had a bug in.
   */
  role?: Role
  accessibilityRole?: AccessibilityRole
  accessibilityLabel?: string
  accessibilityHint?: string
  accessible?: boolean
}

/** The same, for the ones that render text rather than a box. */
export interface SemanticsTextNativeProps extends Omit<SemanticsNativeProps, 'style'> {
  style?: StyleProp<TextStyle>
}

export interface TimeNativeProps extends SemanticsTextNativeProps {
  dateTime?: string
  datetime?: string
}

export function Main({ role = 'main', ...props }: SemanticsNativeProps) {
  return React.createElement(View, { role, ...props })
}

export function Header({ role = 'banner', ...props }: SemanticsNativeProps) {
  return React.createElement(View, { role, ...props })
}

export function Footer({ role = 'contentinfo', ...props }: SemanticsNativeProps) {
  return React.createElement(View, { role, ...props })
}

export function Aside({ role = 'complementary', ...props }: SemanticsNativeProps) {
  return React.createElement(View, { role, ...props })
}

/**
 * The one landmark React Native has no word for.
 *
 * Its `Role` union carries every other role in this file -- banner,
 * complementary, contentinfo, navigation, main, figure, group, list,
 * separator -- and for search it has `searchbox`, which is the field
 * rather than the region around it. `accessibilityRole: 'search'` means
 * the field too.
 *
 * So this is a plain box here, and says so, rather than claiming a
 * landmark by naming a widget. The Web half is a real `<search>`.
 */
export function Search(props: SemanticsNativeProps) {
  return React.createElement(View, props)
}

export function Section(props: SemanticsNativeProps) {
  return React.createElement(View, props)
}

export function Article({ role = 'article', ...props }: SemanticsNativeProps) {
  return React.createElement(View, { role, ...props })
}

export function Nav({ role = 'navigation', ...props }: SemanticsNativeProps) {
  return React.createElement(View, { role, ...props })
}

export function Figure({ role = 'figure', ...props }: SemanticsNativeProps) {
  return React.createElement(View, { role, ...props })
}

export function Figcaption(props: SemanticsTextNativeProps) {
  return React.createElement(Text, props)
}

export function Time(props: TimeNativeProps) {
  return React.createElement(Text, props)
}

export function Address(props: SemanticsNativeProps) {
  return React.createElement(View, props)
}

export function Fieldset({ role = 'group', ...props }: SemanticsNativeProps) {
  return React.createElement(View, { role, ...props })
}

export function Legend({ style, ...props }: SemanticsTextNativeProps) {
  return React.createElement(Text, { style: [{ fontWeight: 'bold' }, style], ...props })
}

export interface DetailsNativeProps extends SemanticsNativeProps {
  open?: boolean
  defaultOpen?: boolean
  onToggle?: (open: boolean) => void
}

const DetailsContext = React.createContext<{
  open: boolean
  toggle: () => void
}>({ open: false, toggle: () => {} })

export function Details({
  open: controlledOpen,
  defaultOpen = false,
  onToggle,
  children,
  ...props
}: DetailsNativeProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen)
  const isOpen = controlledOpen ?? uncontrolledOpen
  const toggle = React.useCallback(() => {
    const next = !isOpen
    setUncontrolledOpen(next)
    onToggle?.(next)
  }, [isOpen, onToggle])

  return React.createElement(
    DetailsContext.Provider,
    { value: { open: isOpen, toggle } },
    React.createElement(View, props, children),
  )
}

export function Summary({ children, ...props }: SemanticsNativeProps) {
  const { open, toggle } = React.useContext(DetailsContext)
  return React.createElement(
    Pressable,
    {
      accessibilityRole: 'button',
      accessibilityState: { expanded: open },
      onPress: toggle,
      ...props,
    },
    children,
  )
}

export function Term({ style, ...props }: SemanticsTextNativeProps) {
  return React.createElement(Text, { style: [{ fontWeight: 'bold' }, style], ...props })
}

export function Description(props: SemanticsNativeProps) {
  return React.createElement(View, props)
}

export function TermList({ role = 'list', ...props }: SemanticsNativeProps) {
  return React.createElement(View, { role, ...props })
}

TermList.Term = Term
TermList.Description = Description

export interface SeparatorProps extends SemanticsNativeProps {
  orientation?: 'horizontal' | 'vertical'
  decorative?: boolean
}

export function Separator({
  orientation = 'horizontal',
  decorative = false,
  role = decorative ? 'none' : 'separator',
  style,
  ...props
}: SeparatorProps) {
  const defaultStyle =
    orientation === 'vertical'
      ? { width: 1, alignSelf: 'stretch' as const }
      : { height: 1, alignSelf: 'stretch' as const }
  // Only `role` carries "separator": React Native's `accessibilityRole`
  // has no such value, so the line that used to set it here was a string
  // the platform would ignore. `none` it does have, and that is the half
  // worth keeping -- a decorative rule should be silent on both props.
  return React.createElement(View, {
    role,
    accessibilityRole: decorative ? 'none' : undefined,
    style: [defaultStyle, style],
    ...props,
  })
}

export interface ProgressProps extends SemanticsNativeProps {
  value?: number
  max?: number
  accessibilityValue?: {
    min?: number
    max?: number
    now?: number
    text?: string
  }
}

export function Progress({
  value,
  max,
  role = 'progressbar',
  accessibilityValue,
  style,
  children,
  ...props
}: ProgressProps) {
  return React.createElement(
    View,
    {
      role,
      accessibilityRole: 'progressbar',
      accessibilityValue: accessibilityValue ?? {
        min: 0,
        max: max ?? 100,
        now: value,
      },
      style,
      ...props,
    },
    children,
  )
}

/**
 * The names `@hozo/core` re-exports on the Web.
 *
 * The interfaces here are spelled `…NativeProps` because they are not the
 * DOM ones, but a caller importing `DetailsProps` from `@hozo/core` should
 * get a type on both platforms rather than one.
 */
export type DetailsProps = DetailsNativeProps
export type TimeProps = TimeNativeProps
