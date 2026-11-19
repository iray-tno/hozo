// Loaded with --require into the real `expo export` (or Metro CLI) process by
// measure-metro-late-edges.mjs. It wraps the app's Metro config so that every
// resolution the build makes is recorded, and computes the declaration closure
// from the first resolver context the build hands out: the earliest point a
// config-time capture could use. Nothing a build returns is changed.

const Module = require('node:module')
const path = require('node:path')
const { readFileSync, writeFileSync } = require('node:fs')
const { performance } = require('node:perf_hooks')

const env = process.env
const output = env.HOZO_LATE_EDGES_OUT
const appRoot = env.HOZO_LATE_EDGES_APP
const platform = env.HOZO_LATE_EDGES_PLATFORM
const entry = env.HOZO_LATE_EDGES_ENTRY
const configFile = path.join(appRoot, 'metro.config.js')
const collector = path.resolve(__dirname, '../packages/metro/src/owner-manifest-preflight.ts')

const resolutions = []
let closure = null
let preflight = null

const { closureVariant } = require('./late-edges-closure.cjs')
const {
  declaredFields,
  descends,
  locateSync: locate,
  variant,
} = closureVariant(env.HOZO_LATE_EDGES_VARIANT)

function declarationClosure(context, delegate, origin) {
  const started = performance.now()
  const roots = []
  const failures = []
  let edges = 0
  const queue = [origin]
  const visited = new Set()
  while (queue.length) {
    const from = queue.shift()
    const owner = context.getPackageForModule?.(from)
    if (!owner) {
      failures.push({ from, name: null, error: 'no package owner' })
      continue
    }
    if (visited.has(owner.rootPath)) continue
    visited.add(owner.rootPath)
    roots.push(owner.rootPath)
    const json = JSON.parse(readFileSync(path.join(owner.rootPath, 'package.json'), 'utf8'))
    const names = new Set()
    if (descends(roots.length === 1, json))
      for (const field of declaredFields(roots.length === 1))
        for (const name of Object.keys(json[field] ?? {})) names.add(name)
    for (const name of [...names].sort()) {
      edges++
      const found = locate((specifier) => {
        const result = delegate({ ...context, originModulePath: from }, specifier, platform)
        if (result.type !== 'sourceFile') throw new Error(`resolved as ${result.type}`)
        return result.filePath
      }, name)
      if (found.file) queue.push(found.file)
      else failures.push({ from: json.name, name, error: found.error })
    }
  }
  return { roots, edges, failures, ms: performance.now() - started }
}

function measure(config) {
  const upstream = config.resolver.resolveRequest
  const delegate = (context, name, target) =>
    upstream ? upstream(context, name, target) : context.resolveRequest(context, name, target)
  return {
    ...config,
    resolver: {
      ...config.resolver,
      resolveRequest(context, name, target) {
        if (!closure && target === platform) {
          const origin = path.resolve(appRoot, entry)
          closure = declarationClosure(context, delegate, origin)
          const { collectMetroOwnerPreflight } = require(collector)
          const started = performance.now()
          const result = collectMetroOwnerPreflight(context, delegate, {
            platform,
            epoch: 'measure',
            origins: [origin],
          })
          preflight = {
            status: result.status,
            reason: result.reason ?? null,
            issues: result.issues ?? [],
            routes: result.routes?.length ?? null,
            ms: performance.now() - started,
          }
        }
        const result = delegate(context, name, target)
        if (target === platform)
          resolutions.push([context.originModulePath, name, result.type, result.filePath ?? null])
        return result
      },
    },
  }
}

const load = Module._load
Module._load = function (request, parent, isMain, ...rest) {
  const exported = load.call(this, request, parent, isMain, ...rest)
  let file
  try {
    file = Module._resolveFilename(request, parent, isMain)
  } catch {
    return exported
  }
  if (path.resolve(file) !== configFile) return exported
  Module._load = load
  return Promise.resolve(exported).then(measure)
}

process.on('exit', () => {
  if (closure) writeFileSync(output, JSON.stringify({ variant, closure, preflight, resolutions }))
})
