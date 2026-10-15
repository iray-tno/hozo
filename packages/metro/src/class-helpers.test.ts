// A declared class helper reaches the worker's compiler (#964): from
// `withHozo`'s options, through metro.json, to a compiled Native style.

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { transform, withHozo } from './index.ts'

const ITEM = `import { Pressable } from '@hozo/core'
import { cn } from '@/lib/utils'
export const Item = ({ className }) => <Pressable className={cn('p-4 active:opacity-80', className)} />
`

async function compiled(options: Parameters<typeof withHozo>[1]) {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-metro-helpers-'))
  try {
    mkdirSync(path.join(root, 'src'))
    const upstream = path.join(root, 'upstream.cjs')
    writeFileSync(upstream, 'module.exports = { transform: (params) => params.src }\n')
    await withHozo(
      { projectRoot: root, transformer: { babelTransformerPath: upstream } },
      { root, ...options },
    )
    return (await transform({
      src: ITEM,
      filename: path.join(root, 'src', 'Item.tsx'),
      options: { projectRoot: root, platform: 'ios' },
    })) as string
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test("a declared helper keeps the pressable's own pressed style", async () => {
  const declared = await compiled({ classHelpers: [{ module: '@/lib/utils', name: 'cn' }] })
  assert.match(declared, /hozo\w*_pressed:/)
  assert.match(declared, /hozoClasses\(className, /)
  const undeclared = await compiled({})
  assert.doesNotMatch(undeclared, /hozo\w*_pressed:/)
})
