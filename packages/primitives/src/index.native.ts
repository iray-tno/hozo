import { createElement, forwardRef, type ReactElement, type Ref, useMemo } from 'react'
import * as ReactNative from 'react-native'

export * from './foundation.native.tsx'

export type { HozoFlatListLayout, HozoFlatListRenderInfo, HozoScrollEvent } from './index.ts'

export type HozoScrollViewProps = ReactNative.ScrollViewProps
export type HozoFlatListProps<T> = ReactNative.FlatListProps<T>
export type HozoFlatListHandle<T = unknown> = ReactNative.FlatList<T>
export type HozoRefreshControlProps = ReactNative.RefreshControlProps

export const HozoScrollView = ReactNative.ScrollView
export const HozoRefreshControl = ReactNative.RefreshControl

/**
 * What Android's accessibility framework calls a collection.
 *
 * `AccessibilityNodeInfo.setCollectionInfo`, which is how TalkBack knows a
 * scrolling view is a list of a certain length rather than a box with
 * things in it.
 *
 * Typed here because React Native does not type it. The props are real --
 * `BaseViewConfig.android.js` registers `accessibilityCollection` and
 * `accessibilityCollectionItem` as native props, `BaseViewManager` stores
 * them as tags, and `ReactScrollViewAccessibilityDelegate` reads them back
 * and even works out which children are on screen -- but they appear in no
 * `.d.ts` and in no documentation, so nothing that does not go looking for
 * them will find them.
 */
interface AndroidCollection {
  itemCount: number
  rowCount: number
  columnCount: number
  hierarchical: boolean
}

interface AndroidCollectionItem {
  rowIndex: number
  columnIndex: number
  rowSpan: number
  columnSpan: number
  heading: boolean
}

/**
 * Android only, and that is not a preference.
 *
 * `BaseViewConfig.ios.js` registers neither prop and `React/Views` has no
 * implementation of either, so there is nothing on iOS to send them to.
 * VoiceOver is told how long a React Native list is by nothing at all --
 * which needs either a `UIAccessibilityContainer` shim in native code
 * (#353) or React Native to grow the prop.
 *
 * Read where it is used rather than once at module scope. A module-scope
 * read runs on import, so a `react-native` that does not expose `Platform`
 * -- the conformance stub, until this needed it -- fails to load the file
 * at all rather than answering one question wrongly.
 */
function isAndroid(): boolean {
  return ReactNative.Platform?.OS === 'android'
}

/**
 * A cell that says where it sits in the collection.
 *
 * `CellRendererComponent` is React Native's own extension point for this,
 * so the information goes on the view the list already wraps each item in
 * rather than on a second one nested inside it -- no extra level, and no
 * change to the layout.
 *
 * The handlers are forwarded because `VirtualizedList` needs them: it
 * learns a cell's size from `onLayout` and follows focus with
 * `onFocusCapture`, and a cell renderer that swallowed either would break
 * the list to describe it.
 */
function collectionCell(columns: number) {
  return function HozoCollectionCell({
    children,
    index,
    onFocusCapture,
    onLayout,
    style,
  }: {
    children?: unknown
    index: number
    onFocusCapture?: (event: unknown) => void
    onLayout?: (event: unknown) => void
    style?: unknown
  }) {
    const item: AndroidCollectionItem = {
      rowIndex: Math.floor(index / columns),
      columnIndex: index % columns,
      rowSpan: 1,
      columnSpan: 1,
      heading: false,
    }
    return createElement(
      ReactNative.View as unknown as never,
      {
        style,
        onLayout,
        onFocusCapture,
        accessibilityCollectionItem: item,
      } as never,
      children as never,
    )
  }
}

function HozoFlatListInner<T>(
  props: HozoFlatListProps<T>,
  forwardedRef: Ref<ReactNative.FlatList<T>>,
): ReactElement {
  const { data, numColumns, CellRendererComponent, ...rest } = props
  const android = isAndroid()
  const columns = Math.max(1, Math.floor(numColumns ?? 1))
  const count = data?.length ?? 0

  // A component identity that only changes when the column count does. A
  // fresh one every render would remount every cell in the list.
  const cell = useMemo(() => collectionCell(columns), [columns])

  const collection: AndroidCollection | undefined = android
    ? {
        itemCount: count,
        rowCount: Math.ceil(count / columns),
        columnCount: columns,
        hierarchical: false,
      }
    : undefined

  return createElement(
    ReactNative.FlatList as unknown as never,
    {
      ...rest,
      data,
      numColumns,
      ref: forwardedRef,
      accessibilityCollection: collection,
      // The caller's own cell renderer wins. Composing would put one view
      // inside another and hand the outer one the handlers the inner one
      // needs; deferring means the list still reports its length, and only
      // the per-item position is left unsaid.
      CellRendererComponent:
        CellRendererComponent ?? (android ? (cell as unknown as never) : undefined),
    } as never,
  )
}

/**
 * React Native's `FlatList`, told how long it is.
 *
 * A windowed list has a length its accessibility tree does not: only the
 * rows near the viewport exist as views, so TalkBack counts those and
 * announces them. On the Web the answer is `aria-setsize`; here it is
 * `accessibilityCollection`, and neither is something an app should have to
 * write itself when the list already knows.
 */
export const HozoFlatList = forwardRef(HozoFlatListInner) as <T>(
  props: HozoFlatListProps<T> & { ref?: Ref<ReactNative.FlatList<T>> },
) => ReactElement

export type { HozoFlatListRenderInfo as FlatListRenderInfo } from './index.ts'
export { HozoFlatList as FlatList, HozoScrollView as ScrollView }
export type FlatListProps<T> = HozoFlatListProps<T>
export type ScrollViewProps = HozoScrollViewProps
