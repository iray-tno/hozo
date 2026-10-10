import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { type ParseError, parse } from 'jsonc-parser'
import type { ProjectFact } from './analysis.ts'

export const CONFIGURATION_RESOLUTION_POLICY = 'checkout-static-json-extends-v1'
type AliasSettings = { base: string; explicitBaseUrl: boolean; paths: Record<string, string[]> }
type ConfigSettings = { baseUrl?: string; pathsBase: string; paths: Record<string, string[]> }
type FailureStatus = 'unresolved' | 'unsupported' | 'invalid'
class ConfigFailure extends Error {
  readonly status: FailureStatus
  constructor(status: FailureStatus, message: string) {
    super(message)
    this.status = status
  }
}
const inside = (root: string, file: string) => {
  const relative = path.relative(root, file)
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype

/** Static data only. Never use require.resolve: it can escape to the tool's own dependencies. */
export function readAnalysisAliases(root: string): {
  fact: ProjectFact<AliasSettings>
  inputs: { file: string; sha256: string }[]
} {
  root = path.resolve(root)
  const inputs: { file: string; sha256: string }[] = []
  const seen = new Set<string>()
  const recorded = new Set<string>()
  const fail = (status: FailureStatus, reason: string): never => {
    throw new ConfigFailure(status, reason)
  }
  // Validate existing ancestors before probing a child through a directory link.
  // Internal pnpm/workspace links are fine; neither names nor real paths may
  // escape the audited checkout. No outside file contents become context inputs.
  const stat = (file: string) => {
    if (!inside(root, file))
      return fail('unsupported', 'tsconfig extends outside checkout is not assessed')
    const physicalRoot = realpathSync(root)
    let current = root
    for (const part of path.relative(root, file).split(path.sep).filter(Boolean)) {
      current = path.join(current, part)
      let value: ReturnType<typeof lstatSync>
      try {
        value = lstatSync(current)
      } catch (error) {
        if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return
        throw error
      }
      if (value.isSymbolicLink() && !inside(physicalRoot, realpathSync(current)))
        return fail('unsupported', 'tsconfig extends outside checkout is not assessed')
    }
    return statSync(file)
  }
  const read = (file: string, manifest = false): Record<string, unknown> => {
    const source = readFileSync(file, 'utf8')
    if (!recorded.has(file)) {
      inputs.push({ file, sha256: createHash('sha256').update(source).digest('hex') })
      recorded.add(file)
    }
    let config: unknown
    try {
      if (manifest) config = JSON.parse(source)
      else {
        const errors: ParseError[] = []
        config = parse(source, errors, { allowTrailingComma: true })
        if (errors.length) return fail('invalid', `Invalid static tsconfig: ${file}`)
      }
    } catch (error) {
      if (error instanceof ConfigFailure) throw error
      return fail('invalid', `Invalid static package manifest: ${file}`)
    }
    // JSONC's parser assigns __proto__ through the normal object setter. A
    // changed prototype must not turn inherited settings into authored facts.
    if (!object(config)) return fail('invalid', `Invalid static configuration object: ${file}`)
    return config
  }
  const configFile = (file: string): string => {
    if (/\.(?:[cm]?[jt]sx?)$/i.test(file))
      return fail('unsupported', 'Executable tsconfig configuration is not assessed')
    if (stat(file)?.isFile()) return file
    if (!file.endsWith('.json') && stat(`${file}.json`)?.isFile()) return `${file}.json`
    return fail('unresolved', `Cannot resolve static tsconfig: ${file}`)
  }
  const resolveParent = (specifier: string, importer: string): string => {
    specifier = specifier.replaceAll('\\', '/')
    if (specifier.includes('${')) return fail('unsupported', 'tsconfig templates are not assessed')
    if (specifier.startsWith('./') || specifier.startsWith('../') || path.isAbsolute(specifier))
      return configFile(path.resolve(path.dirname(importer), specifier))
    if (!specifier || /[:?#%]/.test(specifier))
      return fail('unsupported', 'Only static local or package tsconfig extends is assessed')
    const parts = specifier.split('/')
    const nameSize = specifier.startsWith('@') ? 2 : 1
    if (
      parts.length < nameSize ||
      parts.some((part) => !part || part === '.' || part === '..') ||
      !/^(?:@[\w.-]+\/)?[\w.-]+$/.test(parts.slice(0, nameSize).join('/'))
    )
      return fail('unsupported', 'Only static local or package tsconfig extends is assessed')
    const name = parts.slice(0, nameSize).join('/')
    const subpath = parts.slice(nameSize).join('/')
    let directory = path.dirname(importer)
    for (;;) {
      if (path.basename(directory) !== 'node_modules') {
        const packageRoot = path.join(directory, 'node_modules', name)
        const present = stat(packageRoot)
        if (present) {
          if (!present.isDirectory() && !present.isSymbolicLink())
            return fail('invalid', `Invalid tsconfig package directory: ${packageRoot}`)
          const manifestFile = path.join(packageRoot, 'package.json')
          const manifest = stat(manifestFile)?.isFile() ? read(manifestFile, true) : undefined
          // Conditional/package exports are a different resolver contract. Do
          // not quietly bypass them to claim an installed config was resolved.
          if (manifest?.exports !== undefined)
            return fail('unsupported', 'Package exports for tsconfig extends are not assessed')
          const selected =
            subpath || (manifest?.tsconfig === undefined ? 'tsconfig.json' : manifest.tsconfig)
          if (typeof selected !== 'string' || !selected)
            return fail('invalid', `Invalid package tsconfig field: ${manifestFile}`)
          if (selected.includes('${'))
            return fail('unsupported', 'tsconfig templates are not assessed')
          const resolved = configFile(path.resolve(packageRoot, selected))
          // TypeScript realpaths package config results. This also lets a pnpm
          // preset find its own installed config dependency, rather than the
          // unrelated root-level package through a logical symlink spelling.
          return path.resolve(root, path.relative(realpathSync(root), realpathSync(resolved)))
        }
      }
      if (directory === root) break
      directory = path.dirname(directory)
    }
    return fail('unresolved', `tsconfig package not installed inside checkout: ${name}`)
  }
  const load = (file: string): ConfigSettings => {
    const physical = realpathSync(file)
    const identity = process.platform === 'win32' ? physical.toLowerCase() : physical
    if (seen.has(identity) || seen.size >= 32)
      return fail('invalid', 'Cyclic or excessive tsconfig extends chain')
    seen.add(identity)
    const config = read(file)
    let inherited: ConfigSettings = { pathsBase: path.dirname(file), paths: {} }
    if (config.extends !== undefined) {
      if (Array.isArray(config.extends))
        return fail('unsupported', 'Multiple tsconfig extends entries are not assessed')
      if (typeof config.extends !== 'string') return fail('invalid', 'Invalid tsconfig extends')
      inherited = load(resolveParent(config.extends, file))
    }
    const compiler = config.compilerOptions === undefined ? {} : config.compilerOptions
    if (!object(compiler)) return fail('invalid', 'Invalid tsconfig compilerOptions')
    if (compiler.baseUrl !== undefined && typeof compiler.baseUrl !== 'string')
      return fail('invalid', 'Invalid tsconfig baseUrl')
    const paths = compiler.paths === undefined ? inherited.paths : compiler.paths
    if (
      !object(paths) ||
      Object.entries(paths).some(
        ([key, values]) =>
          (key.match(/\*/g)?.length ?? 0) > 1 ||
          !Array.isArray(values) ||
          values.length === 0 ||
          values.some(
            (value) => typeof value !== 'string' || (value.match(/\*/g)?.length ?? 0) > 1,
          ),
      )
    )
      return fail('invalid', 'Invalid tsconfig paths')
    if (
      (compiler.baseUrl as string | undefined)?.includes('${') ||
      Object.entries(paths).some(([key, values]) =>
        [key, ...(values as string[])].some((value) => value.includes('${')),
      )
    )
      return fail('unsupported', 'tsconfig templates are not assessed')
    return {
      baseUrl:
        compiler.baseUrl === undefined
          ? inherited.baseUrl
          : path.resolve(path.dirname(file), compiler.baseUrl as string),
      pathsBase: compiler.paths === undefined ? inherited.pathsBase : path.dirname(file),
      paths: paths as Record<string, string[]>,
    }
  }
  try {
    const entry = path.join(root, 'tsconfig.json')
    // The caller may have supplied in-memory sources without a real checkout.
    try {
      lstatSync(root)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return { fact: { status: 'absent', reason: 'No root tsconfig.json.' }, inputs }
      throw error
    }
    if (!stat(entry))
      return { fact: { status: 'absent', reason: 'No root tsconfig.json.' }, inputs }
    const settings = load(configFile(entry))
    // TypeScript keeps pathsBasePath until final options are merged. An
    // effective baseUrl takes precedence, including a child's override;
    // otherwise paths remain relative to the config that declared them.
    const base = settings.baseUrl ?? settings.pathsBase
    return {
      fact: {
        status: 'resolved',
        origin: 'discovered',
        value: {
          base,
          explicitBaseUrl: settings.baseUrl !== undefined,
          paths: Object.fromEntries(
            Object.entries(settings.paths).map(([key, values]) => [
              key,
              values.map((value) => path.resolve(base, value)),
            ]),
          ),
        },
      },
      inputs,
    }
  } catch (error) {
    return {
      fact: {
        status: error instanceof ConfigFailure ? error.status : 'invalid',
        reason: error instanceof Error ? error.message : String(error),
      },
      inputs,
    }
  }
}
