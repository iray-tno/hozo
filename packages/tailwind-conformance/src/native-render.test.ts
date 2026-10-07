import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

import {
  loadNativeModule,
  renderNative,
  renderNativeWithEvents,
  renderNativeWithLayouts,
  type Tree,
} from './native-render.ts'

const require = createRequire(import.meta.url)

function children(tree: Tree): Tree[] {
  return ((tree?.children ?? []) as (Tree | string)[]).filter(
    (child): child is Tree => typeof child === 'object' && child !== null,
  )
}

test('a compiled component builds the tree it was meant to', () => {
  // The Native counterpart of rendering the Web output: the generated
  // module is assembled by the real Metro transformer, evaluated, and run.
  // Nothing established any of that before -- the type check says each
  // style is one React Native would accept, and said nothing about whether
  // the module runs.
  const tree = renderNative(
    `
    import { View, Text } from '@hozo/core'
    export function Card() {
      return <View className="p-4"><Text className="text-xl">Hi</Text></View>
    }
    `,
    'Card',
  )
  assert.equal(tree?.type, 'View')
  assert.deepEqual(tree?.props.style, {
    paddingTop: 16,
    paddingRight: 16,
    paddingBottom: 16,
    paddingLeft: 16,
  })
  const [text] = children(tree)
  assert.equal(text.type, 'Text')
  assert.deepEqual(text.props.style, { fontSize: 20, lineHeight: 28 })
})

test('semantic document primitives retain native accessibility intent', () => {
  const tree = renderNative(
    `
    import { Section, Heading, Paragraph } from '@hozo/core'
    export function Article() {
      return <Section><Heading level={3}>Title</Heading><Paragraph>Body</Paragraph></Section>
    }
    `,
    'Article',
  )
  assert.equal(tree?.type, 'View')
  const [heading, paragraph] = children(tree)
  assert.equal(heading.type, 'Text')
  assert.equal(heading.props.accessibilityRole, 'header')
  assert.equal(paragraph.type, 'Text')
})

test('article and navigation landmarks retain Native roles', () => {
  const tree = renderNative(
    `
    import { Article, Nav } from '@hozo/core'
    export function Shell() {
      return <Article><Nav accessibilityLabel="Primary" /></Article>
    }
    `,
    'Shell',
  )
  assert.equal(tree?.type, 'View')
  assert.equal(tree?.props.role, 'article')
  const [nav] = children(tree)
  assert.equal(nav.type, 'View')
  assert.equal(nav.props.role, 'navigation')
  assert.equal(nav.props.accessibilityLabel, 'Primary')
})

test('a small static list retains Native list roles', () => {
  const tree = renderNative(
    `
    import { List, ListItem } from '@hozo/core'
    export function Steps() {
      return <List ordered><ListItem>One</ListItem><ListItem>Two</ListItem></List>
    }
    `,
    'Steps',
  )
  assert.equal(tree?.props.accessibilityRole, 'list')
  const [first, second] = children(tree)
  assert.equal(first.props.role, 'listitem')
  assert.equal(second.props.role, 'listitem')
})

test('HozoSpaced puts the spacing on every child but the last', () => {
  // The component's first execution. Its rule -- `:not(:last-child)`, and
  // the parent's style behind the child's own so the child wins -- was
  // tested as a pure function; this is the React half of it.
  const tree = renderNative(
    `
    import { View, Text } from '@hozo/core'
    export function List() {
      return (
        <View className="space-y-4">
          <Text className="text-xl">One</Text>
          <Text>Two</Text>
          <Text>Three</Text>
        </View>
      )
    }
    `,
    'List',
  )
  const items = children(tree)
  assert.equal(items.length, 3)

  const spacing = { marginTop: 0, marginBottom: 16 }
  // Spacing first, the element's own second: React Native resolves a style
  // array last-wins, so this is what lets a child's own margin override.
  assert.deepEqual(items[0].props.style, [spacing, { fontSize: 20, lineHeight: 28 }])
  // The second child has no style of its own, so the slot is empty.
  assert.deepEqual(items[1].props.style, [spacing, undefined])
  // The last child is `:last-child` on Web and gets nothing here either.
  assert.equal(items[2].props.style, undefined)
})

