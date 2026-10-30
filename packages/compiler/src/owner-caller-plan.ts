// RFC010 preview only. No adapter imports this module or trusts shadow data
// as an audit. Discovery belongs to the parser; styles belong to the backend.
import { type CompileDiagnostic, type Compiler, inspectOwnerClassSlots } from './index.ts'
import { parseOwnerContractShadow } from './owner-contract.ts'

export interface OwnerCallerPreview {
  scope: 'explicit-direct-compiler-preview'
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
 * Only state-independent literals equivalent on every declared host shape
 * are assessed. Expression capture and ABI/owner auditing remain separate.
 */
export function previewOwnerLiteralCallers(
  source: string,
  compiler: Compiler,
  options: { source: string; imported: string; shadow: string; sourceFile?: string },
): OwnerCallerPreview {
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
  if (result.diagnostics.length) return result

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
      const prepared = contract.shapes.map((shape) => {
        const input = `import {${shape.nativeHost}} from '@hozo/primitives'; export function Plan(){return <${shape.nativeHost} className={${JSON.stringify(site.classes)}}/>}`
        const module = compiler.compileNativeModule(input, undefined, 'OwnerPreparation.tsx', {
          ownerStyle: true,
        })
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
            root.ownerStyle.literalResting &&
            !root.ownerStyle.callback &&
            !root.ownerStyle.focusVisible &&
            root.prelude.length === 0 &&
            root.runtimeImports.length === 0 &&
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
            p.root!.ownerStyle!.expression === first.ownerStyle!.expression,
        )
      const notes = prepared.flatMap((p) => p.notes)
      if (equivalent) {
        const name = fresh('Plan')
        declarations.push(
          `const ${name} = ((hozoStyles) => () => (${first.ownerStyle!.expression}))(${sheet}.create(${first.styles}));`,
        )
        plan = { name, notes }
      } else {
        plan = {
          notes: [
            ...notes,
            'Every declared shape must have the same assessed state-independent style carrier.',
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
