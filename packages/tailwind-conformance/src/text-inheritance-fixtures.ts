// Explicit expectations are independent of the compiler output. A currently
// missing value stays a reported gap; gaining it is an improvement, not failure.
export const TEXT_PROPERTIES = {
  TextColor: 'color',
  FontSize: 'fontSize',
  FontWeight: 'fontWeight',
  LineHeight: 'lineHeight',
  LetterSpacing: 'letterSpacing',
  TextAlign: 'textAlign',
  TextTransform: 'textTransform',
} as const

const owner = `import { Button } from '@hozo/core'
export function Owner({children}) {
  return <Button className="text-red-500 text-[20px]">{children}</Button>
}`
const label = `import { Text } from '@hozo/core'
export function Label() { return <Text testID="label">Label</Text> }`

export const TEXT_FIXTURES = [
  {
    id: 'closed-static-seven-properties',
    required: true,
    modules: {
      scene: `import { View, Text } from '@hozo/core'
export function Scene() {return <View className="text-red-500 text-[20px] font-semibold leading-[28px] tracking-[2px] text-center uppercase"><Text testID="label">Label</Text></View>}`,
    },
    stages: [
      {
        name: 'mount',
        props: {},
        expected: {
          color: '#fb2c36',
          fontSize: 20,
          fontWeight: '600',
          lineHeight: 28,
          letterSpacing: 2,
          textAlign: 'center',
          textTransform: 'uppercase',
        },
      },
    ],
  },
  {
    id: 'closed-child-overrides',
    required: true,
    modules: {
      scene: `import { View, Text } from '@hozo/core'
export function Scene() {return <View className="text-red-500 text-[20px]"><Text testID="label" className="text-black text-[12px]">Label</Text></View>}`,
    },
    stages: [{ name: 'mount', props: {}, expected: { color: '#000', fontSize: 12 } }],
  },
  {
    id: 'cross-module-direct-text',
    required: true,
    modules: {
      owner,
      scene: `import { Text } from '@hozo/core'
import { Owner } from 'fixture:owner'
export function Scene() {return <Owner><Text testID="label" className="text-black">Label</Text></Owner>}`,
    },
    stages: [{ name: 'mount', props: {}, expected: { color: '#000', fontSize: 20 } }],
  },
  {
    id: 'cross-module-opaque-label',
    required: false,
    modules: {
      owner,
      label,
      scene: `import { Owner } from 'fixture:owner'
import { Label } from 'fixture:label'
export function Scene() {return <Owner><Label /></Owner>}`,
    },
    stages: [{ name: 'mount', props: {}, expected: { color: '#fb2c36', fontSize: 20 } }],
  },
  {
    id: 'cross-module-manifest-summary',
    required: true,
    summarize: ['owner'],
    modules: {
      owner,
      scene: `import { Text } from '@hozo/core'
import { Owner } from 'fixture:owner'
export function Scene() {return <Owner><Text testID="label">Label</Text></Owner>}`,
    },
    stages: [{ name: 'mount', props: {}, expected: { color: '#fb2c36', fontSize: 20 } }],
  },
  {
    id: 'view-opaque-label',
    required: false,
    modules: {
      label,
      scene: `import { View } from '@hozo/core'
import { Label } from 'fixture:label'
export function Scene() {return <View className="text-red-500 text-[20px]"><Label /></View>}`,
    },
    stages: [{ name: 'mount', props: {}, expected: { color: '#fb2c36', fontSize: 20 } }],
  },
  {
    id: 'dynamic-direct-label',
    required: true,
    modules: {
      owner: `import { Button } from '@hozo/core'
export function Owner({children, alternate}) {return <Button className={alternate ? 'text-blue-500 text-[24px]' : 'text-red-500 text-[20px]'}>{children}</Button>}`,
      scene: `import { Text } from '@hozo/core'
import { Owner } from 'fixture:owner'
export function Scene({alternate}) {return <Owner alternate={alternate}><Text testID="label">Label</Text></Owner>}`,
    },
    stages: [
      { name: 'mount', props: { alternate: false }, expected: { color: '#fb2c36', fontSize: 20 } },
      { name: 'change', props: { alternate: true }, expected: { color: '#2b7fff', fontSize: 24 } },
      {
        name: 'restore',
        props: { alternate: false },
        expected: { color: '#fb2c36', fontSize: 20 },
      },
    ],
  },
  {
    id: 'dynamic-view-inline-style',
    required: false,
    modules: {
      scene: `import { View, Text } from '@hozo/core'
export function Scene({size,color}) {return <View style={{fontSize:size,color}}><Text testID="label">Label</Text></View>}`,
    },
    stages: [
      {
        name: 'mount',
        props: { size: 20, color: '#123456' },
        expected: { color: '#123456', fontSize: 20 },
      },
      {
        name: 'change',
        props: { size: 24, color: '#654321' },
        expected: { color: '#654321', fontSize: 24 },
      },
    ],
  },
  {
    id: 'relative-visible-runtime-size',
    required: true,
    modules: {
      scene: `import { Text, Small } from '@hozo/core'
export function Scene({size}) {return <Text style={{fontSize:size}}><Small testID="label">Small</Small></Text>}`,
    },
    // Bare-UA ratio is 1 / 1.2, not Tailwind preflight's 0.8.
    stages: [
      { name: 'mount', props: { size: 20 }, expected: { fontSize: 17 } },
      { name: 'change', props: { size: 30 }, expected: { fontSize: 25 } },
    ],
  },
  {
    id: 'relative-cross-module-opaque-child',
    required: false,
    modules: {
      owner: `import { Text } from '@hozo/core'
export function Owner({children,size}) {return <Text style={{fontSize:size}}>{children}</Text>}`,
      scene: `import { Small } from '@hozo/core'
import { Owner } from 'fixture:owner'
export function Scene({size}) {return <Owner size={size}><Small testID="label">Small</Small></Owner>}`,
    },
    stages: [
      { name: 'mount', props: { size: 20 }, expected: { fontSize: 17 } },
      { name: 'change', props: { size: 30 }, expected: { fontSize: 25 } },
    ],
  },
] as const

export const WORKLOAD_SOURCE = `import { Button, Text } from '@hozo/core'
export function Cell({index}) {
  return <Button testID={'button-'+index} onPress={()=>{}} className="text-red-500 active:text-blue-500 text-[20px]"><Text testID={'label-'+index}>Label</Text></Button>
}`
