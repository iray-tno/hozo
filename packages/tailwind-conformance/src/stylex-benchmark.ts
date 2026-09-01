import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createCompiler } from '@hozo/compiler'

export const STYLEX_BENCHMARK_SOURCE = `import * as stylex from '@stylexjs/stylex'
import { Pressable, Text, View } from '@hozo/core'

const tokens = stylex.defineVars({ accent: '#2563eb', space: 12 })
const styles = stylex.create({
  root: {
    alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 12,
    display: 'flex', flexDirection: 'row', gap: 12, justifyContent: 'space-between',
    marginInline: 8, maxWidth: 640, minHeight: 48, opacity: 1,
    padding: tokens.space, transform: 'translateX(0px)',
    '@media (min-width: 600px)': { padding: 24 },
  },
  action: {
    opacity: 1, paddingLeft: 12, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
    ':hover': { opacity: 0.8 }, ':active': { transform: 'scale(0.95)' },
  },
  label: {
    color: tokens.accent, fontSize: 16, fontWeight: 700, lineHeight: 1.5,
    overflowWrap: 'anywhere', textAlign: 'center', whiteSpace: 'nowrap',
  },
})

export const Card = () => (
  <View {...stylex.props(styles.root)}>
    <Text {...stylex.props(styles.label)}>Account</Text>
    <Pressable accessibilityRole="button" {...stylex.props(styles.action)} />
  </View>
)
`

export interface StylexBenchmarkResult {
  schemaVersion: 1
  corpusHash: string
  iterationsPerSample: number
  samples: number
  medianMsPerPair: number
  pairsPerSecond: number
}

export interface StylexBenchmarkComparison {
  passed: boolean
  regression: number
  tolerance: number
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!
}

export function compareStylexBenchmark(
  current: StylexBenchmarkResult,
  baseline: StylexBenchmarkResult,
  tolerance = 0.05,
): StylexBenchmarkComparison {
  if (
    current.schemaVersion !== baseline.schemaVersion ||
    current.corpusHash !== baseline.corpusHash
  ) {
    throw new Error('StyleX benchmark baseline uses a different schema or corpus')
  }
  const regression = current.medianMsPerPair / baseline.medianMsPerPair - 1
  return {
    passed: current.medianMsPerPair <= baseline.medianMsPerPair * (1 + tolerance),
    regression,
    tolerance,
  }
}

export function validateStylexBenchmarkCorpus(): void {
  const compiler = createCompiler()
  for (const component of compiler.compile(STYLEX_BENCHMARK_SOURCE)) {
    if (component.diagnostics.length > 0) {
      throw new Error(
        `StyleX benchmark Web corpus produced diagnostics: ${JSON.stringify(component.diagnostics)}`,
      )
    }
    if (component.jsx.includes('stylex.props')) {
      throw new Error('StyleX benchmark corpus left a residual stylex.props call')
    }
  }
  for (const component of compiler.compileNative(STYLEX_BENCHMARK_SOURCE)) {
    if (component.diagnostics.some(({ code }) => code !== 'WEB_ONLY_PROPERTY_ON_NATIVE')) {
      throw new Error(
        `StyleX benchmark Native corpus produced unexpected diagnostics: ${JSON.stringify(component.diagnostics)}`,
      )
    }
    if (component.jsx.includes('stylex.props')) {
      throw new Error('StyleX benchmark corpus left a residual stylex.props call')
    }
  }
}

export function runStylexBenchmark({
  iterationsPerSample = 200,
  samples = 9,
  warmupIterations = 100,
}: {
  iterationsPerSample?: number
  samples?: number
  warmupIterations?: number
} = {}): StylexBenchmarkResult {
  if (iterationsPerSample < 1 || samples < 1 || warmupIterations < 0) {
    throw new Error('StyleX benchmark iteration counts must be positive')
  }
  const compiler = createCompiler()
  const compilePair = () => {
    compiler.compile(STYLEX_BENCHMARK_SOURCE)
    compiler.compileNative(STYLEX_BENCHMARK_SOURCE)
  }
  for (let iteration = 0; iteration < warmupIterations; iteration += 1) compilePair()

  const timings: number[] = []
  for (let sample = 0; sample < samples; sample += 1) {
    const started = performance.now()
    for (let iteration = 0; iteration < iterationsPerSample; iteration += 1) compilePair()
    timings.push((performance.now() - started) / iterationsPerSample)
  }
  const medianMsPerPair = median(timings)
  return {
    schemaVersion: 1,
    corpusHash: createHash('sha256').update(STYLEX_BENCHMARK_SOURCE).digest('hex'),
    iterationsPerSample,
    samples,
    medianMsPerPair,
    pairsPerSecond: 1000 / medianMsPerPair,
  }
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index < 0 ? undefined : process.argv[index + 1]
}

function main(): void {
  validateStylexBenchmarkCorpus()
  const result = runStylexBenchmark()
  const output = `${JSON.stringify(result, null, 2)}\n`
  const outputPath = argument('--output')
  if (outputPath) writeFileSync(resolve(outputPath), output)
  process.stdout.write(output)

  const baselinePath = argument('--compare')
  if (!baselinePath) return
  const baseline = JSON.parse(readFileSync(resolve(baselinePath), 'utf8')) as StylexBenchmarkResult
  const comparison = compareStylexBenchmark(result, baseline)
  process.stdout.write(`${JSON.stringify(comparison, null, 2)}\n`)
  if (!comparison.passed) process.exitCode = 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main()