test('HozoGrid auto-places unequal tracks without a measurement pass', () => {
  const tree = renderNative(
    `
    import { View, Text } from '@hozo/core'
    export function Grid() {
      return (
        <View className="grid grid-cols-[120px_2fr_1fr] gap-4">
          <Text className="col-start-2 col-span-2">Wide</Text><Text>Two</Text><Text>Three</Text>
        </View>
      )
    }
    `,
    'Grid',
  )
  const rows = children(tree)
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0].props.style, { flexDirection: 'row', columnGap: 16 })
  const firstRow = children(rows[0])
  assert.deepEqual(
    firstRow.map((cell) => cell.props.style),
    [
      { flexBasis: 120, flexGrow: 0, flexShrink: 0 },
      { flexBasis: 16, flexGrow: 3, flexShrink: 1 },
    ],
  )
  assert.equal(children(firstRow[0]).length, 0)
  assert.equal(children(rows[1]).length, 3)
  assert.equal(children(children(rows[1])[2]).length, 0)
  assert.equal(
    rows.some((row) => typeof row.props.onLayout === 'function'),
    false,
  )
})

test('HozoGrid measured rows settle after layout and respond to width changes', () => {
  const source = `
    import { View, Text } from '@hozo/core'
    export function Grid() {
      return (
        <View className="grid grid-cols-2 gap-2">
          <Text className="row-span-2">Tall</Text><Text>Top</Text><Text>Bottom</Text>
        </View>
      )
    }
  `
  // Target order is the measured container followed by its three absolute
  // cells. The second pass is what a real renderer reports after row sizes
  // have been imposed; the third represents a parent width/rotation change.
  const tree = renderNativeWithLayouts(source, 'Grid', [
    [
      { width: 300, height: 0 },
      { width: 146, height: 70 },
      { width: 146, height: 20 },
      { width: 146, height: 30 },
    ],
    [
      { width: 300, height: 70 },
      { width: 146, height: 70 },
      { width: 146, height: 26 },
      { width: 146, height: 36 },
    ],
    [
      { width: 400, height: 70 },
      { width: 196, height: 70 },
      { width: 196, height: 26 },
      { width: 196, height: 36 },
    ],
  ])

  // The authored View remains the semantic/styling container; the solver is
  // its only child and owns the absolute placement layer.
  assert.deepEqual(tree?.props.style, { gap: 8 })
  const [grid] = children(tree)
  assert.deepEqual(grid.props.style, { position: 'relative', alignSelf: 'stretch', height: 70 })
  const cells = children(grid)
  assert.deepEqual(
    cells.map((cell) => cell.props.style),
    [
      { position: 'absolute', left: 0, top: 0, width: 196, height: 70 },
      { position: 'absolute', left: 204, top: 0, width: 196, height: 26 },
      { position: 'absolute', left: 204, top: 34, width: 196, height: 36 },
    ],
  )
})

test('a text style set on a View reaches the Text underneath it', () => {
  // React Native inherits text styles only from a Text, so the compiler
  // carries them down. Checked here on the rendered tree rather than on the
  // emitted string, which is where it would look right either way.
  const tree = renderNative(
    `
    import { View, Text } from '@hozo/core'
    export function Card() {
      return <View className="text-xl text-red-500"><Text>Hi</Text></View>
    }
    `,
    'Card',
  )
  // Nothing left on the View: it has no `fontSize` to hold.
  assert.equal(tree?.props.style, undefined)
  const [text] = children(tree)
  assert.deepEqual(text.props.style, { fontSize: 20, lineHeight: 28, color: '#fb2c36' })
})

