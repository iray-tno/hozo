import {
  type ButtonProps,
  Button as CoreButton,
  Link as CoreLink,
  Pressable as CorePressable,
  type LinkProps,
  type PressableProps,
} from '@hozo/core'
import { createElement, type ReactElement } from 'react'

declare const untypedHrefBrand: unique symbol

/** An explicit escape hatch for an application-computed internal URL. */
export type UntypedHref = string & { readonly [untypedHrefBrand]: true }

export function untypedHref(href: string): UntypedHref {
  return href as UntypedHref
}

type ExternalHref = `${string}:${string}` | `//${string}`
type InternalDestination<Destination> = Destination extends ExternalHref ? never : Destination

type RequiredDestination<Base, Destination> = Omit<Base, 'external' | 'href'> &
  (
    | { href: InternalDestination<Destination> | UntypedHref; external?: false | undefined }
    | { href: string; external: true }
  )

type OptionalDestination<Base, Destination> = Omit<Base, 'external' | 'href'> &
  (
    | { href?: undefined; external?: never }
    | { href: InternalDestination<Destination> | UntypedHref; external?: false | undefined }
    | { href: string; external: true }
  )

export type TypedLinkProps<Destination> = RequiredDestination<LinkProps, Destination>
export type TypedButtonProps<Destination> = OptionalDestination<ButtonProps, Destination>
export type TypedPressableProps<Destination> = OptionalDestination<PressableProps, Destination>

export interface TypedNavigationPrimitives<Destination> {
  Link(props: TypedLinkProps<Destination>): ReactElement | null
  Button(props: TypedButtonProps<Destination>): ReactElement | null
  Pressable(props: TypedPressableProps<Destination>): ReactElement | null
}

export interface TypedNavigationOptions<Destination> {
  /** Turns a router-owned object destination into the real URL used by the anchor. */
  resolveHref?: (destination: Destination) => string
}

function resolvedHref<Destination>(
  destination: Destination | UntypedHref | string,
  resolve: ((destination: Destination) => string) | undefined,
) {
  if (typeof destination === 'string') return destination
  if (resolve) return resolve(destination as Destination)
  throw new TypeError(
    '[hozo] A typed object destination needs resolveHref so Hozo can retain a real anchor URL.',
  )
}

/**
 * Narrows the three destination-bearing Hozo primitives without changing
 * their router-independent runtime contract.
 */
export function createTypedNavigationPrimitives<Destination = string>(
  options: TypedNavigationOptions<Destination> = {},
): TypedNavigationPrimitives<Destination> {
  const Link = (props: TypedLinkProps<Destination>) =>
    createElement(CoreLink, {
      ...props,
      href: resolvedHref(props.href, options.resolveHref),
    } as LinkProps)

  const Button = (props: TypedButtonProps<Destination>) =>
    createElement(CoreButton, {
      ...props,
      href: props.href === undefined ? undefined : resolvedHref(props.href, options.resolveHref),
    } as ButtonProps)

  const Pressable = (props: TypedPressableProps<Destination>) =>
    createElement(CorePressable, {
      ...props,
      href: props.href === undefined ? undefined : resolvedHref(props.href, options.resolveHref),
    } as PressableProps)

  return { Link, Button, Pressable }
}
