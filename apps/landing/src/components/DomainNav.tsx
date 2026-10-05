import { Link, Nav, Text, View } from '@hozo/core'

export interface DomainNavProps {
  baseUrl?: string
  currentDomain: 'three' | 'canvas' | 'svg' | 'tailwind' | 'stylex'
}

export function DomainNav({ baseUrl = '', currentDomain }: DomainNavProps) {
  const cleanBase = baseUrl ? baseUrl.replace(/\/$/, '') : ''
  const homeUrl = cleanBase ? `${cleanBase}/` : '/'

  const items = [
    { id: 'three', label: 'Three.js · 3D', path: `${cleanBase}/three/`, group: 'Graphics' },
    { id: 'canvas', label: '2D Canvas', path: `${cleanBase}/canvas/`, group: 'Graphics' },
    { id: 'svg', label: 'Universal SVG', path: `${cleanBase}/svg/`, group: 'Graphics' },
    { id: 'tailwind', label: 'Tailwind AOT', path: `${cleanBase}/tailwind/`, group: 'Styling' },
    { id: 'stylex', label: 'StyleX CSS-in-JS', path: `${cleanBase}/stylex/`, group: 'Styling' },
  ] as const

  return (
    <View className="mb-10 w-full min-w-0">
      <Nav
        accessibilityLabel="Domain navigation"
        className="flex flex-row items-center gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-wood-subtle"
      >
        <Link
          href={homeUrl}
          className="inline-flex flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-stone-400 hover:text-shikkui hover:bg-yakisugi-800 transition-colors shrink-0"
        >
          <Text aria-hidden="true">&larr;</Text>
          <Text>Home</Text>
        </Link>
        <Text className="text-stone-600 shrink-0" aria-hidden="true">
          |
        </Text>
        {items.map((item) => {
          if (item.id === currentDomain) {
            return (
              <Link
                key={item.id}
                href={item.path}
                aria-current="page"
                className="inline-flex flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-all bg-hinoki/15 text-hinoki border border-hinoki/30 shadow-sm"
              >
                <Text>{item.label}</Text>
              </Link>
            )
          }
          return (
            <Link
              key={item.id}
              href={item.path}
              className="inline-flex flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-all text-stone-300 hover:text-shikkui hover:bg-yakisugi-800/80"
            >
              <Text>{item.label}</Text>
            </Link>
          )
        })}
      </Nav>
    </View>
  )
}
