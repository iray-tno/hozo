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

export function Fieldset({ role = 'group', ...props }: SemanticsNativeProps) {
  return React.createElement('View', { role, ...props })
}

export function Legend({ style, ...props }: SemanticsNativeProps) {
  return React.createElement('Text', { style: [{ fontWeight: 'bold' }, style], ...props })
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
    React.createElement('View', props, children),
  )
}

export function Summary({ children, ...props }: SemanticsNativeProps) {
  const { open, toggle } = React.useContext(DetailsContext)
  return React.createElement(
    'Pressable',
    {
      accessibilityRole: 'button',
      accessibilityState: { expanded: open },
      onPress: toggle,
      ...props,
    },
    children,
  )
}

export function Term({ style, ...props }: SemanticsNativeProps) {
  return React.createElement('Text', { style: [{ fontWeight: 'bold' }, style], ...props })
}

export function Description(props: SemanticsNativeProps) {
  return React.createElement('View', props)
}

export function TermList({ role = 'list', ...props }: SemanticsNativeProps) {
  return React.createElement('View', { role, ...props })
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
  return React.createElement('View', {
    role,
    accessibilityRole: decorative ? 'none' : 'separator',
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
    'View',
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
