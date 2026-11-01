// Backend results only. Source discovery, lifetime and application stay in the
// shared caller planner; neither platform reconstructs styles from generated JSX.
import type { CompiledComponent, CompiledNativeModule } from './index.ts'
import type { OwnerShape } from './owner-contract.ts'

export type OwnerCallerCarrier =
  | { target: 'web'; className: string; css: string }
  | {
      target: 'native'
      styles: string
      ownerStyle: NonNullable<CompiledNativeModule['components'][number]['ownerStyle']>
    }

export interface OwnerCarrierAssessment {
  carrier?: OwnerCallerCarrier
  notes: string[]
}

export function nativeOwnerCarrier(
  module: CompiledNativeModule,
  shape: OwnerShape,
): OwnerCarrierAssessment {
  const root = module.components[0]
  const messages = [
    ...module.syntaxDiagnostics,
    ...module.diagnostics,
    ...(root?.diagnostics ?? []),
  ]
  const notes = messages.map((d) => `${shape.id}: ${d.code}: ${d.message}`)
  const valid =
    module.components.length === 1 &&
    !!root?.ownerStyle &&
    (root.ownerStyle.splitText ?? false) === (shape.inputs?.splitText ?? false) &&
    JSON.stringify(root.ownerStyle.facts ?? []) === JSON.stringify(shape.inputs?.facts ?? []) &&
    (!!shape.inputs ||
      (root.ownerStyle.literalResting &&
        !root.ownerStyle.callback &&
        !root.ownerStyle.focusVisible)) &&
    root.prelude.length === 0 &&
    root.runtimeImports.every((name) => !!shape.inputs && name === 'HozoPressable') &&
    root.nativeImports.every((name) => name === shape.nativeHost) &&
    messages.length === 0
  return {
    notes,
    ...(valid && {
      carrier: { target: 'native' as const, styles: root!.styles, ownerStyle: root!.ownerStyle! },
    }),
  }
}

export function webOwnerCarrier(
  module: CompiledComponent[],
  shape: OwnerShape,
): OwnerCarrierAssessment {
  const root = module[0]
  const notes = module.flatMap((part) =>
    part.diagnostics.map((d) => `${shape.id}: ${d.code}: ${d.message}`),
  )
  const valid =
    module.length === 1 &&
    root?.ownerClass != null &&
    root.runtimeImports.length === 0 &&
    notes.length === 0
  return {
    notes,
    ...(valid && {
      carrier: {
        target: 'web' as const,
        className: root!.ownerClass!.className,
        css: root!.ownerClass!.css,
      },
    }),
  }
}