test('a Dialog renders its children only while it is open', () => {
  const source = `
    import { Dialog, Text } from '@hozo/core'
    export function Confirm() {
      return (
        <Dialog className="p-6" open={showing} onClose={dismiss} accessibilityLabel="Confirm">
          <Text>Delete?</Text>
        </Dialog>
      )
    }
  `
  const open = renderNative(source, 'Confirm', { showing: true, dismiss: () => {} })
  assert.equal(open?.type, 'Modal')
  assert.equal(open?.props.visible, true)
  // The accessible name and the modal semantics reach the view inside,
  // which is what a screen reader reads when the dialog appears.
  const [inner] = children(open)
  assert.equal(inner.props.accessibilityLabel, 'Confirm')
  assert.equal(inner.props.accessibilityViewIsModal, true)
  assert.deepEqual(inner.props.style, {
    paddingTop: 24,
    paddingRight: 24,
    paddingBottom: 24,
    paddingLeft: 24,
  })

  const closed = renderNative(source, 'Confirm', { showing: false, dismiss: () => {} })
  assert.equal(closed?.props.visible, false)
})

test('truncation reaches the prop React Native carries it on', () => {
  const tree = renderNative(
    `
    import { Text } from '@hozo/core'
    export function Clamped() {
      return <Text className="line-clamp-2">a long line</Text>
    }
    `,
    'Clamped',
  )
  assert.equal(tree?.props.numberOfLines, 2)
})

test('Link renders as a native link interaction with its destination', () => {
  const tree = renderNative(
    `
    import { Link } from '@hozo/core'
    export function Docs() {
      return <Link href="https://example.com" accessibilityLabel="Documentation">Docs</Link>
    }
    `,
    'Docs',
  )
  assert.equal(tree?.type, 'Pressable')
  assert.equal(tree?.props.accessibilityRole, 'link')
  assert.equal(tree?.props.accessibilityLabel, 'Documentation')
  assert.equal(typeof tree?.props.onPress, 'function')
})

test('Image maps its URI and alternative onto React Native Image props', () => {
  const tree = renderNative(
    `
    import { Image } from '@hozo/core'
    export function Cover() {
      return <Image className="w-20 h-20 object-cover" src="https://example.com/cover.jpg" alt="Cover" />
    }
    `,
    'Cover',
  )
  assert.equal(tree?.type, 'Image')
  assert.deepEqual(tree?.props.source, { uri: 'https://example.com/cover.jpg' })
  assert.equal(tree?.props.accessibilityLabel, 'Cover')
  assert.deepEqual(tree?.props.style, { width: 80, height: 80, objectFit: 'cover' })
})

test('Image retains a Metro local asset and load state callbacks', () => {
  const loaded = () => {}
  const failed = () => {}
  const tree = renderNative(
    `
    import { Image } from '@hozo/core'
    export function Logo() {
      return <Image src={logo} alt="Logo" onLoad={loaded} onError={failed} />
    }
    `,
    'Logo',
    { logo: 42, loaded, failed },
  )
  assert.equal(tree?.props.source, 42)
  assert.equal(tree?.props.onLoad, loaded)
  assert.equal(tree?.props.onError, failed)
})

test('ScrollView directly uses the Native viewport and keeps child layout explicit', () => {
  const tree = renderNative(
    `
    import { ScrollView, View, Text } from '@hozo/core'
    export function Rail() {
      return (
        <ScrollView horizontal className="h-40">
          <View className="flex-row gap-4"><Text>One</Text><Text>Two</Text></View>
        </ScrollView>
      )
    }
    `,
    'Rail',
  )
  assert.equal(tree?.type, 'ScrollView')
  assert.equal(tree?.props.horizontal, true)
  assert.deepEqual(tree?.props.style, { height: 160 })
  const content = tree?.children?.[0]
  assert.equal(typeof content === 'string' ? content : content?.type, 'View')
  if (typeof content !== 'string' && content) {
    assert.deepEqual(content.props.style, { flexDirection: 'row', gap: 16 })
  }
})

