// Container queries on React Native, which has none.
//
// The width a container query asks about is the one thing the runtime
// cannot already know. A window has one width and `useHozoViewport`
// reports it; a container's width is whatever layout gave that particular
// element, so the element has to measure itself and say.
//
// Two pieces, and the split is forced by React rather than chosen. A
// component cannot read a context it renders the provider for, so the
// element that *is* the container and the element that *queries* it
// cannot be hooks in the same function body. `HozoContainer` provides;
// `HozoContainerQuery` consumes through a render prop, which is the same
// shape `group-…:` already borrows from Pressable's `style` callback.
//
// `HozoContainerQuery` renders no element of its own. It exists to put a
// component boundary between the provider and the read, and adding a View
// to do that would change the layout the query is measuring.

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { View, type LayoutChangeEvent, type ViewProps } from 'react-native'

/**
 * Container widths in scope, by name.
 *
 * The empty key is the nearest container whatever it is called, which is
 * what an unnamed `@sm:` asks about. A named container registers under
 * both, so `@sm:` inside `@container/main` reads the same width as
 * `@sm/main:`.
 *
 * `undefined` for a name means no container in scope answers to it --
 * distinct from a container that measured zero, and the distinction is
 * load-bearing. CSS says a query with no container matches nothing, in
 * *either* direction, so `@max-md:` must not fire just because there is
 * no width to compare.
 */
export type HozoContainerWidths = Readonly<Record<string, number | undefined>>

const HozoContainerContext = createContext<HozoContainerWidths>({})

export interface HozoContainerProps extends ViewProps {
  /** `@container/main` -- the name `@sm/main:` addresses. */
  hozoContainerName?: string
  children?: ReactNode
}

/**
 * A View that measures itself and hands its width to its subtree.
 *
 * The compiler renders an element here instead of a View when its classes
 * declared it a container.
 */
export function HozoContainer({
  hozoContainerName,
  onLayout,
  children,
  ...rest
}: HozoContainerProps): ReactNode {
  const [width, setWidth] = useState<number | undefined>(undefined)
  const outer = useContext(HozoContainerContext)

  const widths = useMemo(
    () => ({
      ...outer,
      '': width,
      ...(hozoContainerName ? { [hozoContainerName]: width } : {}),
    }),
    [outer, width, hozoContainerName],
  )

  // The author's own `onLayout` still runs. Taking the prop and dropping
  // it would be the quiet kind of breakage this compiler exists to avoid.
  const measure = (event: LayoutChangeEvent) => {
    const measured = event.nativeEvent.layout.width
    setWidth((current) => (current === measured ? current : measured))
    onLayout?.(event)
  }

  return (
    <View {...rest} onLayout={measure}>
      <HozoContainerContext.Provider value={widths}>{children}</HozoContainerContext.Provider>
    </View>
  )
}

/**
 * Hands the widths in scope to the element that queries them.
 *
 * A render prop rather than a hook, because the querying element is
 * usually in the same component as the container and a hook there would
 * read the context from *outside* the provider. This puts a component
 * boundary in the way, and renders nothing else.
 */
export function HozoContainerQuery({
  children,
}: {
  children: (widths: HozoContainerWidths) => ReactNode
}): ReactNode {
  return children(useContext(HozoContainerContext))
}
