import type { MouseEventHandler, ReactNode, SVGProps } from 'react'
import { createElement } from 'react'

import { externalLinkAttributes } from './link.ts'

export interface SvgLinkProps
  extends Omit<SVGProps<SVGAElement>, 'children' | 'href' | 'onClick' | 'rel' | 'target'> {
  href: string
  children?: ReactNode
  onPress?: MouseEventHandler<SVGAElement>
  external?: boolean
  replace?: boolean
  prefetch?: boolean
  target?: string
  rel?: string
}

/** A semantic SVG anchor for the uncompiled Web fallback path. */
export function SvgLink({
  href,
  children,
  onPress,
  external,
  replace,
  prefetch,
  target,
  rel,
  ...props
}: SvgLinkProps) {
  const destination = externalLinkAttributes(external, target, rel)
  return createElement(
    'a',
    {
      ...props,
      href,
      target: destination.target,
      rel: destination.rel,
      'data-hozo-navigation-replace': replace ? '' : undefined,
      'data-hozo-navigation-prefetch': prefetch ? '' : undefined,
      onClick: onPress,
    },
    children,
  )
}
