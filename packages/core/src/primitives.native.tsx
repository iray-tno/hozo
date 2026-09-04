// The primitives `index.tsx` writes in the browser, which React Native
// already has.
//
// `index.tsx` explains why the Web half exists: those components are
// fallbacks that imitate React Native's API in a DOM, so that a file the
// compiler could not lower still behaves the way the compiled one would.
// The imitation only makes sense if the original is reachable under the
// same name, and it was not -- `@hozo/core`'s native entry exported no
// `View`, `Pressable`, `Image`, `ScrollView`, `FlatList` or `TextInput`
// at all. `examples/native-demo` imports six of them, and Metro is happy
// to bundle a named export that does not exist: it arrives as
// `undefined`, and React fails at the first render rather than at build.
//
// So the native answer to every one of them is React Native's own
// component, re-exported here.

import type { ReactNode } from 'react'
import { View as RNView, type StyleProp, type ViewStyle } from 'react-native'

export type {
  FlatListProps,
  ImageProps,
  PressableProps,
  ScrollViewProps,
  TextInputProps,
  ViewProps,
} from 'react-native'
export {
  FlatList,
  Image,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native'

export interface ListNativeProps {
  children?: ReactNode
  /** `<ol>` on the Web. Nothing visual here; the role is the same either way. */
  ordered?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
  accessibilityLabel?: string
}

/**
 * The two React Native has no component for, and needs a role for.
 *
 * `<ul>` and `<li>` carry their structure in the element on the Web. Here
 * the structure has to be said out loud, which is the whole reason these
 * are in `@hozo/core` rather than left to the caller: a list of rows that
 * never announces itself as a list is the commonest thing a native screen
 * reader is given.
 */
export function List({ ordered: _ordered, children, ...props }: ListNativeProps) {
  return (
    <RNView role="list" {...props}>
      {children}
    </RNView>
  )
}

export function ListItem({ children, ...props }: Omit<ListNativeProps, 'ordered'>) {
  return (
    <RNView role="listitem" {...props}>
      {children}
    </RNView>
  )
}

/** The name the Web half publishes for the same prop set. */
export type ListProps = ListNativeProps
