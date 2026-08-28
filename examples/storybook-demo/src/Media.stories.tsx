import type { Meta, StoryObj } from '@storybook/react-vite'
import { Heading, Image, Paragraph, Svg, View } from '@hozo/core'

function MediaGallery() {
  return (
    <View className="max-w-2xl w-full space-y-8 rounded-2xl bg-white p-8 shadow-sm">
      <View className="space-y-4">
        <Heading level={2} className="text-xl font-bold text-slate-900">
          Universal SVG Primitives
        </Heading>
        <Paragraph className="text-sm text-slate-600">
          Vector shapes using Hozo's canonical SVG namespace, compiling to native Web SVGs or React Native Svg on mobile.
        </Paragraph>
        <View className="flex flex-row items-center gap-6 p-6 rounded-xl bg-slate-900">
          <Svg viewBox="0 0 24 24" className="h-10 w-10 text-indigo-400">
            <Svg.Circle cx={12} cy={12} r={10} stroke="currentColor" strokeWidth={2} fill="none" />
            <Svg.Path d="M8 12l3 3 5-5" stroke="#34D399" strokeWidth={2} strokeLinecap="round" />
          </Svg>
          <Svg viewBox="0 0 24 24" className="h-10 w-10 text-sky-400">
            <Svg.Rect x={3} y={3} width={18} height={18} rx={4} stroke="currentColor" strokeWidth={2} fill="none" />
            <Svg.Path d="M9 9h6M9 13h6M9 17h3" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
          </Svg>
        </View>
      </View>
      <View className="space-y-4 border-t border-slate-200 pt-6">
        <Heading level={3} className="text-lg font-bold text-slate-900">
          Image with Accessible Fallbacks
        </Heading>
        <Image
          src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80"
          alt="Abstract geometric art"
          className="h-48 w-full rounded-xl object-cover shadow-inner"
        />
      </View>
    </View>
  )
}

const meta = { title: 'Core/Media & Svg', component: MediaGallery } satisfies Meta<typeof MediaGallery>
export default meta
export const Default: StoryObj<typeof meta> = {}
