export interface TableSample {
  name: string
  mode: 'normal' | 'windowed'
  count: number
  started: number
  measurements: number
  measuredCells: Set<string>
  rows: number
  peakRows: number
  mountedRows: number
  cellLayouts: number
  laidOutCells: Set<string>
  resolvedMs: number | null
}

// Only the isolated diagnostic story installs a sample. The generated Table
// keeps its own hooks, tree, measurement algorithm and text unchanged.
export const tablePerformanceProbe = {
  sample: null as TableSample | null,
  measure(key: string) {
    const sample = this.sample
    if (!sample) return
    sample.measurements++
    sample.measuredCells.add(key)
  },
  resolved() {
    const sample = this.sample
    if (sample && sample.resolvedMs === null) sample.resolvedMs = performance.now() - sample.started
  },
  row() {
    const sample = this.sample
    if (!sample) return
    sample.rows++
    sample.mountedRows++
    sample.peakRows = Math.max(sample.peakRows, sample.rows)
    return () => {
      sample.rows--
    }
  },
  cellLayout(key: string) {
    const sample = this.sample
    if (!sample) return
    sample.cellLayouts++
    sample.laidOutCells.add(key)
  },
}
