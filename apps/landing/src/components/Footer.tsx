import { Link, Nav, Text, View } from '@hozo/core'
import { SiteLinks } from './SiteLinks.tsx'

export interface FooterProps {
  baseUrl?: string
}

export function Footer({ baseUrl = '' }: FooterProps) {
  const year = new Date().getFullYear()

  return (
    <View
      role="contentinfo"
      className="py-16 border-t border-hinoki/18 bg-yakisugi-950 text-stone-400 text-sm"
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
              <Text className="text-xs text-stone-500">| Universal UI Framework</Text>
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

          <SiteLinks baseUrl={baseUrl} />
        </View>
      </View>
    </View>
  )
}