test('FlatList stays virtualized and its renderItem body is compiled', () => {
  const tree = renderNative(
    `
    import { FlatList, Text } from '@hozo/core'
    export function Rows() {
      return <FlatList className="h-40" data={rows} renderItem={({ item }) => <Text className="p-2">{item}</Text>} />
    }
    `,
    'Rows',
    { rows: ['One', 'Two'] },
  )
  assert.equal(tree?.type, 'FlatList')
  assert.equal(tree?.props.accessibilityRole, 'list')
  assert.deepEqual(tree?.props.data, ['One', 'Two'])
  const renderItem = tree?.props.renderItem as
    | ((info: { item: string }) => { type: string; props: Record<string, unknown> })
    | undefined
  assert.equal(typeof renderItem, 'function')
  const item = renderItem!({ item: 'One' })
  assert.equal(item.type, 'Text')
  assert.deepEqual(item.props.style, {
    paddingTop: 8,
    paddingRight: 8,
    paddingBottom: 8,
    paddingLeft: 8,
  })
})

test('focus-visible installs modality events only on an interaction that asks for them', () => {
  const tree = renderNative(
    `
    import { Pressable } from '@hozo/core'
    export function Save() {
      return <Pressable className="focus-visible:opacity-50" accessibilityRole="button">Save</Pressable>
    }
    `,
    'Save',
  )
  assert.equal(tree?.type, 'Pressable')
  assert.equal(typeof tree?.props.onFocus, 'function')
  assert.equal(typeof tree?.props.onPointerDown, 'function')
  assert.equal(typeof tree?.props.onKeyDown, 'function')
  assert.equal(typeof tree?.props.style, 'function')
})

test('child Text focus-visible follows its owner through keyboard, pointer and blur events', () => {
  for (const parent of ['', 'focus:opacity-50']) {
    const snapshots = renderNativeWithEvents(
      `import { Pressable, Text } from '@hozo/core'
       export function Save() {
         return <Pressable className="${parent}"><Text className="focus-visible:opacity-50 not-focus-visible:opacity-100">Save</Text></Pressable>
       }`,
      'Save',
      ['onFocus', 'onPointerDown', 'onKeyDown', 'onBlur'],
    )
    const flatten = require('react-native').StyleSheet.flatten as (style: unknown) => {
      opacity?: number
    }
    assert.deepEqual(
      snapshots.map((tree) => {
        const style = children(tree)[0].props.style
        // The stub's flatten is shallow; Animated.Text wraps the compiled
        // style array once more. RN itself flattens these nested arrays.
        return flatten(Array.isArray(style) ? style.flat(Infinity) : style).opacity
      }),
      [1, 0.5, 1, 0.5, 1],
    )
    for (const tree of snapshots) {
      assert.equal(children(tree)[0].props.hozoFocusVisible, undefined)
    }
  }
})

test('negated hover follows real owner events, not pressing or a fabricated capability', () => {
  const flatten = require('react-native').StyleSheet.flatten as (style: unknown) => {
    opacity?: number
    paddingTop?: number
  }
  for (const primitive of ['Pressable', 'Button']) {
    const snapshots = renderNativeWithEvents(
      `import { ${primitive} } from '@hozo/core'
       export function C() {
         return <${primitive} className="not-hover:opacity-50 hover:opacity-100 hover:p-4">Save</${primitive}>
       }`,
      'C',
      ['onPressIn', 'onPressOut', 'onHoverIn', 'onPressIn', 'onPressOut', 'onHoverOut'],
    )
    assert.deepEqual(
      snapshots.map((tree) => {
        const style = tree?.props.style as (state: { pressed: boolean }) => unknown
        assert.equal(typeof style, 'function', 'RN must still receive its plain style callback')
        assert.equal(tree?.props.onPointerDown, undefined, 'no new modality listener is needed')
        const resolved = flatten([style({ pressed: false })].flat(Infinity))
        return [resolved.opacity, resolved.paddingTop]
      }),
      [
        [0.5, undefined],
        [0.5, undefined],
        [0.5, undefined],
        [1, 16],
        [1, 16],
        [1, 16],
        [0.5, undefined],
      ],
      primitive,
    )
  }
})

