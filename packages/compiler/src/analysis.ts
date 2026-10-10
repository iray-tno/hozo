import path from 'node:path'
import { performance } from 'node:perf_hooks'
import {
  contextVerdict,
  type StylexContextAnalyzer,
  type StylexContextVerdict,
} from './analysis-context.ts'
import { type ReactNativeImportAnalysis, reactNativeImportJournal } from './analysis-rn.ts'
import {
  type ReactNativeReferenceAnalysis,
  reactNativeReferenceJournal,
} from './analysis-rn-references.ts'
import { type ReactNativeValueAnalysis, reactNativeValueJournal } from './analysis-rn-values.ts'
import { lowerCanvasPaints } from './canvas.ts'
import { diagnoseStaticFonts, type FontAvailability } from './font-diagnostics.ts'
import type {
  CompileDiagnostic,
  CompiledNativeModule,
  Compiler,
  ReactNativeUsage,
  StylexModuleSource,
} from './index.ts'
import { analyzeReactNativeUsage } from './index.ts'
import { type LowerModuleOptions, lowerModule } from './lower.ts'
import { semanticModuleEligible } from './project.ts'
import type { StylexModuleCache } from './stylex-project.ts'

export { REQUIRED_CONTEXT_POLICY, type StylexContextVerdict } from './analysis-context.ts'
export {
  AnalysisFontInputError,
  FONT_ANALYSIS_POLICY,
  validateFontAvailability,
} from './analysis-fonts.ts'
export {
  type AnalysisProjectFacts,
  type AnalysisProjectOptions,
  type AnalysisThemeInput,
  prepareAnalysisProject,
} from './analysis-project.ts'
export type { ReactNativeMemberContract } from './analysis-rn-contracts.ts'
export { discoverAnalysisSources, sourcePlatform } from './analysis-sources.ts'
export { type AnalysisPlatform, prepareAnalysisStylex } from './analysis-stylex.ts'
export type { FontAvailability } from './font-diagnostics.ts'

export type AnalysisBackend = 'source' | 'web' | 'native'

/** Absence and inability to investigate must never become the same project fact. */
export type ProjectFact<T> =
  | { status: 'resolved'; value: T; origin: 'explicit' | 'discovered' }
  | { status: 'defaulted'; value: T; reason: string }
  | { status: 'absent'; reason: string }
  | { status: 'unresolved' | 'unsupported' | 'invalid'; reason: string }

export interface AnalysisFinding {
  backend: AnalysisBackend
  stage: string
  code: string
  severity: string
  message: string
  location:
    | { status: 'authored'; spanStart: number; spanEnd: number; line: number; column: number }
    | { status: 'unmapped'; spanStart: number; spanEnd: number; reason: string }
    | { status: 'file' }
  /** Evidence anchor, not a promise that duplicate occurrences have unique identities. */
  subject?: { kind: 'diagnostic-span'; snippet: string }
}

export interface AnalysisStage {
  backend: AnalysisBackend
  stage: string
  status: 'completed' | 'failed'
  durationMs: number
}

export interface TargetAnalysis {
  status: 'completed' | 'failed'
  mode: 'web-module-lowering' | 'native-compiler-probe'
  semanticComponents: number
  integrationEligibility?: 'semantic-module' | 'runtime-imports-only' | 'compiler-probe-only'
  platform?: 'web' | 'ios' | 'android'
  stylexContext?: StylexContextVerdict
  transformed?: boolean
  /** Available only for the actual Web module path, not a fabricated Native module. */
  code?: string
  directReactNativeJsxResidue?: string[]
  reactNativeImports?: ReactNativeImportAnalysis
  reactNativeReferences?: ReactNativeReferenceAnalysis
  reactNativeValues?: ReactNativeValueAnalysis
}

export interface ModuleAnalysis {
  reactNativeUsage?: ReactNativeUsage & { status: 'completed' | 'failed' }
  bindings?: Pick<CompiledNativeModule, 'imports' | 'jsxBindings' | 'foreignPrimitives'>
  targets: Partial<Record<'web' | 'native', TargetAnalysis>>
  findings: AnalysisFinding[]
  stages: AnalysisStage[]
}

