// RFC010 preview only. No adapter imports this module or trusts shadow data
// as an audit. Discovery belongs to the parser; styles belong to the backend.
import {
  type CompileDiagnostic,
  type CompiledNativeModule,
  type Compiler,
  inspectOwnerClassSlots,
  type NativeCompileOptions,
  type PreparedModule,
  type PreparedTailwindContext,
} from './index.ts'
import { type OwnerShape, parseOwnerContractShadow } from './owner-contract.ts'

export interface OwnerCallerPreview {
  scope: 'explicit-direct-compiler-preview' | 'explicit-collected-compiler-preview'
  /** Exact emit capability, not an inferred project/manifest identity. */
  contextFingerprint?: string
  code: string
  diagnostics: CompileDiagnostic[]
  findings: {
    spanStart: number
    spanEnd: number
    disposition: 'prepared-literal' | 'retained'
    reason?: string
    /** Preparation messages have no falsely remapped synthetic-source spans. */
    notes: string[]
  }[]
}

/** @internal One explicitly selected shadow contract, not manifest lookup.
 * Literal carriers must be equivalent on every declared host shape. Stateful
 * carriers additionally require explicit input/destination declarations.
 * Expression capture and ABI/owner auditing remain separate.
 */
interface OwnerCallerOptions {
  source: string
  imported: string
  shadow: string
  sourceFile?: string
}

function preparationOptions(shape: OwnerShape): NativeCompileOptions {
  return {
    ownerStyle: true,
    ...(shape.inputs && {
      ownerFacts: shape.inputs.facts,
      ownerText: shape.inputs.splitText ? ('split' as const) : undefined,
    }),
  }
}

export function previewOwnerLiteralCallers(
  source: string,
  compiler: Compiler,
  options: OwnerCallerOptions,
): OwnerCallerPreview {
  return collectOwnerLiteralCallers(
    source,
    options,
    (input, shape) => () =>
      compiler.compileNativeModule(
        input,
        undefined,
        'OwnerPreparation.tsx',
        preparationOptions(shape),
      ),
  )()
}

/** @internal A participant in the existing finite collect/prepare/emit batch.
 * Capture owned IR before suspension; every shape consumes the supplied context.
 * No context setter, direct fallback or additional authority is installed.
 */
export function prepareOwnerLiteralCallers(
  source: string,
  compiler: Compiler,
  options: OwnerCallerOptions,
): PreparedModule<OwnerCallerPreview> {
  const owned: PreparedModule<CompiledNativeModule>[] = []
  let plan: ReturnType<typeof collectOwnerLiteralCallers> | undefined
  const dispose = () => {
    plan = undefined
    for (const module of owned.splice(0)) module.dispose()
  }
  try {
    plan = collectOwnerLiteralCallers(source, options, (input, shape) => {
      const module = compiler.prepareNativeModule(
        input,
        undefined,
        'OwnerPreparation.tsx',
        preparationOptions(shape),
      )
      owned.push(module)
      return (context) => module.emit(context!)
    })
    const candidates = Object.freeze([...new Set(owned.flatMap((m) => m.candidates))].sort())
    return {
      candidates,
      emit(context) {
        const current = plan
        if (!current) throw new Error('Owner caller plan has already been emitted or disposed')
        plan = undefined
        try {
          context.requireCandidates([...candidates])
          return {
            ...current(context),
            scope: 'explicit-collected-compiler-preview',
            contextFingerprint: context.fingerprint,
          }
        } finally {
          dispose()
        }
      },
      dispose,
    }
  } catch (error) {
    dispose()
    throw error
  }
}

