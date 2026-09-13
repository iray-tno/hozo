import { createExpoRouterNavigationPrimitives } from '@hozo/navigation/expo-router/typed'
import { untypedHref } from '@hozo/navigation/typed'
import { Link as ExpoLink, type Href } from 'expo-router'

const Typed = createExpoRouterNavigationPrimitives<Href>(ExpoLink.resolveHref)

// @ts-expect-error — verify the checked-in Expo-generated Href union itself is narrow.
export const invalidGeneratedHref: Href = '/missing'

export const validTypedDestination = <Typed.Link href="/details">Details</Typed.Link>
export const validDynamicDestination = (
  <Typed.Button href={{ pathname: '/posts/[postId]', params: { postId: '42' } }}>Post</Typed.Button>
)

export const missingDynamicParameter = (
  // @ts-expect-error — Expo's generated route requires postId.
  <Typed.Link href={{ pathname: '/posts/[postId]' }}>Post</Typed.Link>
)

// @ts-expect-error — this route is not present in the Expo app directory.
export const misspelledTypedDestination = <Typed.Link href="/missing">Missing</Typed.Link>

export const explicitExternalDestination = (
  <Typed.Link href="https://example.com/docs" external>
    External docs
  </Typed.Link>
)

export const implicitExternalDestination = (
  // @ts-expect-error — an external destination must opt out of application routing explicitly.
  <Typed.Link href="https://example.com/docs">Docs</Typed.Link>
)

export const explicitComputedDestination = (
  <Typed.Pressable href={untypedHref(`/accounts/${Date.now()}`)}>Computed</Typed.Pressable>
)
