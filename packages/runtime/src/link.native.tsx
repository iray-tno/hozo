import type { ReactNode } from 'react'
import { Linking, Pressable, type PressableProps } from 'react-native'

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
      {children}
    </Pressable>
  )
}
