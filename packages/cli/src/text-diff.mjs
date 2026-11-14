// A line diff, as `diff -u` prints it. Small and dependency-free: the inputs
// are single source files, so a longest-common-subsequence table is enough.

function lines(text) {
  const parts = text.split('\n')
  if (parts.at(-1) === '') parts.pop()
  return parts
}

/** Each line of `a` and `b` as kept (` `), removed (`-`) or added (`+`). */
export function lineDiff(a, b) {
  const x = lines(a)
  const y = lines(b)
  // Trim the common head and tail first: most of a file is unchanged.
  let start = 0
  while (start < x.length && start < y.length && x[start] === y[start]) start += 1
  let endX = x.length
  let endY = y.length
  while (endX > start && endY > start && x[endX - 1] === y[endY - 1]) {
    endX -= 1
    endY -= 1
  }
  const n = endX - start
  const m = endY - start
  const width = m + 1
  const table = new Uint32Array((n + 1) * width)
  for (let i = n - 1; i >= 0; i -= 1)
    for (let j = m - 1; j >= 0; j -= 1)
      table[i * width + j] =
        x[start + i] === y[start + j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1])
  const ops = x.slice(0, start).map((line) => [' ', line])
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && x[start + i] === y[start + j]) {
      ops.push([' ', x[start + i]])
      i += 1
      j += 1
    } else if (j < m && (i === n || table[i * width + j + 1] >= table[(i + 1) * width + j])) {
      ops.push(['+', y[start + j]])
      j += 1
    } else {
      ops.push(['-', x[start + i]])
      i += 1
    }
  }
  for (const line of x.slice(endX)) ops.push([' ', line])
  return ops
}

/** A unified diff of `a` → `b` with `context` lines, or `''` when they are equal. */
export function unifiedDiff(nameA, nameB, a, b, context = 3) {
  const ops = lineDiff(a, b)
  if (!ops.some(([kind]) => kind !== ' ')) return ''
  const out = [`--- ${nameA}`, `+++ ${nameB}`]
  let index = 0
  // Line numbers of ops[k] in a and b, before it.
  const before = []
  let lineA = 1
  let lineB = 1
  for (const [kind] of ops) {
    before.push([lineA, lineB])
    if (kind !== '+') lineA += 1
    if (kind !== '-') lineB += 1
  }
  while (index < ops.length) {
    while (index < ops.length && ops[index][0] === ' ') index += 1
    if (index === ops.length) break
    const first = Math.max(0, index - context)
    let last = index
    // Extend while the next change is within two contexts of this one.
    for (let k = index; k < ops.length; k += 1) {
      if (ops[k][0] !== ' ') last = k
      else if (k - last > 2 * context) break
    }
    const end = Math.min(ops.length, last + context + 1)
    const hunk = ops.slice(first, end)
    const countA = hunk.filter(([kind]) => kind !== '+').length
    const countB = hunk.filter(([kind]) => kind !== '-').length
    const [startA, startB] = before[first]
    out.push(
      `@@ -${countA === 0 ? startA - 1 : startA},${countA} +${countB === 0 ? startB - 1 : startB},${countB} @@`,
      ...hunk.map(([kind, line]) => `${kind}${line}`),
    )
    index = end
  }
  return `${out.join('\n')}\n`
}
