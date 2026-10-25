import { loadTheme } from '@hozo/tailwind'
import { type HighlightedListing, highlightCodeListings } from './code-highlighting.ts'

// Source text stays data: lowering the surrounding page must not rewrite
// identifiers or literal class names inside an example.
export const CODE_SNIPPETS = {
  philosophy: {
    title: 'React Native imports',
    code: "import { View, Text } from 'react-native'",
  },
  canvas: {
    title: 'Canvas authoring: Revenue.tsx',
    code: `import { Canvas } from '@hozo/canvas'

export function Revenue({ quarters }) {
  return (
    <Canvas
      viewBox={[0, 0, 400, 200]}
      accessibilityLabel="Revenue by quarter"
      accessibleFallback={<RevenueTable quarters={quarters} />}
    >
      {quarters.map((q, i) => (
        <Canvas.Rect
          key={q.name}
          x={i * 100 + 20} y={200 - q.value} width={60} height={q.value}
          fill="#c8a882"
          accessibilityLabel={q.name}
          onPress={() => select(q)}
        />
      ))}
    </Canvas>
  )
}`,
  },
  svg: {
    title: 'SVG authoring: Verified.tsx',
    code: `import { Svg } from '@hozo/svg'

export function Verified() {
  return (
    <Svg viewBox="0 0 80 80" accessibilityLabel="Verified">
      <Svg.Defs>
        <Svg.Filter id="shadow">
          <Svg.FeDropShadow dy={3} stdDeviation={2} floodOpacity={0.4} />
        </Svg.Filter>
      </Svg.Defs>
      <Svg.Circle cx={40} cy={40} r={24} fill="#c8a882" filter="url(#shadow)" />
      <Svg.Path d="M32 40 L38 46 L50 34" stroke="#100f0e" strokeWidth={3} />
    </Svg>
  )
}`,
  },
  three: {
    title: 'Three authoring: ProductViewer.tsx',
    code: `import { ThreeCanvas } from '@hozo/three'
import { useRef } from 'react'

export function ProductViewer() {
  return (
    <ThreeCanvas
      camera={{ position: [0, 2, 5], fov: 45 }}
      frameloop="demand"
      accessibilityLabel="Interactive 3D Kumimono Bracket"
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={1.2} />
      <KumimonoMesh />
    </ThreeCanvas>
  )
}`,
  },
} as const

export interface CodeSnippet extends HighlightedListing {
  title: string
}

/** Astro frontmatter only; components receive tokens rather than Shiki. */
export async function buildCodeSnippet(
  name: keyof typeof CODE_SNIPPETS,
  themeSource: string,
  root = process.cwd(),
): Promise<CodeSnippet> {
  const source = CODE_SNIPPETS[name]
  const { listing } = await highlightCodeListings(
    { listing: source.code },
    await loadTheme(themeSource, root),
  )
  return { title: source.title, ...listing }
}
