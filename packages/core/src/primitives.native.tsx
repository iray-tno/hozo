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
  Pressable as RNPressable,
  type PressableProps as RNPressableProps,
  View as RNView,
  type StyleProp,
  type ViewStyle,
} from 'react-native'

export type {
  FlatListProps,
  ImageProps,
  ScrollViewProps,
  TextInputProps,
  ViewProps,
} from 'react-native'
export {
  FlatList,
  Image,
  ScrollView,
  TextInput,
  View,
} from 'react-native'

export interface PressableProps extends RNPressableProps {
  /** A destination turns the free-form surface into a semantic link. */
  href?: string
  external?: boolean
  replace?: boolean
  prefetch?: boolean
  /** Browser-only destination controls; ignored by the uncompiled Native fallback. */
  target?: string
  rel?: string
  download?: boolean | string
}

export function Pressable({
  href,
  external,
  replace,
  prefetch,
  target: _target,
  rel: _rel,
  download: _download,
  ...props
}: PressableProps) {
  if (href === undefined) return <RNPressable {...props} />

  const Link = HozoLink as unknown as ComponentType<
    { href: string; external?: boolean; replace?: boolean; prefetch?: boolean } & RNPressableProps
  >
  return <Link href={href} external={external} replace={replace} prefetch={prefetch} {...props} />
}

export interface ListNativeProps {
  /**
   * Tailwind classes, the same prop the Web half takes.
   *
   * On a tag the compiler lowers it is gone by runtime, replaced by a
   * `StyleSheet` entry. Anywhere else it is carried and ignored here --
   * this side has no CSS engine to resolve a class list against -- and
   * the type still has to accept it, because an app is type-checked
   * against the source the compiler reads rather than its output.
   */
  className?: string
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
 * The Web half renders an `<a>` for the second case; here that is
 * `HozoLink`, which is what the compiler emits for the same source and
 * carries React Native's answer -- a Pressable with a link role that
 * opens the destination through `Linking` and respects a handler that
 * prevented it. `Button` names its presentation; `href` decides its
 * navigation semantics.
 *
 * `target` and `rel` are accepted and ignored because they are browser
 * concepts. `external` remains meaningful: it prevents an installed
 * application router from claiming the destination. `download` is felt, and the
 * compiler reports it -- `PROP_HAS_NO_NATIVE_EQUIVALENT`, because React
 * Native has no download in it at all. This path is the uncompiled one,
 * where nothing is there to report; the prop is dropped and the link opens.
 */
export function Button({
  children,
  onPress,
  disabled,
  accessibilityLabel,
  accessibilityHint,
  href,
  external,
  replace,
  prefetch,
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
      { href: string; children?: ReactNode } & Omit<ButtonNativeProps, 'href' | 'children'>
    >
    return (
      <Link
        href={href}
        external={external}
        replace={replace}
        prefetch={prefetch}
        onPress={onPress}
        {...shared}
      >
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
  /**
   * Tailwind classes, the same prop the Web half takes.
   *
   * On a tag the compiler lowers it is gone by runtime, replaced by a
   * `StyleSheet` entry. Anywhere else it is carried and ignored here --
   * this side has no CSS engine to resolve a class list against -- and
   * the type still has to accept it, because an app is type-checked
   * against the source the compiler reads rather than its output.
   */
  className?: string
  children?: ReactNode
  onPress?: RNPressableProps['onPress']
  disabled?: boolean
  accessibilityLabel?: string
  accessibilityHint?: string
  /** A destination rather than an action, which makes this a link. */
  href?: string
  /** Accepted and ignored; see above. */
  external?: boolean
  /** Ask an installed router to replace its current history entry. */
  replace?: boolean
  /** Warm the application route when the user begins pressing the link. */
  prefetch?: boolean
  target?: string
  rel?: string
  download?: boolean | string
  style?: StyleProp<ViewStyle>
  testID?: string
}
