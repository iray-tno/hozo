import { createElement, type ReactElement, type Ref, useMemo } from 'react'
import * as ReactNative from 'react-native'

// Its own module rather than part of the index, because the index starts
// with `export * from ./foundation.native.tsx`, and Metro does not
// tree-shake: a compiled screen that renders one list used to carry every
// primitive with it. `@hozo/primitives/generated/flat-list` imports this.

export type HozoFlatListProps<T> = ReactNative.FlatListProps<T>
export type HozoFlatListHandle<T = unknown> = ReactNative.FlatList<T>

/**
 * Where a cell sits in the collection Android thinks it is in.
 *
 * `AccessibilityNodeInfo.setCollectionItemInfo`, read by
 * `ReactAccessibilityDelegate.kt:107`.
 *
 * Typed here because React Native does not type it. The props are real --
 * `BaseViewConfig.android.js` registers `accessibilityCollection` and
 * `accessibilityCollectionItem` as native props and `BaseViewManager`
 * stores them as tags -- but they appear in no `.d.ts` and in no
 * documentation, so nothing that does not go looking for them will find
 * them. The tracking issue for the capability, facebook/react-native#30977,
 * is closed: the native half shipped and no React Native component was ever
 * wired to it.
 *
 * `AndroidCollection`, the list-level counterpart, was here too. It is gone
 * with the prop that used it; see the note in `HozoFlatList` for what it
 * held and why.
 */
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

/**
 * React Native's `FlatList`, with each cell told where it sits.
 *
 * It used to be told how long it was as well, which is the thing a windowed
 * list cannot say for itself: only the rows near the viewport exist as
 * views, so TalkBack counts those. On the Web the answer is `aria-setsize`.
 * Here it was `accessibilityCollection`, and it is not set any more -- the
 * note below the hooks says why, and what to put back.
 */
export function HozoFlatList<T>(
  props: HozoFlatListProps<T> & { ref?: Ref<ReactNative.FlatList<T>> },
): ReactElement {
  const { data, numColumns, CellRendererComponent, ref: forwardedRef, ...rest } = props
  const android = isAndroid()
  const columns = Math.max(1, Math.floor(numColumns ?? 1))

  // A component identity that only changes when the column count does. A
  // fresh one every render would remount every cell in the list.
  const cell = useMemo(() => collectionCell(columns), [columns])

  // `accessibilityCollection` is not set, and the list no longer says how
  // long it is. It used to, and a device heard it: "Button, In list Hozo
  // native acceptance screen, 3 items".
  //
  // It crashes the app (#512). React Native's own delegate reads the tag
  // this sets, then walks the content view's children reading each one's
  // `accessibility_collection_item`:
  //
  //   // ReactScrollViewAccessibilityDelegate.kt
  //   :56  view.getTag(R.id.accessibility_collection) as? ReadableMap ?: return
  //   :74  nextChild.getTag(R.id.accessibility_collection_item) as ReadableMap
  //   :88  nestedNextChild.getTag(R.id.accessibility_collection_item) as? ReadableMap
  //
  // Line 74 is the only one of the four reads in that file with a non-null
  // cast, two lines above a comment describing the null it forbids. Any
  // child without the tag throws `NullPointerException: null cannot be cast
  // to non-null type ReadableMap`, and in a release build that is the
  // process. Still unfixed on `main` and on `0.87-stable`.
  //
  // Not every child can have the tag. `VirtualizedList` pushes its own
  // `<View key={`$spacer-…`} style={…} />` for the windowed-away regions,
  // and a list header, footer or empty component is a plain child too. The
  // spacers are the reason this cannot be narrowed to "lists without a
  // header": any list long enough to window has them.
  //
  // Line 56 returns early when the tag is absent, so not setting it is what
  // makes the rest unreachable. The cells keep their
  // `accessibilityCollectionItem` -- `ReactAccessibilityDelegate.kt:107`
  // reads that one as `as ReadableMap?` and is not part of this -- so
  // restoring the announcement is putting this back:
  //
  //   const collection: AndroidCollection | undefined = android
  //     ? {
  //         itemCount: count,
  //         rowCount: Math.ceil(count / columns),
  //         columnCount: columns,
  //         hierarchical: false,
  //       }
  //     : undefined
  //
  // and `accessibilityCollection: collection` below, once a React Native
  // with `as?` on line 74 is the floor.
  return createElement(
    ReactNative.FlatList as unknown as never,
    {
      ...rest,
      data,
      numColumns,
      ref: forwardedRef,
      // The caller's own cell renderer wins. Composing would put one view
      // inside another and hand the outer one the handlers the inner one
      // needs; deferring means only the per-item position is left unsaid.
      CellRendererComponent:
        CellRendererComponent ?? (android ? (cell as unknown as never) : undefined),
    } as never,
  )
}
