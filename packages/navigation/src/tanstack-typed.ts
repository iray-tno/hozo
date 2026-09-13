import type { ButtonProps, LinkProps, PressableProps } from '@hozo/core'
import type { AnyRouter, ValidateNavigateOptions } from '@tanstack/react-router'
import type { ReactElement } from 'react'

import { createTypedNavigationPrimitives, type UntypedHref } from './typed.ts'

type External<Base> = Omit<Base, 'external' | 'href'> & { href: string; external: true }
type Action<Base> = Omit<Base, 'external' | 'href'> & { href?: undefined; external?: never }
type Internal<Base, Router extends AnyRouter, Options> = Omit<Base, 'external' | 'href'> & {
  href: ValidateNavigateOptions<Router, Options> | UntypedHref
  external?: false | undefined
}

export interface TanStackTypedNavigationPrimitives<Router extends AnyRouter> {
  Link: {
    <const Options>(props: Internal<LinkProps, Router, Options>): ReactElement | null
    (props: External<LinkProps>): ReactElement | null
  }
  Button: {
    <const Options>(props: Internal<ButtonProps, Router, Options>): ReactElement | null
    (props: Action<ButtonProps>): ReactElement | null
    (props: External<ButtonProps>): ReactElement | null
  }
  Pressable: {
    <const Options>(props: Internal<PressableProps, Router, Options>): ReactElement | null
    (props: Action<PressableProps>): ReactElement | null
    (props: External<PressableProps>): ReactElement | null
  }
}

/** Uses TanStack's own route validator and URL builder; Hozo owns neither route graph. */
export function createTanStackNavigationPrimitives<Router extends AnyRouter>(
  router: Router,
): TanStackTypedNavigationPrimitives<Router> {
  return createTypedNavigationPrimitives<unknown>({
    resolveHref: (destination) => router.buildLocation(destination as never).href,
  }) as unknown as TanStackTypedNavigationPrimitives<Router>
}
