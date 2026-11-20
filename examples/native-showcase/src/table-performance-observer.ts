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
  rowIndices: Set<number>
}

// Only the isolated diagnostic story installs a sample. The generated Table
// keeps its own hooks, tree, measurement algorithm and text unchanged.
export const tablePerformanceProbe = {
  sample: null as TableSample | null,
  list: null as null | {
    scrollToIndex: (options: { index: number; animated: boolean; viewPosition: number }) => void
    scrollToOffset: (options: { offset: number; animated: boolean }) => void
  },
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
  row(index?: number) {
    const sample = this.sample
    if (!sample) return
    sample.rows++
    if (index !== undefined) sample.rowIndices.add(index)
    sample.mountedRows++
    sample.peakRows = Math.max(sample.peakRows, sample.rows)
    return () => {
      sample.rows--
      if (index !== undefined) sample.rowIndices.delete(index)
    }
  },
  cellLayout(key: string) {
    const sample = this.sample
    if (!sample) return
    sample.cellLayouts++
    sample.laidOutCells.add(key)
  },
}
