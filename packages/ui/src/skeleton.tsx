/**
 * A loading placeholder with a look, over `@hozo/semantics`' `Skeleton`.
 *
 * The semantic one owns what a skeleton is: hidden from assistive
 * technology, and still under reduced motion whatever animates it. This
 * file owns how one looks -- a raised surface that pulses -- and nothing
 * else, which is decision 007's split between a component that keeps a
 * promise and a look that does not have to.
 *
 * The pulse is a layer inside rather than a class beside the caller's.
 * The caller's `className` sizes the box and is merged at runtime, and a
 * runtime-merged class on React Native cannot carry an animation; the layer's
 * classes are written here, once, where the compiler sees them. It says
 * `motion-safe:` itself, because on React Native the skeleton's own guard is
 * for its own classes and this layer is a child.
 *
 * The region being loaded says that it is loading, not the placeholder:
 * put `aria-busy` on it until the content arrives.
 */

import { Skeleton, View } from '@hozo/core'

export interface HozoSkeletonProps {
  /** The placeholder's size and shape: `h-4 w-48`, `size-10 rounded-full`. */
  className?: string
}

const shape = 'relative overflow-hidden rounded-hozo-control'
const pulse = 'absolute inset-0 bg-hozo-surface-raised motion-safe:animate-pulse'

// Not named `Skeleton` here: that is the semantic component this draws.
function StyledSkeleton({ className }: HozoSkeletonProps) {
  return (
    <Skeleton className={className ? `${shape} ${className}` : shape}>
      <View className={pulse} />
    </Skeleton>
  )
}

export { StyledSkeleton as HozoSkeleton }
