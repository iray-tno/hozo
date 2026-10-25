import { View } from '@hozo/core'
import { CompilerPanel } from '../CompilerListing.tsx'

// Only the bounded code panels hydrate: their overflow observers give long
// output a keyboard stop without shipping the page's build-time compiler.
export function TailwindListings({
  source,
  web,
  native,
}: {
  source: string
  web: string
  native: string
}) {
  return (
    <View className="gap-6 mb-6">
      <CompilerPanel title="Chip.tsx" detail="As written." code={source} />
      <View className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CompilerPanel
          title="Web"
          detail="A button with a scoped class, and the CSS for it."
          code={web}
        />
        <CompilerPanel
          title="iOS and Android"
          detail="A Pressable and a StyleSheet object."
          code={native}
        />
      </View>
    </View>
  )
}
