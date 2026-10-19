import { Heading, Link, List, ListItem, Paragraph, Section, Text, View } from '@hozo/core'

export interface IntegrationsProps {
  baseUrl?: string
}

// One line per integration and a link to its setup guide. The config each
// one needs used to sit here as a code sample, six of them, beside guides
// that carry the same config with the starter it assumes -- so the landing
// says where to go, and the guide says how.
function Integration({
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
          <Text className="text-base font-bold text-shikkui group-hover:text-hinoki-light transition-colors">
            {name}
          </Text>
          <Text className="text-[11px] font-mono text-stone-500">{pkg}</Text>
        </View>
        <Text className="text-xs text-stone-400 leading-relaxed">{children}</Text>
        <Text className="mt-1 text-xs font-semibold text-hinoki-light">
          {`${name} setup guide →`}
        </Text>
      </Link>
    </ListItem>
  )
}

export function Integrations({ baseUrl = '' }: IntegrationsProps) {
  const cleanBase = baseUrl ? baseUrl.replace(/\/$/, '') : ''
  const guides = `${cleanBase}/docs/getting-started`

  return (
    <Section
      nativeID="integrations"
      className="py-20 border-t border-hinoki/18 relative bg-yakisugi-950"
    >
      <View className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <View className="text-center max-w-3xl mx-auto mb-10 flex flex-col items-center">
          <Text className="text-xs font-bold uppercase tracking-widest text-hinoki mb-3 block">
            Ecosystem
          </Text>
          <Heading
            level={2}
            className="text-3xl sm:text-5xl font-extrabold text-shikkui tracking-tight mb-4"
          >
            Works in the Build You Already Have
          </Heading>
          <Paragraph className="text-shikkui-muted text-base sm:text-lg leading-relaxed">
            Each is one plugin or wrapper in the config you already have.
          </Paragraph>
        </View>

        <List className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto list-none p-0 m-0">
          <Integration href={`${guides}/vite/`} name="Vite" pkg="@hozo/vite">
            Runs before the React plugin and lowers JSX to semantic DOM and compiled CSS.
          </Integration>
          <Integration href={`${guides}/next/`} name="Next.js" pkg="@hozo/next">
            One wrapper around your Next config, on Turbopack or webpack.
          </Integration>
          <Integration href={`${guides}/astro/`} name="Astro" pkg="@hozo/vite">
            Static components ship no JavaScript; islands hydrate as usual.
          </Integration>
          <Integration href={`${guides}/metro/`} name="Metro / Expo" pkg="@hozo/metro">
            Precomputed StyleSheets for iOS and Android from the same source.
          </Integration>
          <Integration href={`${guides}/storybook/`} name="Storybook" pkg="@hozo/storybook">
            An addon for the Storybook you already run.
          </Integration>
          <Integration href={`${guides}/tanstack-start/`} name="TanStack Start" pkg="@hozo/vite">
            Full-stack SSR with TanStack Start and Nitro.
          </Integration>
        </List>
      </View>
    </Section>
  )
}