test('descendant-only hover negation binds explicit and inherited Text to the nearest owner', () => {
  const flatten = require('react-native').StyleSheet.flatten as (style: unknown) => {
    color?: string
  }
  for (const content of [
    '<Text className="not-hover:text-red-500">Save</Text>',
    '<View className="not-hover:text-red-500">Save</View>',
  ]) {
    const snapshots = renderNativeWithEvents(
      `import { Pressable, Text, View } from '@hozo/core'
       export function C() { return <Pressable>${content}</Pressable> }`,
      'C',
      ['onPressIn', 'onPressOut', 'onHoverIn', 'onHoverOut'],
    )
    const colors = snapshots.map((tree) => {
      const [child] = children(tree)
      const text = child?.type === 'View' ? children(child)[0] : child
      return flatten([text?.props.style].flat(Infinity)).color
    })
    assert.ok(colors[0], 'the no-hover style must apply before any event')
    assert.deepEqual(colors, [colors[0], colors[0], colors[0], undefined, colors[0]])
  }

  const react = require('react')
  const renderer = require('react-test-renderer')
  const { C } = loadNativeModule(`
    import { Pressable, Button, Text } from '@hozo/core'
    export function C() {
      return <Pressable testID="outer"><Button testID="inner">
        <Text className="not-hover:text-red-500">Save</Text>
      </Button></Pressable>
    }`)
  let root: ReturnType<typeof renderer.create> | undefined
  try {
    renderer.act(() => {
      root = renderer.create(react.createElement(C))
    })
    const hosts = root!.root.findAll((node: { type: unknown }) => node.type === 'Pressable')
    assert.equal(hosts.length, 2)
    assert.equal(hosts[0].props.onHoverIn, undefined, 'the outer owner must remain plain')
    const color = () =>
      flatten([children(children(root!.toJSON())[0])[0].props.style].flat(Infinity)).color
    const initial = color()
    assert.ok(initial)
    renderer.act(() => hosts[1].props.onHoverIn())
    assert.equal(color(), undefined)
    renderer.act(() => hosts[1].props.onHoverOut())
    assert.equal(color(), initial)
  } finally {
    renderer.act(() => root?.unmount())
  }
})

test('hover negation alone installs the existing opacity transition and preserves its targets', () => {
  const snapshots = renderNativeWithEvents(
    `import { Pressable } from '@hozo/core'
     export function C() {
       return <Pressable className="opacity-100 transition-opacity not-hover:opacity-50" />
     }`,
    'C',
    ['onHoverIn', 'onHoverOut'],
  )
  assert.deepEqual(
    snapshots.map((tree) => {
      assert.notEqual(
        typeof tree?.props.style,
        'function',
        'Animated must receive an attachable array',
      )
      const parts = [tree?.props.style].flat(Infinity) as { opacity?: unknown }[]
      assert.ok(
        parts.some((part) => part?.opacity && typeof part.opacity === 'object'),
        'animation is not dropped',
      )
      return parts.filter((part) => typeof part?.opacity === 'number').at(-1)?.opacity
    }),
    [0.5, 1, 0.5],
  )
})

