// `className` on React Native's own primitives, for TypeScript.
//
// Hozo's authoring surface is a class list. The compiler reads
// `className` off the tag and replaces it with a `StyleSheet` entry, so
// the prop exists at *compile* time and never reaches a component -- which
// is why no runtime declares it.
//
// TypeScript still has to accept it, because TypeScript sees the source
// and not the output. On the Web side it always did: `@hozo/core`'s
// browser components declare `className?: string` themselves. On this side
// nothing did, and nothing noticed, because the `react-native` export
// condition carried no `types` -- so `tsc` in a React Native app resolved
// the *Web* declarations and asked them instead. Fixing that resolution is
// what made the omission visible: `examples/native-demo` went from clean
// to 54 errors, every one of them `className`.
//
// React Native's own components are here rather than only Hozo's because
// `DEFAULT_PRIMITIVE_SOURCES` includes `react-native`:
//
//     import { View, Text } from 'react-native'
//     <View className="p-4" />
//
// compiles exactly as the `@hozo/core` spelling does -- that is proposal
// §2.1, an existing React Native file compiling as written. A type error
// on the pattern the proposal is built around would be the wrong answer.
//
// Only the interfaces that do not already inherit one: `ScrollViewProps`,
// `TextInputProps` and `ActivityIndicatorProps` extend `ViewProps`, and
// `PressableProps` extends an `Omit` of it, so all four follow from the
// first. `SectionList` is not a Hozo primitive and is not here.

declare module 'react-native' {
  interface ViewProps {
    /** Tailwind classes the compiler lowers to a `StyleSheet` entry. */
    className?: string
  }
  interface TextProps {
    /** Tailwind classes the compiler lowers to a `StyleSheet` entry. */
    className?: string
  }
  interface ImagePropsBase {
    /** Tailwind classes the compiler lowers to a `StyleSheet` entry. */
    className?: string
  }
  interface FlatListProps<ItemT> {
    /** Tailwind classes the compiler lowers to a `StyleSheet` entry. */
    className?: string
  }
}

export {}
