// A declared class helper reaches the worker's compiler (#964): from
// `withHozo`'s options, through metro.json, to a compiled Native style.

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { getCacheKey, transform, withHozo } from './index.ts'

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

const UTILS = `import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }
`

/** A project with shadcn's `cn` behind a tsconfig `@/` alias, on disk. */
async function detected(options: Parameters<typeof withHozo>[1]) {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-metro-found-'))
  try {
    mkdirSync(path.join(root, 'src', 'lib'), { recursive: true })
    writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['./src/*'] } } }),
    )
    writeFileSync(path.join(root, 'src', 'lib', 'utils.ts'), UTILS)
    const item = path.join(root, 'src', 'Item.tsx')
    writeFileSync(item, ITEM)
    const upstream = path.join(root, 'upstream.cjs')
    writeFileSync(upstream, 'module.exports = { transform: (params) => params.src }\n')
    await withHozo(
      { projectRoot: root, transformer: { babelTransformerPath: upstream } },
      { root, ...options },
    )
    const output = (await transform({
      src: ITEM,
      filename: item,
      options: { projectRoot: root, platform: 'ios' },
    })) as string
    return { output, key: getCacheKey({ projectRoot: root }) }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test("shadcn/ui's cn is found through the tsconfig alias, with no declaration", async () => {
  const found = await detected({})
  assert.match(found.output, /hozo\w*_pressed:/)
  assert.match(found.output, /hozoClasses\(className, /)
  // Undone by a declaration, and the cache key says the output changed.
  const refused = await detected({
    classHelpers: [{ module: '@/lib/utils', name: 'cn', recognize: false }],
  })
  assert.doesNotMatch(refused.output, /hozo\w*_pressed:/)
  assert.notEqual(found.key, refused.key)
})
