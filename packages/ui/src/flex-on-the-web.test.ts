/**
 * A class list that lays out its children names `flex` itself.
 *
 * On React Native every View is a flex box, so `items-center` or `gap-3`
 * works with nothing else. On the Web a pattern often renders a `<span>`,
 * `<li>` or `<button>`, where those classes do nothing. Avatar, Stepper and
 * OtpInput each shipped a list that looked right on one platform: initials,
 * digits and step numbers in the top-left corner of their boxes. Found by the
 * /docs component pages, one at a time, so this checks every literal at once.
 */

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const LAYOUT = /(^|\s)(items-|justify-|gap-|flex-row|flex-col|flex-wrap)/
const BOX = /(^|\s)(flex|inline-flex|grid|inline-grid)(\s|$)/

test('every class list that arranges children says flex or grid', () => {
  // The source, not the compiled test build this runs from.
  const dir = path.join(import.meta.dirname, '..', 'src')
  const offenders: string[] = []
  for (const file of readdirSync(dir)) {
    if (!/\.tsx?$/.test(file) || file.endsWith('.test.ts')) continue
    const source = readFileSync(path.join(dir, file), 'utf8')
    for (const [, list] of source.matchAll(/'([a-z0-9:[\]/.\-\s]+)'/g)) {
      // Only whole class lists: a single token such as 'gap-2' is a value
      // being chosen between, and is appended to a list that has a box.
      if (!list?.includes(' ')) continue
      if (LAYOUT.test(list) && !BOX.test(list)) offenders.push(`${file}: ${list}`)
    }
  }
  assert.deepEqual(offenders, [])
})
