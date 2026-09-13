import { createTanStackNavigationPrimitives } from '@hozo/navigation/tanstack-router/typed'

import { getRouter } from './router'

const Typed = createTanStackNavigationPrimitives(getRouter())

export const validTypedDestination = <Typed.Link href={{ to: '/' }}>Home</Typed.Link>

export const validDynamicDestination = (
  <Typed.Button href={{ to: '/posts/$postId', params: { postId: '42' } }}>Post</Typed.Button>
)

export const missingDynamicParameter = (
  // @ts-expect-error — the dynamic route requires postId.
  <Typed.Link href={{ to: '/posts/$postId' }}>Post without an id</Typed.Link>
)

// @ts-expect-error — this route is not present in routeTree.gen.ts.
export const misspelledTypedDestination = <Typed.Link href={{ to: '/missing' }}>Missing</Typed.Link>
