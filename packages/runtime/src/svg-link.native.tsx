import { type ComponentProps, type ReactNode, useRef } from 'react'
import { type GestureResponderEvent, Linking } from 'react-native'
import { G } from 'react-native-svg'
import { activateHozoNavigation, prefetchHozoNavigation } from './navigation.ts'
import { useHozoNavigation } from './navigation-context.tsx'

export interface SvgLinkProps extends Omit<ComponentProps<typeof G>, 'children' | 'onPress'> {
  href: string
  children?: ReactNode
  onPress?: (event: GestureResponderEvent) => void
  external?: boolean
  replace?: boolean
  prefetch?: boolean
}

/** Router-aware destination group for react-native-svg, which has no anchor element. */
export function SvgLink({
  href,
  children,
  onPress,
  onPressIn,
  external,
  replace,
  prefetch,
  disabled,
  accessibilityLabel,
  ...props
}: SvgLinkProps) {
  const navigation = useHozoNavigation()
  const prefetchedHref = useRef<string | null>(null)
  return (
    <G
      {...props}
      accessible={accessibilityLabel !== undefined}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPressIn={(event) => {
        onPressIn?.(event)
        if (prefetch && !disabled && prefetchedHref.current !== href) {
          prefetchedHref.current = href
          prefetchHozoNavigation(navigation, { href, external, replace })
        }
      }}
      onPress={(event) => {
        onPress?.(event)
        if (!event.defaultPrevented) {
          void activateHozoNavigation(navigation, { href, external, replace }, Linking.openURL)
        }
      }}
    >
      {children}
    </G>
  )
}
