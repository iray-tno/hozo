import { hozoTextChildren } from '@hozo/behaviors'
import {
  activateHozoNavigation,
  prefetchHozoNavigation,
  useHozoNavigation,
} from '@hozo/engine/navigation'
import { type ComponentPropsWithRef, type ElementType, type ReactNode, useRef } from 'react'
import { Linking, Pressable, type PressableProps } from 'react-native'
import type { HozoPressable } from './pressable.native.tsx'

type LinkHost = typeof Pressable | typeof HozoPressable

export type HozoLinkProps<Host extends LinkHost = typeof Pressable> =
  ComponentPropsWithRef<Host> & {
    /** Compiler-only host selection; ordinary links retain RN's cheap path. */
    hozoLinkComponent?: Host
    href: string
    external?: boolean
    replace?: boolean
    prefetch?: boolean
    onPress?: PressableProps['onPress']
    children?: PressableProps['children']
  }

/**
 * Native semantic link with the same destination-bearing API as `<a>`.
 *
 * `accessibilityRole` is a default rather than a constant, so an author
 * building a deliberately custom widget can override it. Hozo's own
 * destination-bearing primitives do not: a component that follows an
 * `href` is announced as a link even when `Button` supplies its visual
 * treatment.
 *
 * A string child is wrapped, because `Pressable` is a View and React
 * Native throws on a bare string inside one. The compiler already wraps
 * text children -- `<Link href>Docs</Link>` lowers to
 * `<HozoLink><Text>Docs</Text></HozoLink>` -- so this is for the
 * uncompiled path, where `@hozo/core`'s `Button` and
 * `@hozo/typography`'s `Link` hand their children straight through.
 * `Link` carried its own copy of exactly this and is why it existed
 * separately at all; it delegates here now.
 *
 * Normalization wraps text runs, not whole arrays: embedded controls remain
 * controls. Function children are still evaluated by React Native itself.
 *
 * State variants select HozoPressable without duplicating its event machine
 * or navigation. The type-only import keeps that machinery out of ordinary
 * links' Metro graph, where unused static imports would still cost modules.
 */
export function HozoLink<Host extends LinkHost = typeof Pressable>({
  hozoLinkComponent,
  href,
  external,
  replace,
  prefetch,
  onPress,
  onPressIn,
  disabled,
  children,
  accessibilityRole = 'link',
  ...props
}: HozoLinkProps<Host>) {
  const Component: ElementType = hozoLinkComponent ?? Pressable
  const navigation = useHozoNavigation()
  const prefetchedHref = useRef<string | null>(null)
  return (
    <Component
      {...props}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      onPressIn={(event: Parameters<NonNullable<PressableProps['onPressIn']>>[0]) => {
        onPressIn?.(event)
        if (prefetch && !disabled && prefetchedHref.current !== href) {
          prefetchedHref.current = href
          prefetchHozoNavigation(navigation, { href, external, replace })
        }
      }}
      onPress={(event: Parameters<NonNullable<PressableProps['onPress']>>[0]) => {
        onPress?.(event)
        if (!event.defaultPrevented) {
          void activateHozoNavigation(navigation, { href, external, replace }, Linking.openURL)
        }
      }}
    >
      {typeof children === 'function' ? children : hozoTextChildren(children as ReactNode)}
    </Component>
  )
}
