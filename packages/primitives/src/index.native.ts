import * as ReactNative from 'react-native'

import { HozoFlatList } from './flat-list.native.tsx'

export * from './foundation.native.tsx'

export type { HozoFlatListLayout, HozoFlatListRenderInfo, HozoScrollEvent } from './index.ts'

export type HozoScrollViewProps = ReactNative.ScrollViewProps
export type HozoRefreshControlProps = ReactNative.RefreshControlProps

export const HozoScrollView = ReactNative.ScrollView
export const HozoRefreshControl = ReactNative.RefreshControl

export {
  HozoFlatList,
  type HozoFlatListHandle,
  type HozoFlatListProps,
} from './flat-list.native.tsx'

export type { HozoFlatListRenderInfo as FlatListRenderInfo } from './index.ts'
export { HozoFlatList as FlatList, HozoScrollView as ScrollView }
export type FlatListProps<T> = import('./flat-list.native.tsx').HozoFlatListProps<T>
export type ScrollViewProps = HozoScrollViewProps
