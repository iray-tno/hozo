import { Link, Nav, Text, View } from '@hozo/core'

export interface NavbarProps {
  baseUrl?: string
}

export function Navbar({ baseUrl = '' }: NavbarProps) {
  const cleanBase = baseUrl ? baseUrl.replace(/\/$/, '') : ''
  const homeUrl = cleanBase ? `${cleanBase}/` : '/'

  return (
    <View
      role="banner"
      className="fixed top-0 left-0 right-0 z-50 border-b border-wood bg-yakisugi-header backdrop-blur-md"
    >
      <View className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex flex-row items-center justify-between">
        <View className="flex flex-row items-center gap-3">
          <Link href={homeUrl} className="flex flex-row items-center gap-2 group">
            <View className="w-8 h-8 rounded-lg bg-gradient-to-br from-hinoki-light via-hinoki to-kuri flex items-center justify-center p-0.5 shadow-md group-hover:scale-105 transition-transform">
              <View className="w-full h-full bg-yakisugi-950 rounded-[6px] flex items-center justify-center font-bold text-shikkui tracking-tighter text-sm">
                <Text>HZ</Text>
              </View>
            </View>
            <Text className="font-extrabold text-xl tracking-tight text-shikkui">Hozo</Text>
            <Text className="text-xs px-2 py-0.5 rounded-full bg-wood-subtle text-hinoki border border-wood font-medium">
              v0.0.0 prototype
            </Text>
          </Link>
        </View>

        <Nav className="hidden md:flex md:flex-row items-center gap-4 lg:gap-5 xl:gap-3.5 2xl:gap-6 text-sm text-shikkui-muted font-medium whitespace-nowrap">
          <Link
            href={`${cleanBase}/conformance/`}
            className="text-hinoki hover:text-hinoki-light font-semibold flex flex-row items-center gap-1.5 transition-colors shrink-0"
          >
            <View className="w-2 h-2 rounded-full bg-hinoki" />
            <Text>Conformance</Text>
          </Link>
          <Link
            href={`${cleanBase}/repl/`}
            className="text-bengara hover:text-bengara-hover font-semibold flex flex-row items-center gap-1.5 transition-colors shrink-0"
          >
            <View className="w-2 h-2 rounded-full bg-bengara" />
            <Text>REPL</Text>
          </Link>
          <Link
            href={`${cleanBase}/storybook/`}
            className="text-tatami-light hover:text-shikkui font-semibold flex flex-row items-center gap-1.5 transition-colors shrink-0"
          >
            <View className="w-2 h-2 rounded-full bg-tatami" />
            <Text>Storybook</Text>
          </Link>
          <Link
            href={`${cleanBase}/reports/`}
            className="text-hinoki-light hover:text-shikkui font-semibold flex flex-row items-center gap-1.5 transition-colors shrink-0"
          >
            <View className="w-2 h-2 rounded-full bg-hinoki-light" />
            <Text>Reports</Text>
          </Link>
          <Link
            href={`${homeUrl}#philosophy`}
            className="hidden lg:inline-flex hover:text-shikkui transition-colors shrink-0"
          >
            <Text>Principles</Text>
          </Link>
          <Link
            href={`${homeUrl}#tiered-styles`}
            className="hidden xl:inline-flex hover:text-shikkui transition-colors shrink-0"
          >
            <Text>Tiered Styles</Text>
          </Link>
          <Link
            href={`${homeUrl}#code-showcase`}
            className="hidden 2xl:inline-flex hover:text-shikkui transition-colors shrink-0"
          >
            <Text>Code Comparison</Text>
          </Link>
          <Link
            href={`${homeUrl}#accessibility`}
            className="hidden xl:inline-flex hover:text-shikkui transition-colors shrink-0"
          >
            <Text>Accessibility</Text>
          </Link>
          <Link
            href={`${homeUrl}#integrations`}
            className="hidden 2xl:inline-flex hover:text-shikkui transition-colors shrink-0"
          >
            <Text>Integrations</Text>
          </Link>
          <Link
            href={`${homeUrl}#architecture`}
            className="hidden lg:inline-flex hover:text-shikkui transition-colors shrink-0"
          >
            <Text>Architecture</Text>
          </Link>
        </Nav>

        <View className="flex flex-row items-center gap-2 sm:gap-3">
          <Link
            href={`${cleanBase}/repl/`}
            className="inline-flex flex-row items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-bengara hover:bg-bengara-hover text-shikkui shadow-sm transition-all md:hidden"
          >
            <Text>REPL</Text>
          </Link>
          <Link
            href="https://github.com/iray-tno/hozo"
            className="inline-flex flex-row items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-yakisugi-800 hover:bg-yakisugi-700 text-shikkui border border-wood hover:border-wood-strong transition-all"
          >
            <svg
              className="w-4 h-4 fill-current text-hinoki"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            <Text>GitHub</Text>
          </Link>
        </View>
      </View>
    </View>
  )
}
