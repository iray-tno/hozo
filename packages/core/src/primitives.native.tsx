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

import { HozoLink, hozoTextChildren } from '@hozo/runtime'
import type { ComponentType, ReactNode } from 'react'
import {
  type PressableProps,
  Pressable as RNPressable,
  View as RNView,
  type StyleProp,
  type ViewStyle,
} from 'react-native'

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
      {hozoTextChildren(children)}
    </RNView>
  )
}

export function ListItem({ children, ...props }: Omit<ListNativeProps, 'ordered'>) {
  return (
    <RNView role="listitem" {...props}>
      {hozoTextChildren(children)}
    </RNView>
  )
}

/** The name the Web half publishes for the same prop set. */
export type ListProps = ListNativeProps

/**
 * A button, and a link when it is given an `href`.
 *
 * The Web half renders an `<a role="button">` for the second case; here
 * that is `HozoLink`, which is what the compiler emits for the same
 * source and already carries React Native's answer -- a Pressable with a
 * link role that opens the destination through `Linking` and respects a
 * handler that prevented it.
 *
 * `target`, `rel` and `external` are accepted and ignored. They are
 * browser concepts whose absence changes nothing here: a link leaves the
 * app whatever they say. `download` is the one that is felt, and the
 * compiler reports it -- `PROP_HAS_NO_NATIVE_EQUIVALENT`, because React
 * Native has no download in it at all. This path is the uncompiled one,
 * where nothing is there to report; the prop is dropped and the link
 * opens, which is what the compiled path does too.
 */
export function Button({
  children,
  onPress,
  disabled,
  accessibilityLabel,
  accessibilityHint,
  href,
  style,
  testID,
}: ButtonNativeProps) {
  const shared = {
    disabled,
    accessibilityLabel,
    accessibilityHint,
    // The pair React Native wants: the prop for the platform's own
    // handling, and the state for what a screen reader announces.
    accessibilityState: disabled === undefined ? undefined : { disabled },
    style,
    testID,
  }
  if (href !== undefined) {
    // `HozoLink` is seen here with its Web props -- a package resolves
    // `@hozo/runtime`'s types through the Web entry whichever platform it
    // is building for, because `exports` carries one `types` and this
    // package compiles both halves in one `tsc` run. The module Metro
    // loads takes a React Native press event and a `StyleProp`. Third
    // occurrence of the same boundary; `@hozo/semantics` and
    // `@hozo/typography` carry the same line.
    //
    // Cast to a component and rendered as one: calling it would make it a
    // function call rather than an element, which loses its identity to
    // React and would break the moment it used a hook.
    const Link = HozoLink as unknown as ComponentType<
      { href: string; accessibilityRole: string; children?: ReactNode } & Omit<
        ButtonNativeProps,
        'href' | 'children'
      >
    >
    return (
      <Link href={href} accessibilityRole="button" onPress={onPress} {...shared}>
        {children}
      </Link>
    )
  }
  return (
    <RNPressable accessibilityRole="button" onPress={onPress} {...shared}>
      {hozoTextChildren(children)}
    </RNPressable>
  )
}

export interface ButtonNativeProps {
  children?: ReactNode
  onPress?: PressableProps['onPress']
  disabled?: boolean
  accessibilityLabel?: string
  accessibilityHint?: string
  /** A destination rather than an action, which makes this a link. */
  href?: string
  /** Accepted and ignored; see above. */
  external?: boolean
  target?: string
  rel?: string
  download?: boolean | string
  style?: StyleProp<ViewStyle>
  testID?: string
}
