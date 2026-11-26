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

import {
  type ComponentPropsWithRef,
  createContext,
  type ElementType,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from 'react'
import { type LayoutChangeEvent, View } from 'react-native'

import { keepIfSettled } from './runtime-measured.ts'

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

/** Both axes of a measured `@container` box, for `cqw`/`cqh`/`cqmin`/`cqmax` units. */
export interface HozoContainerSize {
  readonly width?: number
  readonly height?: number
}

export type HozoContainerSizes = Readonly<Record<string, HozoContainerSize | undefined>>

const HozoContainerContext = createContext<HozoContainerWidths>({})
const HozoContainerSizeContext = createContext<HozoContainerSizes>({})

export type HozoContainerProps<Host extends ElementType = typeof View> =
  ComponentPropsWithRef<Host> & {
    /** Compiler-selected host: measurement must not turn a control into a View. */
    hozoContainerComponent?: Host
    /** `@container/main` -- the name `@sm/main:` addresses. */
    hozoContainerName?: string
  }

/**
 * Measures the existing host and hands its width (and height for container
 * length units) to its subtree.
 *
 * A provider adds no layout node. The host keeps its own style/children
 * callbacks, refs and events rather than asking a replacement View to
 * approximate them. An ordinary container still defaults to View.
 */
export function HozoContainer<Host extends ElementType = typeof View>({
  hozoContainerComponent,
  hozoContainerName,
  onLayout,
  children,
  ...rest
}: HozoContainerProps<Host>): ReactNode {
  const Component: ElementType = hozoContainerComponent ?? View
  const [size, setSize] = useState<HozoContainerSize>({})
  const outerWidths = useContext(HozoContainerContext)
  const outerSizes = useContext(HozoContainerSizeContext)

  const widths = useMemo(
    () => ({
      ...outerWidths,
      '': size.width,
      ...(hozoContainerName ? { [hozoContainerName]: size.width } : {}),
    }),
    [outerWidths, size.width, hozoContainerName],
  )

  const sizes = useMemo(
    () => ({
      ...outerSizes,
      '': size,
      ...(hozoContainerName ? { [hozoContainerName]: size } : {}),
    }),
    [outerSizes, size, hozoContainerName],
  )

  // The author's own `onLayout` still runs. Taking the prop and dropping
  // it would be the quiet kind of breakage this compiler exists to avoid.
  const measure = (event: LayoutChangeEvent) => {
    const measuredW = event.nativeEvent.layout.width
    const measuredH = event.nativeEvent.layout.height
    // A tolerance rather than `===`, for the reason `measured.ts` gives.
    // This one has not been seen looping, and it is the same shape as the
    // one that was: a stored size, a render that depends on it, and a
    // float coming back from Yoga.
    setSize((current) => {
      const nextW =
        typeof measuredW === 'number' && Number.isFinite(measuredW)
          ? keepIfSettled(current.width, measuredW)
          : current.width
      const nextH =
        typeof measuredH === 'number' && Number.isFinite(measuredH)
          ? keepIfSettled(current.height, measuredH)
          : current.height
      if (nextW === current.width && nextH === current.height) return current
      return { width: nextW, height: nextH }
    })
    onLayout?.(event)
  }

  return (
    <HozoContainerSizeContext.Provider value={sizes}>
      <HozoContainerContext.Provider value={widths}>
        <Component {...rest} onLayout={measure}>
          {children}
        </Component>
      </HozoContainerContext.Provider>
    </HozoContainerSizeContext.Provider>
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

/**
 * Hands the measured `{ width, height }` container sizes in scope to an
 * element using `cqw`/`cqh`/`cqi`/`cqb`/`cqmin`/`cqmax` units.
 */
export function HozoContainerSizeQuery({
  children,
}: {
  children: (sizes: HozoContainerSizes) => ReactNode
}): ReactNode {
  return children(useContext(HozoContainerSizeContext))
}
