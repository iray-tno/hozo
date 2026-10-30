import { Svg } from '@hozo/svg'
import { Arrow, ArrowHead, Box } from './diagram.tsx'

const HEAD = 'architecture-arrow'

// Top to bottom, as the source flows: what is written, the compiler, its
// three outputs joined into one IR, and the two backends that IR feeds.
export function ArchitectureDiagram() {
  return (
    <Svg
      viewBox="0 0 640 504"
      accessibilityLabel="Hozo's architecture, from source to the Web and Native backends"
      className="block w-full h-auto max-w-[640px] my-6"
    >
      <ArrowHead id={HEAD} />
      <Box x={220} y={8} width={200} height={40} title="Application" centered />

      <Arrow d="M320 48V68H190V88" marker={HEAD} />
      <Arrow d="M320 68H450V88" marker={HEAD} />
      <Box x={90} y={88} width={200} height={40} title="@hozo/core" centered />
      <Box x={350} y={88} width={200} height={40} title="Existing RN code" centered />

      <Arrow d="M190 128V148H320V168" marker={HEAD} />
      <Arrow d="M450 128V148H320" />
      <Box
        x={200}
        y={168}
        width={240}
        height={56}
        title="Hozo Compiler"
        lines={['Rust core']}
        accent
        centered
      />

      <Arrow d="M320 224V264" marker={HEAD} />
      <Arrow d="M320 244H130V264" marker={HEAD} />
      <Arrow d="M320 244H510V264" marker={HEAD} />
      <Box x={45} y={264} width={170} height={40} title="Style IR" centered />
      <Box x={235} y={264} width={170} height={40} title="Semantic IR" centered />
      <Box x={425} y={264} width={170} height={40} title="Diagnostics" centered />

      <Arrow d="M130 304V324H320V344" marker={HEAD} />
      <Arrow d="M320 304V344" marker={HEAD} />
      <Arrow d="M510 304V324H320" />
      <Box x={220} y={344} width={200} height={40} title="Hozo IR" centered />

      <Arrow d="M320 384V404H185V424" marker={HEAD} />
      <Arrow d="M320 404H455V424" marker={HEAD} />
      <Box
        x={70}
        y={424}
        width={230}
        height={72}
        title="Web backend"
        lines={['DOM + CSS + ARIA', 'semantic HTML']}
        centered
      />
      <Box
        x={340}
        y={424}
        width={230}
        height={72}
        title="Native backend"
        lines={['React Native', 'View / Text, StyleSheet']}
        centered
      />
    </Svg>
  )
}
