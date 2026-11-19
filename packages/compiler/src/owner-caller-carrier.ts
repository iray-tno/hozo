// Backend results only. Source discovery, lifetime and application stay in the
// shared caller planner; neither platform reconstructs styles from generated JSX.
import type { CompileDiagnostic, CompiledComponent, CompiledNativeModule } from './index.ts'
import type { OwnerShape } from './owner-contract.ts'

function isDeclaredOwnerDataAttribute(diagnostic: CompileDiagnostic, shape: OwnerShape): boolean {
  if (diagnostic.code !== 'HOZO_ATTRIBUTE_IS_PRIVATE' || diagnostic.severity !== 'warning')
    return false
  const facts = shape.inputs?.facts ?? []
  return facts.some((fact) => {
    const attr = fact.split('=')[0]!
    return attr.startsWith('data-hozo-') && diagnostic.message.startsWith(`\`${attr}\` `)
  })
}

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
  ].filter((d) => !isDeclaredOwnerDataAttribute(d, shape))
  const notes = messages.map((d) => `${shape.id}: ${d.code}: ${d.message}`)
  const stateful = shape.events.length > 0 || (shape.inputs?.facts.length ?? 0) > 0
  const valid =
    module.components.length === 1 &&
    !!root?.ownerStyle &&
    (root.ownerStyle.splitText ?? false) === (shape.inputs?.splitText ?? false) &&
    JSON.stringify(root.ownerStyle.facts ?? []) === JSON.stringify(shape.inputs?.facts ?? []) &&
    JSON.stringify(root.ownerStyle.events ?? []) ===
      JSON.stringify(shape.nativeHost === 'View' && shape.events.length > 0 ? shape.events : []) &&
    (stateful ||
      (root.ownerStyle.literalResting &&
        !root.ownerStyle.callback &&
        !root.ownerStyle.focusVisible)) &&
    root.prelude.length === 0 &&
    root.runtimeImports.every(
      (name) =>
        stateful &&
        ((shape.nativeHost === 'Pressable' && name === 'HozoPressable') ||
          (shape.nativeHost === 'TextInput' && name === 'HozoTextInput')),
    ) &&
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
    part.diagnostics
      .filter((d) => !isDeclaredOwnerDataAttribute(d, shape))
      .map((d) => `${shape.id}: ${d.code}: ${d.message}`),
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
