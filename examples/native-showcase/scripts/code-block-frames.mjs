import assert from 'node:assert/strict'

export function assertReusableCodeInputs(changed) {
  const allowed =
    /^(docs\/|apps\/landing\/src\/content\/docs\/|examples\/native-showcase\/README\.md$|examples\/native-showcase\/scripts\/code-block-(performance|frames|frames\.test)\.mjs$)/
  assert.deepEqual(
    changed.filter((name) => !allowed.test(name)),
    [],
    'reused APK has different application/build inputs',
  )
}

export function frameSummary(dump, refreshHz) {
  assert.ok(Number.isFinite(refreshHz) && refreshHz > 0, 'missing display refresh rate')
  const budgetMs = 1000 / refreshHz
  const rows = []
  let columns
  for (const raw of dump.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith('Flags,')) {
      columns = line.split(',')
      for (const key of ['Flags', 'IntendedVsync', 'FrameCompleted'])
        assert.ok(columns.includes(key), `missing ${key} frame field`)
    } else if (columns && /^\d+,/.test(line)) {
      const values = line.split(',')
      const field = (name) => BigInt(values[columns.indexOf(name)])
      const flags = Number(field('Flags'))
      const intended = field('IntendedVsync')
      const completed = field('FrameCompleted')
      const pending = completed === 9223372036854775807n || completed <= intended
      rows.push({ flags, pending, durationMs: pending ? null : Number(completed - intended) / 1e6 })
    } else if (line.includes('---PROFILEDATA---')) columns = undefined
  }
  assert.ok(rows.length > 0, 'no frame rows: an empty measurement is not a pass')
  const durations = rows
    .filter((row) => !row.pending && row.flags === 0)
    .map((row) => row.durationMs)
    .sort((a, b) => a - b)
  assert.ok(durations.length > 0, 'no ordinary completed frames')
  const percentile = (fraction) => durations[Math.ceil(durations.length * fraction) - 1]
  const total = dump.match(/Total frames rendered:\s*(\d+)/)
  const janky = dump.match(/Janky frames:\s*(\d+)\s*\(([\d.]+)%\)/)
  return {
    refreshHz,
    budgetMs,
    rows,
    ordinaryFrames: durations.length,
    flaggedFrames: rows.filter((row) => row.flags !== 0).length,
    pendingFrames: rows.filter((row) => row.pending).length,
    overBudgetFrames: durations.filter((duration) => duration > budgetMs).length,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    maxMs: durations.at(-1),
    aggregate:
      total && janky
        ? { total: Number(total[1]), janky: Number(janky[1]), jankyPercent: Number(janky[2]) }
        : null,
    // gfxinfo retains a bounded recent-frame ring. Its all-window aggregate
    // must accompany the raw rows; a saturated ring cannot stand for all frames.
    recentWindowOnly: !total || Number(total[1]) > rows.length,
  }
}

export function timingRecords(log) {
  const chunks = log.split(/\r?\n/).flatMap((line) => {
    const at = line.indexOf('[Hozo CodeBlock raf]')
    return at < 0 ? [] : [JSON.parse(line.slice(at + '[Hozo CodeBlock raf]'.length).trim())]
  })
  return log.split(/\r?\n/).flatMap((line) => {
    const at = line.indexOf('[Hozo CodeBlock timing]')
    if (at < 0) return []
    const payload = line.slice(at + '[Hozo CodeBlock timing]'.length).trim()
    const result = JSON.parse(payload)
    if (result.rafChunks !== undefined) {
      const parts = chunks
        .filter((chunk) => chunk.name === result.name)
        .sort((a, b) => a.chunk - b.chunk)
      assert.equal(parts.length, result.rafChunks, 'raw JS frame chunks missing')
      assert.deepEqual(
        parts.map((part) => part.chunk),
        Array.from({ length: parts.length }, (_, index) => index),
        'duplicate or missing JS frame chunk',
      )
      result.rafGapsMs = parts.flatMap((part) => part.gaps)
      assert.equal(result.rafGapsMs.length, result.rafCount, 'raw JS frame samples missing')
    }
    return [result]
  })
}
