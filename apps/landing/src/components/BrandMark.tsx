import { Text, View } from '@hozo/core'

// The mark and the name, as the landing's header and the /docs header both
// show them. Inside a link that carries `group`, the tile lifts on hover.
// /docs rebinds the colour tokens to Starlight's (src/styles/docs.css), so
// there the tile follows the light and dark themes.
export function BrandMark() {
  return (
    <View className="flex flex-row items-center gap-2">
      <View className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-hinoki-light via-hinoki to-kuri items-center justify-center p-0.5 shadow-md group-hover:scale-105 transition-transform">
        <View className="w-full h-full bg-yakisugi-950 rounded-[6px] items-center justify-center font-bold text-shikkui tracking-tighter text-xs sm:text-sm">
          <Text>HZ</Text>
        </View>
      </View>
      <Text className="font-extrabold text-lg sm:text-xl tracking-tight text-shikkui">Hozo</Text>
    </View>
  )
}
