// Text inside a box, which React Native will not have.
//
// "Text strings must be rendered within a `<Text>` component" is what a
// bare string inside a `View` gets, at runtime, on a device. Hozo's Native
// backend already knows this and wraps every literal text child it lowers:
//
//     <ListItem>Apple</ListItem>  =>  <View role="listitem"><Text>Apple</Text></View>
//
// Uniformly, for every primitive that becomes a `View` -- there is no
// component where the answer is different, which is worth saying because
// it is what makes this mechanical rather than a judgement about which
// boxes people put labels in.
//
// The uncompiled fallbacks are supposed to behave the way that output
// does, and did not: they passed children through, so `<ListItem>Apple
// </ListItem>` crashed on exactly the path that exists for files the
// compiler could not reach (#295). Two of them were fixed by hand in
// #294, which is where the second occurrence stopped being a coincidence.
//
// This is stricter than the compiler in one place, deliberately. The
// backend leaves `<View>{label}</View>` alone because it cannot know what
// the expression is; this runs at render time, where the answer is
// simply available. A fallback being right about a case the compiler has
// to leave is not a divergence worth removing.

import { Children, type ReactNode } from 'react'
import { Text } from 'react-native'

/**
 * Children with every text one inside a `Text`, and nothing else touched.
 *
 * Per child rather than around the lot, which is what the backend does:
 * `<View><Text>a</Text>tail</View>` lowers to two `Text` elements rather
 * than one wrapping both, and wrapping everything would put whatever else
 * is in there inside a `Text` too.
 *
 * Numbers as well as strings. React renders both as text nodes, and React
 * Native rejects both for the same reason.
 */
export function hozoTextChildren(children: ReactNode): ReactNode {
  return Children.map(children, (child) =>
    typeof child === 'string' || typeof child === 'number' ? <Text>{child}</Text> : child,
  )
}
