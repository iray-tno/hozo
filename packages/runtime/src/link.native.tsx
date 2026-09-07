import { hozoTextChildren } from '@hozo/behaviors'
import type { ReactNode } from 'react'
import { Linking, Pressable, type PressableProps } from 'react-native'
import { activateHozoNavigation } from './navigation.ts'
import { useHozoNavigation } from './navigation-context.tsx'

export interface HozoLinkProps extends Omit<PressableProps, 'onPress'> {
  href: string
  external?: boolean
  replace?: boolean
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
 * Only a lone string, which is the case that occurs: a label. A mixed
 * array is left alone rather than guessed at, since wrapping the lot
 * would put whatever else is in there inside a `Text`.
 */
export function HozoLink({
  href,
  external,
  replace,
  onPress,
  children,
  accessibilityRole = 'link',
  ...props
}: HozoLinkProps) {
  const navigation = useHozoNavigation()
  return (
    <Pressable
      {...props}
      accessibilityRole={accessibilityRole}
      onPress={(event) => {
        onPress?.(event)
        if (!event.defaultPrevented) {
          void activateHozoNavigation(navigation, { href, external, replace }, Linking.openURL)
        }
      }}
    >
      {typeof children === 'function' ? children : hozoTextChildren(children as ReactNode)}
    </Pressable>
  )
}
