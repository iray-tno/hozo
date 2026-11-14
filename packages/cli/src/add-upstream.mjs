// The `@hozo/ui` a copy was made from, for `hozo add --diff` and `--update`
// (RFC 012 §6): the installed package when the versions match; otherwise a
// copy kept under `node_modules/.hozo/upstream`, fetched from the registry
// once per version. Without either, the caller says so and shows the
// two-way comparison it can.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'

const PACKAGE = '@hozo/ui'

function cacheDir(project, version) {
  return path.join(project, 'node_modules', '.hozo', 'upstream', `${PACKAGE}@${version}`)
}

const reader = (root) => (file) => {
  const absolute = path.join(root, file)
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : undefined
}

/** The files of a package tarball under `package/src/`, by their path from `package/`. */
export function untarSources(gzipped) {
  const tar = gunzipSync(gzipped)
  const files = new Map()
  const text = (start, length) => {
    const raw = tar.subarray(start, start + length)
    const end = raw.indexOf(0)
    return raw.subarray(0, end === -1 ? raw.length : end).toString('utf8')
  }
  let longName
  for (let offset = 0; offset + 512 <= tar.length; ) {
    const header = tar.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) break
    const size = Number.parseInt(text(offset + 124, 12).trim() || '0', 8)
    const type = String.fromCharCode(header[156] || 48)
    const prefix = text(offset + 345, 155)
    let name = longName ?? (prefix ? `${prefix}/${text(offset, 100)}` : text(offset, 100))
    longName = undefined
    const body = tar.subarray(offset + 512, offset + 512 + size)
    if (type === 'L') longName = body.toString('utf8').replace(/\0+$/, '')
    else if (type === 'x') {
      const pathRecord = /\d+ path=([^\n]*)\n/.exec(body.toString('utf8'))
      if (pathRecord) longName = pathRecord[1]
    } else if (type === '0' || type === '\0') {
      name = name.replace(/^[^/]+\//, '')
      if (name.startsWith('src/')) files.set(name, body.toString('utf8'))
    }
    offset += 512 + Math.ceil(size / 512) * 512
  }
  return files
}

async function fromRegistry(version, fetchImpl, registry) {
  const base = registry.endsWith('/') ? registry : `${registry}/`
  const meta = await fetchImpl(`${base}${PACKAGE.replace('/', '%2f')}/${version}`)
  if (!meta.ok) throw new Error(`the registry answered ${meta.status} for ${PACKAGE}@${version}`)
  const tarball = (await meta.json()).dist?.tarball
  if (!tarball) throw new Error(`the registry gave no tarball for ${PACKAGE}@${version}`)
  const response = await fetchImpl(tarball)
  if (!response.ok) throw new Error(`the tarball download answered ${response.status}`)
  return untarSources(Buffer.from(await response.arrayBuffer()))
}

/**
 * `{ read(file), source }` for `@hozo/ui` at `version`, where `file` is a
 * path from the package root (`src/button.tsx`) and `source` says where it
 * came from; or `{ source: 'unavailable', reason }`.
 */
export async function upstreamAt(project, ui, version, options = {}) {
  if (version === ui.version) return { read: reader(ui.root), source: 'installed' }
  const dir = cacheDir(project, version)
  if (existsSync(dir)) return { read: reader(dir), source: 'cache' }
  const fetchImpl = options.fetch ?? globalThis.fetch
  const registry =
    options.registry ?? process.env.npm_config_registry ?? 'https://registry.npmjs.org/'
  try {
    const files = await fromRegistry(version, fetchImpl, registry)
    for (const [file, text] of files) {
      mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
      writeFileSync(path.join(dir, file), text)
    }
    return { read: reader(dir), source: 'registry' }
  } catch (error) {
    return { source: 'unavailable', reason: error.message }
  }
}