test('negated ambient styles are complementary at exact boundaries and reuse coarse snapshots', () => {
  const stub = require('react-native') as {
    Dimensions: {
      get: (name: string) => { width: number }
      __hozoSetWindow: (window: { width: number }) => void
    }
    Appearance: { getColorScheme: () => string; __hozoSetColorScheme: (scheme: string) => void }
    StyleSheet: { flatten: (style: unknown) => { opacity?: number } }
  }
  const previousWidth = stub.Dimensions.get('window').width
  const previousScheme = stub.Appearance.getColorScheme()
  const react = require('react')
  const renderer = require('react-test-renderer')
  let root: { toJSON: () => Tree; unmount: () => void } | undefined
  let commits = 0
  try {
    renderer.act(() => {
      stub.Dimensions.__hozoSetWindow({ width: 499 })
      stub.Appearance.__hozoSetColorScheme('light')
    })
    const { C } = loadNativeModule(`
      import { View } from '@hozo/core'
      export function C() {
        return <View>
          <View className="md:opacity-100 not-md:opacity-50" />
          <View className="min-[500px]:opacity-100 not-min-[500px]:opacity-50" />
          <View className="max-[500px]:opacity-50 not-max-[500px]:opacity-100" />
          <View className="dark:opacity-50 not-dark:opacity-100" />
        </View>
      }`)
    renderer.act(() => {
      root = renderer.create(
        react.createElement(
          react.Profiler,
          {
            id: 'ambient',
            onRender: () => {
              commits += 1
            },
          },
          react.createElement(C),
        ),
      )
    })
    const opacities = () =>
      children(root!.toJSON()).map((tree) => stub.StyleSheet.flatten(tree?.props.style).opacity)
    assert.deepEqual(opacities(), [0.5, 0.5, 0.5, 1])
    for (const [width, expected, expectedCommits] of [
      [500, [0.5, 1, 1, 1], 1],
      [501, [0.5, 1, 1, 1], 0],
      [639, [0.5, 1, 1, 1], 0],
      // The existing named-breakpoint store tracks shared buckets: crossing
      // sm rerenders once even though this component only asks about md.
      [640, [0.5, 1, 1, 1], 1],
      [767, [0.5, 1, 1, 1], 0],
      [768, [1, 1, 1, 1], 1],
      [769, [1, 1, 1, 1], 0],
    ] as const) {
      commits = 0
      renderer.act(() => stub.Dimensions.__hozoSetWindow({ width }))
      assert.deepEqual(opacities(), expected, `width=${width}`)
      assert.equal(commits, expectedCommits, `commits at width=${width}`)
    }
    renderer.act(() => stub.Appearance.__hozoSetColorScheme('dark'))
    assert.deepEqual(opacities(), [1, 1, 1, 0.5])
    renderer.act(() => stub.Dimensions.__hozoSetWindow({ width: 499 }))
    assert.deepEqual(opacities(), [0.5, 0.5, 0.5, 0.5])
    renderer.act(() => stub.Appearance.__hozoSetColorScheme('light'))
    assert.deepEqual(opacities(), [0.5, 0.5, 0.5, 1])
  } finally {
    renderer.act(() => {
      root?.unmount()
      stub.Dimensions.__hozoSetWindow({ width: previousWidth })
      stub.Appearance.__hozoSetColorScheme(previousScheme)
    })
  }
})

test('negated container queries keep missing scopes unknown and use the applicable ancestor', () => {
  const react = require('react')
  const renderer = require('react-test-renderer')
  const stub = require('react-native') as {
    StyleSheet: { flatten: (style: unknown) => { opacity?: number } }
  }
  let root: ReturnType<typeof renderer.create> | undefined
  let queryCommits = 0
  let authoredLayouts = 0
  const { C } = loadNativeModule(`
    import { View } from '@hozo/core'
    import { Profiler } from 'react'
    export function C({ onLayout, onQueryRender }) {
      return <View onLayout={onLayout} className="@container/main opacity-100 not-@md/main:opacity-25">
        <Profiler id="query" onRender={onQueryRender}>
          <View className="@md:opacity-100 not-@md:opacity-50" />
        </Profiler>
        <View className="@max-md:opacity-50 not-@max-md:opacity-100" />
        <View className="@container/inner opacity-100 not-@md/inner:opacity-25">
          <View className="opacity-100 not-@min-[400px]/main:opacity-50" />
          <View className="opacity-100 not-@min-[400px]/inner:opacity-50" />
          <View className="opacity-100 not-@md/missing:opacity-50" />
          <View className="opacity-100 not-not-@min-[400px]:opacity-50" />
        </View>
      </View>
    }`)
  try {
    renderer.act(() => {
      root = renderer.create(
        react.createElement(C, {
          onLayout: () => {
            authoredLayouts += 1
          },
          onQueryRender: () => {
            queryCommits += 1
          },
        }),
      )
    })
    const opacity = (tree: Tree) => stub.StyleSheet.flatten(tree?.props.style).opacity
    const opacities = () => {
      const tree = root!.toJSON() as Tree
      const [min, max, inner] = children(tree)
      return [
        opacity(tree),
        opacity(min),
        opacity(max),
        opacity(inner),
        ...children(inner).map(opacity),
      ]
    }
    // The container never queries itself, and an unmeasured or missing
    // named ancestor remains unknown even through repeated negation.
    assert.deepEqual(opacities(), [1, undefined, undefined, 1, 1, 1, 1, 1])
    const measure = (outerWidth: number, innerWidth: number) => {
      const targets = root!.root.findAll(
        (node: { type: unknown; props: Record<string, unknown> }) =>
          node.type === 'View' && typeof node.props.onLayout === 'function',
      )
      assert.equal(targets.length, 2)
      renderer.act(() => {
        for (const [index, width] of [outerWidth, innerWidth].entries()) {
          targets[index].props.onLayout({ nativeEvent: { layout: { width, height: 100 } } })
        }
      })
    }
    for (const [outer, inner, expected] of [
      [399, 449, [1, 0.5, 0.5, 1, 0.5, 1, 1, 0.5]],
      [400, 399, [1, 0.5, 0.5, 1, 1, 0.5, 1, 1]],
      [447, 400, [1, 0.5, 0.5, 1, 1, 1, 1, 0.5]],
      [448, 400, [1, 1, 1, 1, 1, 1, 1, 0.5]],
      [449, 400, [1, 1, 1, 1, 1, 1, 1, 0.5]],
      // Zero is measured, not absent: the negative minimum must apply.
      [0, 0, [1, 0.5, 0.5, 1, 0.5, 0.5, 1, 1]],
    ] as const) {
      measure(outer, inner)
      assert.deepEqual(opacities(), expected, `outer=${outer}, inner=${inner}`)
    }
    queryCommits = 0
    measure(0, 0)
    assert.equal(queryCommits, 0, 'unchanged measurements do not commit a new query tree')
    assert.equal(authoredLayouts, 7, 'the author still receives every layout event')
  } finally {
    renderer.act(() => root?.unmount())
  }
})

