// The Web half of the link, which the browser already is.
//
// `<a href>` navigates, is in the tab order, and announces itself as a
// link without being asked, so the Web backend lowers straight to the
// element and nothing here is on the compiled path.
//
// It exists for the reason `disclosure.tsx` and `ruby.tsx` do: a package
// resolves this one's types through the Web entry whichever platform it
// builds for, so a component the Native backend emits has to be nameable
// here or `@hozo/core` cannot import it.

// `createElement` rather than JSX, and the file is `.ts`: this package
// runs its tests as `node --test src/*.test.ts`, straight through Node's
// type stripping, which has no JSX transform. A `.tsx` reached from the
// Web entry fails the whole file with ERR_UNKNOWN_FILE_EXTENSION -- Node
// does not recognise the extension at all. The native halves here are
// `.tsx` and are never imported by a test that runs this way.

import type { CSSProperties, MouseEventHandler, ReactNode } from 'react'
import { createElement } from 'react'

export interface HozoLinkProps {
  href: string
  children?: ReactNode
  onPress?: MouseEventHandler<HTMLAnchorElement>
  className?: string
  style?: CSSProperties
  testID?: string
  accessibilityLabel?: string
  accessibilityHint?: string
  accessibilityRole?: string
  disabled?: boolean
}

export function HozoLink({
  href,
  children,
  onPress,
  className,
  style,
  testID,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole,
  disabled,
}: HozoLinkProps) {
  return createElement(
    'a',
    {
      href,
      className,
      style,
      'data-testid': testID,
      // Only when asked for: an `<a href>` is already a link, and saying
      // so again is noise in the accessibility tree. `Button` asks for
      // `button`, which is the case this is here for.
      role: accessibilityRole,
      'aria-label': accessibilityLabel,
      'aria-description': accessibilityHint,
      // There is no `disabled` on an anchor. The pair below is what a
      // disabled link is: announced as unavailable, and not followed.
      'aria-disabled': disabled ? true : undefined,
      onClick: disabled
        ? (event: React.MouseEvent<HTMLAnchorElement>) => {
            event.preventDefault()
          }
        : onPress,
    },
    children,
  )
}
