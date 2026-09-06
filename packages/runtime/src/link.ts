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
//
// It is also the one anchor Hozo renders when it is the one rendering.
// `@hozo/core`'s `Button` and `@hozo/typography`'s `Link` had a hand-written
// `<a>` each, and both carried their own copy of the rule below -- the
// one that turns `external` into `target="_blank"` and a `rel` that
// stops the opened page reaching back through `window.opener`. A rule
// with two implementations is a rule that will be changed in one of
// them; these are the uncompiled fallbacks, so a divergence would show
// up only in the projects Hozo could not lower, which are the ones least
// likely to be looked at.

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
  nativeID?: string
  accessibilityLabel?: string
  accessibilityHint?: string
  accessibilityRole?: string
  disabled?: boolean
  /** Leaves the app: `_blank` and a `rel` that severs `window.opener`. */
  external?: boolean
  target?: '_blank' | '_self' | '_parent' | '_top' | string
  rel?: string
  download?: boolean | string
  'aria-hidden'?: boolean
}

/**
 * `target` and `rel` for a destination, given what the author asked for.
 *
 * `external` is the shorthand, and `target="_blank"` written out by hand
 * gets the same `rel`, because the risk is a property of the new browsing
 * context rather than of the spelling. An explicit `rel` always wins: an
 * author who has written one has thought about it.
 */
export function externalLinkAttributes(
  external: boolean | undefined,
  target: string | undefined,
  rel: string | undefined,
): { target: string | undefined; rel: string | undefined } {
  const finalTarget = external ? '_blank' : target
  return {
    target: finalTarget,
    rel: external || target === '_blank' ? (rel ?? 'noreferrer noopener') : rel,
  }
}

export function HozoLink({
  href,
  children,
  onPress,
  className,
  style,
  testID,
  nativeID,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole,
  disabled,
  external,
  target,
  rel,
  download,
  'aria-hidden': ariaHidden,
}: HozoLinkProps) {
  const destination = externalLinkAttributes(external, target, rel)
  return createElement(
    'a',
    {
      href,
      target: destination.target,
      rel: destination.rel,
      download,
      className,
      style,
      'data-testid': testID,
      id: nativeID,
      // Only when asked for: an `<a href>` is already a link, and saying
      // so again is noise in the accessibility tree. `Button` asks for
      // `button`, which is the case this is here for.
      role: accessibilityRole,
      'aria-label': accessibilityLabel,
      'aria-description': accessibilityHint,
      'aria-hidden': ariaHidden,
      // There is no `disabled` on an anchor. The pair below is what a
      // disabled link is: announced as unavailable, and not followed.
      'aria-disabled': disabled ? true : undefined,
      // `disabled:` compiles to `[data-hozo-disabled]` rather than to
      // `:disabled`, which matches form controls only. Without the
      // attribute the utility silently stops matching on this element
      // while it matches everywhere else.
      'data-hozo-disabled': disabled ? '' : undefined,
      onClick: disabled
        ? (event: React.MouseEvent<HTMLAnchorElement>) => {
            event.preventDefault()
          }
        : onPress,
    },
    children,
  )
}
