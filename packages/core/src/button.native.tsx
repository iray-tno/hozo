import type { ReactNode } from 'react'
import { Linking, Pressable, type PressableProps, Text } from 'react-native'

export interface ButtonProps extends Omit<PressableProps, 'accessibilityRole' | 'children'> {
  /** Consumed by Hozo before this fallback renders. */
  className?: string
  children?: ReactNode
  href?: string
  external?: boolean
  /** Web-only navigation metadata; retained in the universal type surface. */
  target?: '_blank' | '_self' | '_parent' | '_top' | string
  rel?: string
  download?: boolean | string
}

/**
 * The Native half of the universal Button contract.
 *
 * A button that performs an action is React Native's Pressable. A button
 * that names a destination follows the same Pressable + Linking contract as
 * the HozoLink emitted by the compiler. The navigation package will replace
 * that shared activation policy through the runtime adapter boundary; core
 * itself must not depend on a router package.
 *
 * `target`, `rel`, and `download` describe browser behavior. They are
 * deliberately consumed here instead of being forwarded as unknown native
 * props. `external` is kept in the public contract for the navigation layer;
 * until an adapter is installed every href follows the existing Linking
 * fallback, so internal and external destinations behave the same.
 */
export function Button({
  className: _className,
  children,
  href,
  external: _external,
  target: _target,
  rel: _rel,
  download: _download,
  onPress,
  ...props
}: ButtonProps) {
  // React Native does not allow a raw text node beneath a View-backed
  // Pressable. The Web fallback can render one directly, so bridge that
  // otherwise surprising platform difference here.
  const content =
    typeof children === 'string' || typeof children === 'number' ? (
      <Text>{children}</Text>
    ) : (
      children
    )

  if (href != null) {
    return (
      <Pressable
        {...props}
        accessibilityRole="button"
        onPress={(event) => {
          onPress?.(event)
          if (!event.defaultPrevented) void Linking.openURL(href)
        }}
      >
        {content}
      </Pressable>
    )
  }

  return (
    <Pressable {...props} accessibilityRole="button" onPress={onPress}>
      {content}
    </Pressable>
  )
}
