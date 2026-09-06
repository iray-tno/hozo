import type { ReactNode } from 'react'
import { Linking, Pressable, type PressableProps, Text } from 'react-native'

export interface HozoLinkProps extends Omit<PressableProps, 'onPress'> {
  href: string
  onPress?: PressableProps['onPress']
  children?: ReactNode
}

/**
 * Native semantic link with the same destination-bearing API as `<a>`.
 *
 * `accessibilityRole` is a default rather than a constant. It used to be
 * written after the spread, so a caller's value was overwritten and the
 * one caller that has a value is the compiler: `<Button href>` lowers to
 * `<HozoLink accessibilityRole="button">` on both backends, and a button
 * that navigates announced itself as a link on this platform only. The
 * Web half honours the same prop, and its comment already said this was
 * the case it existed for.
 *
 * The Native backend's own test asserted on the emitted string, where the
 * attribute is present, so nothing noticed for as long as the two halves
 * disagreed. `link-role.test.ts` renders instead.
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
  onPress,
  children,
  accessibilityRole = 'link',
  ...props
}: HozoLinkProps) {
  return (
    <Pressable
      {...props}
      accessibilityRole={accessibilityRole}
      onPress={(event) => {
        onPress?.(event)
        if (!event.defaultPrevented) void Linking.openURL(href)
      }}
    >
      {typeof children === 'string' ? <Text>{children}</Text> : children}
    </Pressable>
  )
}
