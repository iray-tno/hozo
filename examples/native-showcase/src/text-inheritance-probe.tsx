// Private RFC 006 preparation: no automatic verdict or synthetic Native values.
import * as React from 'react'
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  type TextProps,
  type TextStyle,
  View,
} from 'react-native'
import {
  createRuntimeLabel,
  createStaticLabel,
  textFixtureManifest,
} from './text-inheritance-generated'
import { nativeTextReference } from './text-inheritance-reference.native'

const factories = { static: createStaticLabel, runtime: createRuntimeLabel }
const modes = ['ordinary', 'reference', 'optimized'] as const
const labels = Object.fromEntries(
  textFixtureManifest.cases.map((entry) => [
    entry.name,
    Object.fromEntries(
      modes.map((mode) => [
        mode,
        factories[entry.name](
          mode === 'reference' || (mode === 'optimized' && entry.route === 'context-fallback')
            ? nativeTextReference.ReferenceText
            : Text,
        ),
      ]),
    ),
  ]),
) as Record<
  'static' | 'runtime',
  Record<(typeof modes)[number], ReturnType<typeof createStaticLabel>>
>
const REST: TextStyle = {
  color: '#111111',
  fontSize: 22,
  fontWeight: '600',
  lineHeight: 32,
  letterSpacing: 1,
  textAlign: 'left',
  textTransform: 'uppercase',
}
const CHANGED: TextStyle = {
  color: '#7c2d12',
  fontSize: 28,
  fontWeight: '700',
  lineHeight: 40,
  letterSpacing: 2,
  textAlign: 'left',
  textTransform: 'lowercase',
}

export function TextInheritanceProbe() {
  const [kind, setKind] = React.useState<'static' | 'runtime'>('static')
  const [changed, setChanged] = React.useState(false)
  const [tick, setTick] = React.useState(0)
  const [visibleMode, setVisibleMode] = React.useState<(typeof modes)[number]>('ordinary')
  const observations = React.useRef(0)
  const [observed, setObserved] = React.useState(0)
  const entry = textFixtureManifest.cases.find((entry) => entry.name === kind)!
  const frame = changed ? CHANGED : REST
  const callbacks = React.useMemo(
    () =>
      Object.fromEntries(
        modes.map((mode) => [
          mode,
          ((event) => {
            // These are actual onTextLayout callback payloads when run on a device.
            // A callback may be queued: request labels are not certified frame epochs.
            const lines = event.nativeEvent.lines.map(
              ({ text, x, y, width, height, ascender, descender, capHeight, xHeight }) => ({
                text,
                x,
                y,
                width,
                height,
                ascender,
                descender,
                capHeight,
                xHeight,
              }),
            )
            console.info(
              '[Hozo text layout]',
              JSON.stringify({
                schemaVersion: 1,
                observation: ++observations.current,
                platform: Platform.OS,
                react: React.version,
                reactNative: Platform.constants.reactNativeVersion,
                request: { kind, changed, tick, mode },
                route: entry.route,
                sourceSha256: entry.sourceSha256,
                coreSha256: textFixtureManifest.coreSha256,
                lines,
                verdict: 'not-assessed',
                scope: 'layout callback only; no color/weight/pixel/AT/timing verdict',
              }),
            )
            setObserved(observations.current)
          }) satisfies NonNullable<TextProps['onTextLayout']>,
        ]),
      ) as Record<(typeof modes)[number], NonNullable<TextProps['onTextLayout']>>,
    [kind, changed, tick, entry],
  )
  const button = (title: string, action: () => void) => (
    <Pressable
      key={title}
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={action}
      style={{ padding: 8, backgroundColor: '#dbeafe', borderRadius: 4 }}
    >
      <Text>{title}</Text>
    </Pressable>
  )
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
      <Text>Native text inheritance experiment</Text>
      <Text>
        Case: {kind}; optimized route: {entry.route}
      </Text>
      <Text>
        React {React.version}; RN {Platform.constants.reactNativeVersion.major}.
        {Platform.constants.reactNativeVersion.minor}.{Platform.constants.reactNativeVersion.patch}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {button('Use static region', () => setKind('static'))}
        {button('Use runtime fallback', () => setKind('runtime'))}
        {button('Change ancestor', () => setChanged((value) => !value))}
        {button('Update label', () => setTick((value) => value + 1))}
        {button('Restore text fixture', () => {
          setChanged(false)
          setTick(0)
        })}
        {modes.map((mode) => button(`Show ${mode}`, () => setVisibleMode(mode)))}
      </View>
      <Text style={{ height: 40 }}>
        {`Text probe state: ${kind} ${changed ? 'changed' : 'rest'} tick ${tick} mode ${visibleMode}`}
      </Text>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Text frame ${visibleMode}`}
        style={{
          width: 32,
          height: 12,
          backgroundColor: {
            ordinary: '#df2020',
            reference: '#20a040',
            optimized: '#3040df',
          }[visibleMode],
        }}
      />
      <View style={{ width: 240, height: 200, backgroundColor: '#ffffff' }}>
        {modes.map((mode) => {
          const Label = labels[kind][mode]
          return (
            <View
              key={mode}
              testID={`text-fixture-panel-${mode}`}
              collapsable={false}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: 240,
                display: visibleMode === mode ? 'flex' : 'none',
              }}
            >
              <nativeTextReference.ReferenceView style={[{ width: 240 }, frame]}>
                <Label name={mode} tick={tick} frame={frame} onTextLayout={callbacks[mode]} />
              </nativeTextReference.ReferenceView>
            </View>
          )
        })}
      </View>
      <Text>Layout observations: {observed}; correctness: not assessed</Text>
      <Text>
        Switching cases starts a new comparison. Within-case controls must retain mount identity. No
        production fallback is enabled.
      </Text>
    </ScrollView>
  )
}
