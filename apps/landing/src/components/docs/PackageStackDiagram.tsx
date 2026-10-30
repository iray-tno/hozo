import { Svg } from '@hozo/svg'
import { Arrow, ArrowHead, Box } from './diagram.tsx'

const HEAD = 'package-stack-arrow'

// Arrows point from a package to what it depends on, so they run down and
// the bottom box depends on nothing. Patterns skip primitives and engine.
export function PackageStackDiagram() {
  return (
    <Svg
      viewBox="0 0 640 568"
      accessibilityLabel="How Hozo's packages depend on each other"
      className="block w-full h-auto max-w-[640px] my-6"
    >
      <ArrowHead id={HEAD} />
      <Box
        x={8}
        y={8}
        width={624}
        height={60}
        title="@hozo/ui"
        lines={['Looks: classes over the layers below. Shipped as source, compiled by your build.']}
      />
      <Arrow d="M320 68V96" marker={HEAD} />
      <Box
        x={8}
        y={96}
        width={624}
        height={60}
        title="@hozo/core"
        lines={['Re-exports, for zero-setup authoring. Owns no implementation.']}
      />
      <Arrow d="M160 156V184" marker={HEAD} />
      <Arrow d="M480 156V184" marker={HEAD} />
      <Box
        x={8}
        y={184}
        width={304}
        height={132}
        title="Primitives (compiled)"
        lines={[
          '@hozo/primitives · @hozo/semantics',
          '@hozo/typography',
          'Lowered by the compiler;',
          'listed in docs/primitives.md',
        ]}
      />
      <Box
        x={328}
        y={184}
        width={304}
        height={132}
        title="Patterns (runtime)"
        lines={[
          '@hozo/patterns · @hozo/form',
          'Dialog · Tabs · Menu · Combobox ·',
          'Popover · Chip · DatePicker …',
          'Write host elements directly',
        ]}
      />
      <Arrow d="M160 316V344" marker={HEAD} />
      <Box
        x={8}
        y={344}
        width={304}
        height={96}
        title="@hozo/engine"
        lines={[
          'What compiled output calls at',
          'runtime: environment, animation',
          'and class hooks',
        ]}
      />
      <Arrow d="M160 440V468" marker={HEAD} />
      <Arrow d="M480 316V468" marker={HEAD} />
      <Box
        x={8}
        y={468}
        width={624}
        height={92}
        title="@hozo/behaviors"
        lines={[
          'Accessibility and internationalisation as first-class behaviours:',
          'FocusScope · RovingFocus · LiveRegion · Portal · FloatingPositioner ·',
          'usePresence · HozoI18nProvider. Depends on nothing.',
        ]}
      />
    </Svg>
  )
}