test('container negation reaches inherited raw text and the real interaction callback', () => {
  const react = require('react')
  const renderer = require('react-test-renderer')
  const stub = require('react-native') as {
    StyleSheet: { flatten: (style: unknown) => { opacity?: number; color?: string } }
  }
  const { C } = loadNativeModule(`
    import { View, Pressable } from '@hozo/core'
    export function C() {
      return <View className="@container/main">
        <View className="not-@md/main:text-red-500">raw</View>
        <Pressable className="opacity-100 not-@md/main:hover:opacity-50" />
      </View>
    }`)
  let root: ReturnType<typeof renderer.create> | undefined
  try {
    renderer.act(() => {
      root = renderer.create(react.createElement(C))
    })
    const styles = () => {
      const [view, pressable] = children(root!.toJSON())
      assert.ok(pressable)
      // The host stub does not evaluate RN's style callback. Give it RN's
      // unpressed state; hover still comes from the actual owner's events.
      const style = pressable.props.style as (state: { pressed: boolean }) => unknown
      assert.equal(typeof style, 'function')
      return [
        stub.StyleSheet.flatten(children(view)[0].props.style).color,
        stub.StyleSheet.flatten([style({ pressed: false })].flat(Infinity)).opacity,
      ]
    }
    const host = (type: string, prop: string) => {
      const matches = root!.root.findAll(
        (node: { type: unknown; props: Record<string, unknown> }) =>
          node.type === type && typeof node.props[prop] === 'function',
      )
      assert.equal(matches.length, 1)
      return matches[0]
    }
    assert.deepEqual(styles(), [undefined, 1])
    renderer.act(() => host('Pressable', 'onHoverIn').props.onHoverIn())
    assert.deepEqual(styles(), [undefined, 1], 'hover cannot make a missing query true')
    renderer.act(() =>
      host('View', 'onLayout').props.onLayout({ nativeEvent: { layout: { width: 447 } } }),
    )
    const [red] = styles()
    assert.ok(red, 'inherited text receives the conditional colour')
    assert.deepEqual(styles(), [red, 0.5])
    renderer.act(() =>
      host('View', 'onLayout').props.onLayout({ nativeEvent: { layout: { width: 448 } } }),
    )
    assert.deepEqual(styles(), [undefined, 1])
  } finally {
    renderer.act(() => root?.unmount())
  }
})

