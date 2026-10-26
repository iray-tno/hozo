import { Text, View } from '@hozo/core'
import { Svg } from '@hozo/svg'

// The mark and the name, as the landing's header and the /docs header both
// show them. Inside a link that carries `group`, the tile lifts on hover.
// The mark is the favicon's: a square with a dovetail socket cut from its top
// and its bottom, which leaves an H. The tile takes the text colour and the H
// the page's, so it stands off whatever it sits on: light on the landing's
// dark header, and in /docs, whose tokens follow Starlight's theme
// (src/styles/docs.css), dark in the light theme. The name beside it says
// what it is, so the drawing is unnamed.
export function BrandMark() {
  return (
    <View className="flex flex-row items-center gap-2">
      <Svg
        viewBox="0 0 32 32"
        className="w-7 h-7 sm:w-8 sm:h-8 group-hover:scale-105 transition-transform"
      >
        <Svg.Rect width="32" height="32" rx="7" className="fill-current text-shikkui" />
        <Svg.Path
          d="M6 6H13.4L11.4 13H20.6L18.6 6H26V26H18.6L20.6 19H11.4L13.4 26H6Z"
          className="fill-current text-yakisugi-950"
        />
      </Svg>
      <Text className="font-extrabold text-lg sm:text-xl tracking-tight text-shikkui">Hozo</Text>
    </View>
  )
}