function collectOwnerLiteralCallers(
  source: string,
  options: OwnerCallerOptions,
  prepare: (
    input: string,
    shape: OwnerShape,
  ) => (context?: PreparedTailwindContext) => CompiledNativeModule,
): (context?: PreparedTailwindContext) => OwnerCallerPreview {
  const shadow = parseOwnerContractShadow(options.shadow)
  if (shadow.contracts.length !== 1) throw new Error('Select exactly one shadow owner contribution')
  const contract = shadow.contracts[0]!
  const inspection = inspectOwnerClassSlots(
    source,
    [
      {
        source: options.source,
        imported: options.imported,
        classProp: contract.classProp,
        preparedProp: contract.abi.nativePreparedProp,
      },
    ],
    options.sourceFile,
  )
  const result: OwnerCallerPreview = {
    scope: 'explicit-direct-compiler-preview',
    code: source,
    diagnostics: inspection.diagnostics,
    findings: [],
  }
  if (result.diagnostics.length) return () => result

  // Deduplicate before suspension, not after lowering. The modules hold the
  // compiler/theme snapshot and actual candidates, never just a lexical guess.
  const collected = new Map<string, { shape: OwnerShape; emit: ReturnType<typeof prepare> }[]>()
  for (const site of inspection.sites) {
    if (site.reason || site.classes == null || collected.has(site.classes)) continue
    collected.set(
      site.classes,
      contract.shapes.map((shape) => ({
        shape,
        emit: prepare(
          `import {${shape.nativeHost}} from '@hozo/primitives'; export function Plan(){return <${shape.nativeHost} className={${JSON.stringify(site.classes)}}/>}`,
          shape,
        ),
      })),
    )
  }

  return (context) => {
    let serial = 0
    const fresh = (stem: string) => {
      while (true) {
        const name = `__hozoOwner${stem}${serial++}`
        // Conservative source-wide exclusion also protects references injected
        // inside a nested scope, not merely the module's top-level bindings.
        if (!source.includes(name)) return name
      }
    }
    const sheet = fresh('StyleSheet')
    const declarations: string[] = []
    const plans = new Map<string, { name?: string; notes: string[] }>()
    const edits: { start: number; end: number; value: string }[] = []
    for (const site of inspection.sites) {
      const finding: OwnerCallerPreview['findings'][number] = {
        spanStart: site.spanStart,
        spanEnd: site.spanEnd,
        disposition: 'retained',
        notes: [],
      }
      result.findings.push(finding)
      if (site.reason || site.classes == null) {
        finding.reason = site.reason ?? 'nonliteral'
        continue
      }
      let plan = plans.get(site.classes)
      if (!plan) {
        const prepared = collected.get(site.classes)!.map(({ shape, emit }) => {
          const module = emit(context)
          const root = module.components[0]
          const messages = [
            ...module.syntaxDiagnostics,
            ...module.diagnostics,
            ...(root?.diagnostics ?? []),
          ]
          const notes = messages.map((d) => `${shape.id}: ${d.code}: ${d.message}`)
          return {
            root,
            notes,
            valid:
              module.components.length === 1 &&
              !!root?.ownerStyle &&
              (root.ownerStyle.splitText ?? false) === (shape.inputs?.splitText ?? false) &&
              JSON.stringify(root.ownerStyle.facts ?? []) ===
                JSON.stringify(shape.inputs?.facts ?? []) &&
              (!!shape.inputs ||
                (root.ownerStyle.literalResting &&
                  !root.ownerStyle.callback &&
                  !root.ownerStyle.focusVisible)) &&
              root.prelude.length === 0 &&
              root.runtimeImports.every((name) => !!shape.inputs && name === 'HozoPressable') &&
              root.nativeImports.every((name) => name === shape.nativeHost) &&
              messages.length === 0,
          }
        })
        const first = prepared[0]?.root
        const equivalent =
          !!first?.ownerStyle &&
          prepared.every(
            (p) =>
              p.valid &&
              p.root!.styles === first.styles &&
              JSON.stringify(p.root!.ownerStyle) === JSON.stringify(first.ownerStyle),
          )
        const notes = prepared.flatMap((p) => p.notes)
        if (equivalent) {
          const name = fresh('Plan')
          declarations.push(
            `const ${name} = ((hozoStyles) => ${first.ownerStyle!.callback ? `(${first.ownerStyle!.expression})` : `() => (${first.ownerStyle!.expression})`})(${sheet}.create(${first.styles}));`,
          )
          plan = { name, notes }
        } else {
          plan = {
            notes: [
              ...notes,
              'Every declared shape must have the same assessed carrier with matching declared inputs/destination; undeclared shapes remain state-independent.',
            ],
          }
        }
        plans.set(site.classes, plan)
      }
      finding.notes = plan.notes
      if (!plan.name) {
        finding.reason = 'shape-unassessed'
        continue
      }
      finding.disposition = 'prepared-literal'
      edits.push({
        start: site.spanStart,
        end: site.spanEnd,
        value: `${contract.abi.nativePreparedProp}={${plan.name}}`,
      })
    }
    if (!edits.length) return result
    edits.push({
      start: inspection.insertionOffset,
      end: inspection.insertionOffset,
      value: `\nimport {StyleSheet as ${sheet}} from 'react-native';\n${declarations.join('\n')}\n`,
    })
    for (const edit of edits.sort((a, b) => b.start - a.start))
      result.code = result.code.slice(0, edit.start) + edit.value + result.code.slice(edit.end)
    return result
  }
}
