import { Link, Text, View } from '@hozo/core'

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
        <View className="flex flex-col md:flex-row items-center justify-between gap-6">
          <View className="flex flex-row items-center gap-3">
            <View className="w-7 h-7 rounded-lg bg-gradient-to-br from-hinoki-light to-kuri flex items-center justify-center p-0.5 shadow-md">
              <View className="w-full h-full bg-yakisugi-950 rounded-[5px] flex items-center justify-center font-bold text-shikkui tracking-tighter text-xs">
                <Text>HZ</Text>
              </View>
            </View>
            <Text className="font-bold text-shikkui tracking-tight">Hozo</Text>
            <Text className="text-xs text-stone-500">| Universal UI Compiler</Text>
          </View>

          <View className="flex flex-row flex-wrap items-center justify-center md:justify-start gap-5 sm:gap-6 text-xs font-medium">
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

          <Text className="text-xs text-stone-500">
            &copy; {year} Hozo Contributors. MIT Licensed.
          </Text>
        </View>
      </View>
    </View>
  )
}
