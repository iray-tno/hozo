import { Heading, Link, List, ListItem, Paragraph, Section, Text, View } from '@hozo/core'

export interface DomainShowcaseProps {
  baseUrl?: string
}

// One card per page of the site that shows a domain at work. Each page has
// the detail; the card says what it is and where it goes.
function Domain({
  href,
  name,
  pkg,
  children,
}: {
  href: string
  name: string
  pkg: string
  children: string
}) {
  return (
    <ListItem className="flex">
      <Link
        href={href}
        className="group w-full p-5 rounded-xl timber-panel border border-hinoki/18 hover:border-hinoki/50 transition-colors flex flex-col gap-1.5"
      >
        <View className="flex flex-row items-baseline justify-between gap-3">
          <Heading
            level={3}
            className="text-base font-bold text-shikkui group-hover:text-hinoki-light transition-colors"
          >
            {name}
          </Heading>
          <Text className="text-[11px] font-mono text-stone-500">{pkg}</Text>
        </View>
        <Text className="text-xs text-stone-400 leading-relaxed">{children}</Text>
      </Link>
    </ListItem>
  )
}

export function DomainShowcase({ baseUrl = '' }: DomainShowcaseProps) {
  const cleanBase = baseUrl ? baseUrl.replace(/\/$/, '') : ''

  return (
    <Section
      nativeID="domain-showcase"
      className="py-20 border-t border-hinoki/18 bg-yakisugi-950 relative overflow-hidden"
    >
      <View className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <View className="text-center max-w-3xl mx-auto mb-10 flex flex-col items-center">
          <Text className="text-xs font-bold uppercase tracking-widest text-hinoki mb-3 block">
            Domains
          </Text>
          <Heading
            level={2}
            className="text-3xl sm:text-5xl font-extrabold text-shikkui tracking-tight mb-4"
          >
            Beyond Boxes and Text
          </Heading>
          <Paragraph className="text-shikkui-muted text-base sm:text-lg leading-relaxed">
            3D, a 2D canvas, SVG, Tailwind and StyleX, on the same primitives and the same compiler.
            Each has a live page.
          </Paragraph>
        </View>

        <List className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto list-none p-0 m-0">
          <Domain href={`${cleanBase}/three/`} name="Three.js" pkg="@hozo/three">
            Scenes on WebGL and WebGPU, with a bounded Native GPU path.
          </Domain>
          <Domain href={`${cleanBase}/canvas/`} name="2D Canvas" pkg="@hozo/canvas">
            Charts and heatmaps: HTML5 Canvas on the Web, Skia on Native.
          </Domain>
          <Domain href={`${cleanBase}/svg/`} name="Universal SVG" pkg="@hozo/svg">
            One SVG source, DOM SVG on the Web and react-native-svg on Native, filters included.
          </Domain>
          <Domain href={`${cleanBase}/tailwind/`} name="Tailwind, compiled" pkg="@hozo/tailwind">
            Classes and state variants resolved at build time on both platforms.
          </Domain>
          <Domain href={`${cleanBase}/stylex/`} name="StyleX, compiled" pkg="@stylexjs/stylex">
            Meta's StyleX read into the same compiler, beside Tailwind.
          </Domain>
          <Domain
            href={`${cleanBase}/conformance/`}
            name="Conformance Matrix"
            pkg="snapshot from CI"
          >
            How far the output matches Tailwind, React Native and WAI-ARIA, and where it does not.
          </Domain>
        </List>
      </View>
    </Section>
  )
}
