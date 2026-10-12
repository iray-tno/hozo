import { type MediaSeekProps, useMediaSeek } from '@hozo/media/seek'
import { Slider } from '@hozo/patterns'
import { Text, View } from '@hozo/primitives'

/** Application-owned presentation; the binding neither styles nor imports a widget. */
export function MediaSeekControl(props: MediaSeekProps) {
  const seek = useMediaSeek(props)
  return (
    <View className="gap-2">
      {seek.slider ? (
        <Slider
          key={seek.key}
          {...seek.slider}
          style={{
            position: 'relative',
            height: 44,
            width: '100%',
            borderRadius: 22,
            backgroundColor: '#e2e8f0',
          }}
          thumbStyle={{
            position: 'absolute',
            top: 0,
            height: 44,
            width: 24,
            borderRadius: 12,
            backgroundColor: '#4f46e5',
          }}
          fillStyle={{
            position: 'absolute',
            top: 0,
            height: 44,
            borderRadius: 22,
            backgroundColor: '#c7d2fe',
          }}
          thumbClassName="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        />
      ) : (
        <Text className="text-base text-slate-700">{seek.position}</Text>
      )}
      {seek.error && <Text className="text-base text-red-700">{seek.error}</Text>}
    </View>
  )
}
