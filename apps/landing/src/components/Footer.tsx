import { Link, Nav, Text, View } from '@hozo/core'

export interface FooterProps {
  baseUrl?: string
}

export function Footer({ baseUrl = '' }: FooterProps) {
  const cleanBase = baseUrl ? baseUrl.replace(/\/$/, '') : ''
  const year = new Date().getFullYear()

  return (
    <View
      role="contentinfo"
      className="py-16 border-t border-wood bg-yakisugi-950 text-stone-400 text-sm"
    >
      <View className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <View className="flex flex-col gap-8">
          <View className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <View className="flex flex-row items-center gap-3">
              <View className="w-7 h-7 rounded-lg bg-gradient-to-br from-hinoki-light to-kuri items-center justify-center p-0.5 shadow-md">
                <View className="w-full h-full bg-yakisugi-950 rounded-[5px] items-center justify-center font-bold text-shikkui tracking-tighter text-xs">
                  <Text>HZ</Text>
                </View>
              </View>
              <Text className="font-bold text-shikkui tracking-tight">Hozo</Text>
              <Text className="text-xs text-stone-500">| Universal UI Compiler</Text>
            </View>

            <View className="flex flex-col items-center sm:items-end gap-1.5 shrink min-w-0">
              {/* Where this site sits under iray-tno.github.io, in the footer so
                  the header keeps to the page's own navigation. Mirrored by the
                  BreadcrumbList the index page emits as JSON-LD (#704). */}
              <Nav
                accessibilityLabel="Breadcrumb"
                className="flex flex-row items-center gap-1.5 text-xs text-stone-500"
              >
                <Link href="https://iray-tno.github.io/" className="hover:underline">
                  <Text>iray-tno</Text>
                </Link>
                <Text aria-hidden="true">/</Text>
                <Text className="font-medium text-shikkui">Hozo</Text>
              </Nav>
              <Text className="text-xs text-stone-500">
                &copy; {year} Hozo Contributors. MIT Licensed.
              </Text>
            </View>
          </View>

          <View className="flex flex-row flex-wrap items-center justify-center sm:justify-start gap-x-6 gap-y-3 pt-6 border-t border-wood text-xs font-medium">
            <Link
              href={`${cleanBase}/repl/`}
              className="hover:text-bengara text-shikkui-muted transition-colors"
            >
              <Text>Interactive REPL</Text>
            </Link>
            <Link
              href={`${cleanBase}/storybook/`}
              className="hover:text-tatami-light text-shikkui-muted transition-colors"
            >
              <Text>Storybook</Text>
            </Link>
            <Link
              href={`${cleanBase}/reports/`}
              className="hover:text-hinoki-light text-shikkui-muted transition-colors"
            >
              <Text>Test Reports (Allure)</Text>
            </Link>
            <Link
              href={`${cleanBase}/conformance/`}
              className="hover:text-hinoki text-shikkui-muted transition-colors"
            >
              <Text>Conformance Matrix</Text>
            </Link>
            <Link
              href={`${cleanBase}/three/`}
              className="hover:text-hinoki text-shikkui-muted transition-colors"
            >
              <Text>Three.js (3D)</Text>
            </Link>
            <Link
              href={`${cleanBase}/canvas/`}
              className="hover:text-tatami-light text-shikkui-muted transition-colors"
            >
              <Text>2D Canvas</Text>
            </Link>
            <Link
              href={`${cleanBase}/svg/`}
              className="hover:text-hinoki-light text-shikkui-muted transition-colors"
            >
              <Text>Universal SVG</Text>
            </Link>
            <Link
              href={`${cleanBase}/tailwind/`}
              className="hover:text-bengara text-shikkui-muted transition-colors"
            >
              <Text>Tailwind AOT</Text>
            </Link>
            <Link
              href={`${cleanBase}/stylex/`}
              className="hover:text-hinoki text-shikkui-muted transition-colors"
            >
              <Text>StyleX</Text>
            </Link>
            <Link
              href="https://github.com/iray-tno/hozo"
              className="hover:text-shikkui transition-colors"
            >
              <Text>GitHub Repository</Text>
            </Link>
            <Link
              href="https://github.com/iray-tno/hozo/blob/main/docs/proposal.md"
              className="hover:text-shikkui transition-colors"
            >
              <Text>Proposal (JP)</Text>
            </Link>
            <Link
              href="https://github.com/iray-tno/hozo/blob/main/LICENSE"
              className="hover:text-shikkui transition-colors"
            >
              <Text>MIT License</Text>
            </Link>
          </View>
        </View>
      </View>
    </View>
  )
}
