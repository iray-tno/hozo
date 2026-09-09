// A disclosure, which React Native has no element for.
//
// On the Web `<details>` is the whole feature: the browser opens and
// closes it, hides everything but the `<summary>` while closed, and puts
// the expanded state in the accessibility tree without being asked. So
// the Web backend lowers to the element and there is nothing here for it.
//
// React Native has none of that. The compiled output used to be a `View`
// holding a `Pressable` with a button role and then the body, always --
// no toggle on the button, and the body visible whether it was open or
// not. A disclosure that cannot close is not a disclosure, and a button
// that never says `expanded` tells a screen reader nothing about what it
// does.
//
// The pair here is what the compiler emits instead, for the reason it
// emits `HozoDialog`: the behaviour is React's, not the compiler's.

import {
  Children,
  createContext,
  isValidElement,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from 'react'
import { Pressable, type StyleProp, View, type ViewStyle } from 'react-native'
import { hozoTextChildren } from './text-child.native.tsx'

interface DisclosureState {
  open: boolean
  toggle: () => void
}

const DisclosureContext = createContext<DisclosureState>({
  open: false,
  toggle: () => undefined,
})

export interface HozoDetailsProps {
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
  children?: ReactNode
  /** Controlled. Without it the disclosure keeps its own state. */
  open?: boolean
  defaultOpen?: boolean
  onToggle?: (open: boolean) => void
  style?: StyleProp<ViewStyle>
  testID?: string
  accessibilityLabel?: string
}

export interface HozoSummaryProps {
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
  children?: ReactNode
  style?: StyleProp<ViewStyle>
  testID?: string
  accessibilityLabel?: string
}

/**
 * The trigger, and the only child that survives being closed.
 *
 * Declared before `HozoDetails` because that one compares against it by
 * identity to decide what to hide.
 */
export function HozoSummary({ children, ...props }: HozoSummaryProps) {
  const { open, toggle } = useContext(DisclosureContext)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      onPress={toggle}
      {...props}
    >
      {hozoTextChildren(children)}
    </Pressable>
  )
}

export function HozoDetails({
  children,
  open: controlled,
  defaultOpen = false,
  onToggle,
  ...props
}: HozoDetailsProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen)
  const open = controlled ?? uncontrolled
  const toggle = useCallback(() => {
    const next = !open
    setUncontrolled(next)
    onToggle?.(next)
  }, [open, onToggle])

  // Everything but the summary goes away while it is closed, which is what
  // the browser does with `<details>`. Recognised by identity rather than
  // by position: HTML requires the summary to be the first child and Hozo
  // does not check that, so a body written before it would otherwise be
  // the thing that stayed.
  const visible = Children.toArray(children).filter(
    (child) => open || (isValidElement(child) && child.type === HozoSummary),
  )

  return (
    <DisclosureContext.Provider value={{ open, toggle }}>
      <View {...props}>{hozoTextChildren(visible)}</View>
    </DisclosureContext.Provider>
  )
}