export interface AnalyzeModuleOptions {
  compiler: Compiler
  file: string
  root: string
  targets: readonly ('web' | 'native')[]
  stylexModules?: StylexModuleCache
  stylexContexts?: Partial<Record<'web' | 'ios' | 'android', StylexModuleCache>>
  /** Immutable registry inputs from project preparation; never rebuild per file. */
  stylexRegistries?: Partial<Record<'web' | 'ios' | 'android', StylexModuleSource[]>>
  /** Compiler-owned prepared resolver/reference evidence; no audit-side graph reconstruction. */
  stylexContextAnalysis?: StylexContextAnalyzer
  nativePlatform?: 'ios' | 'android'
  fontAvailability?: FontAvailability
  unloweredReactNativeJsx?: LowerModuleOptions['unloweredReactNativeJsx']
}

/**
 * The compiler owns pipeline accounting. Consumers must not reconstruct it from
 * unrelated compile calls: that lost Canvas and import diagnostics in audit.
 *
 * This first contract deliberately does not promise a single parse, a prepared
 * project graph, member-level RN compatibility, or full Metro module rewriting.
 */
export function analyzeModule(source: string, options: AnalyzeModuleOptions): ModuleAnalysis {
  const { compiler, file, root, stylexModules } = options
  const nativePlatform =
    (file.match(/\.(ios|android)\.[^.]+$/)?.[1] as 'ios' | 'android' | undefined) ??
    options.nativePlatform ??
    'android'
  const webGraph = options.stylexContexts?.web ?? stylexModules
  const nativeGraph = options.stylexContexts?.[nativePlatform] ?? stylexModules
  const usesStylex = source.includes('@stylexjs/stylex')
  const activate = (graph: StylexModuleCache | undefined, platform: 'web' | 'ios' | 'android') => {
    if (graph && usesStylex)
      compiler.setStylexModules(options.stylexRegistries?.[platform] ?? graph.moduleSources())
  }
  activate(
    options.targets.includes('native') ? nativeGraph : webGraph,
    options.targets.includes('native') ? nativePlatform : 'web',
  )
  const result: ModuleAnalysis = { targets: {}, findings: [], stages: [] }
  const seen = new Set<string>()

  function collect(
    backend: AnalysisBackend,
    stage: string,
    diagnostics: readonly CompileDiagnostic[],
    input?: string,
  ) {
    for (const diagnostic of diagnostics) {
      // Stage is not identity: one true occurrence can be exposed by two stages.
      // Input text IS identity until a source map can join transformed coordinates.
      const key = JSON.stringify([
        backend,
        diagnostic.code,
        diagnostic.severity,
        diagnostic.message,
        diagnostic.spanStart,
        diagnostic.spanEnd,
        input,
      ])
      if (seen.has(key)) continue
      seen.add(key)
      const finding: AnalysisFinding = {
        backend,
        stage,
        code: diagnostic.code,
        severity: diagnostic.severity,
        message: diagnostic.message,
        location: { status: 'file' },
      }
      const { spanStart, spanEnd } = diagnostic
      if (input !== undefined && (spanStart !== 0 || spanEnd !== 0)) {
        if (
          input === source &&
          spanStart >= 0 &&
          spanEnd >= spanStart &&
          spanEnd <= source.length
        ) {
          // NAPI has already converted Rust byte spans to UTF-16 offsets.
          const before = source.slice(0, spanStart)
          const lastNewline = before.lastIndexOf('\n')
          finding.location = {
            status: 'authored',
            spanStart,
            spanEnd,
            line: before.split('\n').length,
            column: spanStart - lastNewline,
          }
          finding.subject = {
            kind: 'diagnostic-span',
            snippet: source.slice(spanStart, spanEnd).replace(/\s+/g, ' ').trim(),
          }
        } else {
          finding.location = {
            status: 'unmapped',
            spanStart,
            spanEnd,
            reason:
              input !== source
                ? 'Diagnostic coordinates belong to rewritten input; no authored source map yet.'
                : 'Compiler span falls outside authored source.',
          }
        }
      }
      result.findings.push(finding)
    }
  }

  function run<T>(backend: AnalysisBackend, stage: string, action: () => T): T | undefined {
    const started = performance.now()
    let status: AnalysisStage['status'] = 'completed'
    try {
      return action()
    } catch (error) {
      status = 'failed'
      collect(backend, stage, [
        {
          code: 'ANALYSIS_FAILED',
          severity: 'error',
          message: error instanceof Error ? error.message : String(error),
          spanStart: 0,
          spanEnd: 0,
        },
      ])
      return undefined
    } finally {
      result.stages.push({ backend, stage, status, durationMs: performance.now() - started })
    }
  }

  // The current metadata API also prepares Native components. Its diagnostics
  // are not a Native verdict when only Web was requested. Slice 4 will expose
  // richer binding/rewrite metadata rather than inferring it from printed code.
  const original = run('source', 'bindings', () =>
    compiler.compileNativeModule(
      source,
      usesStylex
        ? (options.targets.includes('native') ? nativeGraph : webGraph)?.bindingsFor(
            path.resolve(file),
          )
        : undefined,
      file,
    ),
  )
  if (original && original.syntaxDiagnostics.length > 0) {
    collect('source', 'syntax', original.syntaxDiagnostics, source)
    // Recovery ASTs are inventory, not successful lowering. Do not interpret
    // missing recovered JSX as a clean RN boundary or run target transforms.
    result.stages.push({ backend: 'source', stage: 'syntax', status: 'failed', durationMs: 0 })
    for (const backend of new Set(options.targets)) {
      result.targets[backend] = {
        status: 'failed',
        mode: backend === 'web' ? 'web-module-lowering' : 'native-compiler-probe',
        semanticComponents: 0,
        integrationEligibility: semanticModuleEligible(file, backend)
          ? 'semantic-module'
          : backend === 'web'
            ? 'runtime-imports-only'
            : 'compiler-probe-only',
        platform: backend === 'web' ? 'web' : nativePlatform,
      }
    }
    return result
  }
  if (original) {
    result.bindings = {
      imports: original.imports,
      jsxBindings: original.jsxBindings,
      foreignPrimitives: original.foreignPrimitives,
    }
  }

  const requiredContext = (platform: 'web' | 'ios' | 'android') => {
    if (!original)
      return contextVerdict(source, platform, 'unresolved', ['Source binding analysis failed.'])
    // The byte gate only optimizes registry activation. Absence of a context
    // requirement comes from the compiler's actual runtime ESM import table.
    if (!original.imports.some(({ source }) => source === '@stylexjs/stylex'))
      return contextVerdict(source, platform, 'not-required')
    return (
      options.stylexContextAnalysis?.(file, platform, source) ??
      contextVerdict(source, platform, 'unresolved', [
        'Prepared StyleX reference/resolution evidence was not supplied.',
      ])
    )
  }

  // Inventory is authored evidence. Never infer RN binding use from emitted
  // text, and keep it distinct from the next slice's actual rewrite decisions.
  const usage = run('source', 'rn-usage', () => analyzeReactNativeUsage(source, file))
  if (usage) {
    collect('source', 'rn-usage', usage.diagnostics, source)
    result.reactNativeUsage = {
      ...usage,
      status: usage.diagnostics.length === 0 ? 'completed' : 'failed',
    }
    if (usage.diagnostics.length > 0) result.stages.at(-1)!.status = 'failed'
  }

  if (options.targets.includes('web')) {
    activate(webGraph, 'web')
    const target: TargetAnalysis = {
      status: 'completed',
      mode: 'web-module-lowering',
      semanticComponents: 0,
      integrationEligibility: semanticModuleEligible(file, 'web')
        ? 'semantic-module'
        : 'runtime-imports-only',
      platform: 'web',
      stylexContext: run('web', 'required-context', () => requiredContext('web')),
    }
    result.targets.web = target
    const importJournal = reactNativeImportJournal(
      source,
      result.reactNativeUsage,
      (options.unloweredReactNativeJsx ?? 'warn') !== 'allow',
    )
    const referenceJournal = reactNativeReferenceJournal(source, result.reactNativeUsage)
    const valueJournal = reactNativeValueJournal(source, result.reactNativeUsage)
    run('web', 'module-lowering', () => {
      const observed = new Set<CompileDiagnostic>()
      const lowered = lowerModule(source, file, file, compiler, root, webGraph, {
        unloweredReactNativeJsx: options.unloweredReactNativeJsx ?? 'warn',
        observe: (event) => {
          for (const diagnostic of event.diagnostics) observed.add(diagnostic)
          collect('web', event.stage, event.diagnostics, event.source)
          if (event.components) target.semanticComponents = event.components.length
          if (event.components && options.fontAvailability) {
            run('web', 'fonts', () =>
              collect(
                'web',
                'fonts',
                event.components!.flatMap((component) =>
                  diagnoseStaticFonts(
                    component.css,
                    'web',
                    options.fontAvailability,
                    component.spanStart,
                    component.spanEnd,
                  ),
                ),
                event.source,
              ),
            )
          }
          if (event.source !== undefined) {
            if (event.edits) {
              referenceJournal.edits(event.source, event.edits)
              valueJournal.edits(event.source, event.edits)
            }
            if (event.components) referenceJournal.semantic(event.source, event.components)
          }
          if (event.importDecisions && event.source !== undefined) {
            importJournal.record(event.source, event.importDecisions)
          }
        },
      })
      // Future module diagnostics remain visible even before a stage gains
      // richer provenance. Never guess authored coordinates for that fallback.
      for (const diagnostic of lowered?.diagnostics ?? []) {
        if (!observed.has(diagnostic)) {
          collect('web', 'module-lowering', [diagnostic], '')
        }
      }
      target.code = lowered?.code ?? source
      target.transformed = target.code !== source
    })
    if (target.code === undefined) target.status = 'failed'
    else {
      const residue = run('web', 'jsx-residue', () => {
        const emitted = compiler.compileNativeModule(target.code!, undefined, file)
        if (emitted.syntaxDiagnostics.length > 0) {
          collect(
            'web',
            'jsx-residue',
            emitted.syntaxDiagnostics.map((diagnostic) => ({
              ...diagnostic,
              code: 'LOWERED_SYNTAX_ERROR',
            })),
            target.code,
          )
          throw new Error(
            'Rewritten Web output has parser-reported syntax errors; residue is not assessed.',
          )
        }
        const used = new Set(emitted.jsxBindings)
        return emitted.imports
          .filter((entry) => entry.source === 'react-native' && used.has(entry.local))
          .map((entry) => entry.local)
      })
      if (residue) target.directReactNativeJsxResidue = [...new Set(residue)]
      else target.status = 'failed'
    }
    target.reactNativeImports = importJournal.finish(target.status === 'completed')
    target.reactNativeReferences = referenceJournal.finish(target.status === 'completed')
    target.reactNativeValues = valueJournal.finish(
      target.code,
      target.reactNativeImports,
      target.status === 'completed',
    )
  }

  if (options.targets.includes('native')) {
    activate(nativeGraph, nativePlatform)
    const target: TargetAnalysis = {
      status: 'completed',
      mode: 'native-compiler-probe',
      semanticComponents: 0,
      integrationEligibility: semanticModuleEligible(file, 'native')
        ? 'semantic-module'
        : 'compiler-probe-only',
      platform: nativePlatform,
      stylexContext: run('native', 'required-context', () => requiredContext(nativePlatform)),
    }
    result.targets.native = target
    const canvas = run('native', 'canvas', () => lowerCanvasPaints(source, compiler, true))
    if (canvas) {
      collect('native', 'canvas', canvas.diagnostics, source)
      const module = run('native', 'semantic', () => {
        if (canvas.code === source && original) return original
        return compiler.compileNativeModule(
          canvas.code,
          usesStylex ? nativeGraph?.bindingsFor(path.resolve(file)) : undefined,
          file,
        )
      })
      if (module) {
        if (module.syntaxDiagnostics.length > 0) {
          collect(
            'native',
            'semantic',
            module.syntaxDiagnostics.map((diagnostic) => ({
              ...diagnostic,
              code: 'LOWERED_SYNTAX_ERROR',
            })),
            canvas.code,
          )
          target.status = 'failed'
        } else target.semanticComponents = module.components.length
        collect(
          'native',
          'semantic',
          module.components.flatMap((entry) => entry.diagnostics),
          canvas.code,
        )
        if (options.fontAvailability && module.syntaxDiagnostics.length === 0) {
          run('native', 'fonts', () =>
            collect(
              'native',
              'fonts',
              module.components.flatMap((component) =>
                diagnoseStaticFonts(
                  component.styles,
                  'native',
                  options.fontAvailability,
                  component.spanStart,
                  component.spanEnd,
                  nativePlatform,
                ),
              ),
              canvas.code,
            ),
          )
        }
      } else target.status = 'failed'
    } else target.status = 'failed'
  }
  return result
}
