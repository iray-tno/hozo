// Instrument only the simulated Text boundary. This does not emulate native
// inheritance, layout or accessibility, and must never enter a shipped bundle.
import { createRequire } from 'node:module'

export * from './react-native-stub.js'

const require = createRequire(import.meta.url)
const React = require('react')

type Counts = { renders: number; mounts: number; unmounts: number }
let counts: Record<string, Counts> = {}
let active = 0

function record(id: string, kind: keyof Counts) {
  counts[id] ??= { renders: 0, mounts: 0, unmounts: 0 }
  counts[id][kind] += 1
}

export function Text(props: { testID?: string; children?: unknown }) {
  const { current: id } = React.useRef(props.testID ?? '(unidentified)')
  record(id, 'renders')
  React.useEffect(() => {
    active += 1
    record(id, 'mounts')
    return () => {
      active -= 1
      record(id, 'unmounts')
    }
    // All fixtures keep testID stable. A prop rename must not count as a mount.
  }, [id])
  return React.createElement('Text', props)
}

export function resetTextCounts() {
  if (active !== 0) throw new Error('previous measured Text instances are still mounted')
  counts = {}
}

export function textCounts(): Record<string, Counts> {
  return structuredClone(counts)
}