test('a compiled list says where each cell sits, and deliberately not how long it is', () => {
  // A windowed list has a length its accessibility tree does not. React
  // Native mounts the rows near the viewport and TalkBack counts those, so a
  // ten-thousand-row feed announces however many cells happen to exist.
  //
  // `accessibilityCollection` said otherwise, and a device heard it: "In list
  // Hozo native acceptance screen, 3 items". It is not set any more, because
  // setting it crashes the app (#512) -- and the crash rather than the
  // announcement is what this now pins, since a prop nothing types is a prop
  // that can come back by accident.
  //
  // `accessibilityCollectionItem` on the cells stays. It is read by a
  // different delegate, with a safe cast, and is not part of the crash.
  //
  // Rendered as Android, because the props only exist there and the stub
  // reports `ios`. Without this the cell assertions below would be about
  // `undefined` -- which is how a test comes to compare nothing at all.
  const platform = require('react-native').Platform as { OS: string }
  const was = platform.OS
  platform.OS = 'android'
  try {
    const tree = renderNative(
      `
      import { FlatList, Text } from '@hozo/core'
      export function Rows() {
        return <FlatList className="h-40" numColumns={2} data={rows} renderItem={({ item }) => <Text className="p-2">{item}</Text>} />
      }
      `,
      'Rows',
      { rows: ['One', 'Two', 'Three'] },
    )
    // Still React Native's list that renders, reached through the wrapper the
    // compiler emits: the tree is the shape it always was.
    assert.equal(tree?.type, 'FlatList')
    assert.equal(tree?.props.accessibilityRole, 'list')
    assert.deepEqual(tree?.props.data, ['One', 'Two', 'Three'])
    // Not set, and this is the assertion that keeps it that way.
    //
    // `ReactScrollViewAccessibilityDelegate.kt:74` casts a child's
    // `accessibility_collection_item` with `as` rather than `as?` -- the only
    // one of four reads in that file that does -- so any child without the
    // tag throws. `VirtualizedList`'s own windowing spacers are such
    // children, and so are a header, a footer and an empty component, which
    // is why this cannot be narrowed to some lists. Line 56 returns early
    // when the collection tag is absent, so absent is the fix until React
    // Native ships `as?`.
    assert.equal(tree?.props.accessibilityCollection, undefined)

    // And each cell says where it sits, through React Native's own
    // `CellRendererComponent` rather than a second view nested inside one.
    const Cell = tree?.props.CellRendererComponent as
      | ((props: Record<string, unknown>) => { props: Record<string, unknown> })
      | undefined
    assert.equal(typeof Cell, 'function')
    assert.deepEqual(Cell!({ index: 3, children: null }).props.accessibilityCollectionItem, {
      rowIndex: 1,
      columnIndex: 1,
      rowSpan: 1,
      columnSpan: 1,
      heading: false,
    })
    // The handlers `VirtualizedList` measures and follows focus with have to
    // survive the cell: swallowing either would break the list to describe it.
    const onLayout = () => {}
    const onFocusCapture = () => {}
    const cell = Cell!({ index: 0, children: null, onLayout, onFocusCapture })
    assert.equal(cell.props.onLayout, onLayout)
    assert.equal(cell.props.onFocusCapture, onFocusCapture)
  } finally {
    platform.OS = was
  }
})

test('and no cell renderer on iOS, because there is nothing to say it to', () => {
  // `BaseViewConfig.ios.js` registers neither prop and `React/Views` has no
  // implementation of either, so sending them would be sending them nowhere.
  // Asserted rather than assumed: a prop that is merely ignored today is a
  // prop that starts meaning something tomorrow.
  //
  // The collection prop is absent on both platforms now, for two unrelated
  // reasons -- nothing to send it to here, #512 there -- so the cell renderer
  // is what this one is actually about.
  const tree = renderNative(
    `
    import { FlatList, Text } from '@hozo/core'
    export function Rows() {
      return <FlatList data={rows} renderItem={({ item }) => <Text className="p-2">{item}</Text>} />
    }
    `,
    'Rows',
    { rows: ['One'] },
  )
  assert.equal(tree?.props.accessibilityCollection, undefined)
  assert.equal(tree?.props.CellRendererComponent, undefined)
})
