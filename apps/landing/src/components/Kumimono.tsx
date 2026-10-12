import { Button, Heading, Link, Paragraph, Section, Text, View } from '@hozo/core'
import { configureKumimonoRenderer, createKumimonoScene } from '@hozo/example-three-kumimono'
import { Slider } from '@hozo/patterns'
import { ThreeCanvas, type ThreeCanvasFrame } from '@hozo/three/webgl'
import { useEffect, useRef, useState } from 'react'

type Study = ReturnType<typeof createKumimonoScene>

export function Kumimono({ baseUrl = '' }: { baseUrl?: string } = {}) {
  const cleanBase = baseUrl ? baseUrl.replace(/\/$/, '') : ''
  const root = useRef<HTMLDivElement>(null)
  const [study, setStudy] = useState<Study>()
  const [error, setError] = useState(false)
  const [visible, setVisible] = useState(false)
  const [reduced, setReduced] = useState(true)
  const [progress, setProgress] = useState(1)
  const [playing, setPlaying] = useState(false)
  const animation = useRef({ from: 1, to: 1, elapsed: 0 })

  useEffect(() => {
    let resource: Study | undefined
    try {
      resource = createKumimonoScene()
      resource.update(1)
      setStudy(resource)
    } catch {
      setError(true)
    }
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const motion = () => {
      setReduced(media.matches)
      if (media.matches) {
        resource?.update(animation.current.to)
        setProgress(animation.current.to)
        setPlaying(false)
      }
    }
    motion()
    media.addEventListener('change', motion)
    let intersecting = false
    const updateVisibility = () => setVisible(intersecting && !document.hidden)
    const observer = new IntersectionObserver(([entry]) => {
      intersecting = entry.isIntersecting
      updateVisibility()
    })
    if (root.current) observer.observe(root.current)
    document.addEventListener('visibilitychange', updateVisibility)
    return () => {
      observer.disconnect()
      media.removeEventListener('change', motion)
      document.removeEventListener('visibilitychange', updateVisibility)
      resource?.dispose()
    }
  }, [])

  function toggle() {
    const to = playing ? 1 - animation.current.to : progress > 0.5 ? 0 : 1
    animation.current = { from: progress, to, elapsed: 0 }
    if (reduced) {
      study?.update(to)
      setProgress(to)
    } else setPlaying(true)
  }

  function frame({ delta }: ThreeCanvasFrame) {
    if (!playing) return
    const motion = animation.current
    motion.elapsed += Math.min(delta, 0.1)
    const fraction = Math.min(1, motion.elapsed / 5)
    const value = motion.from + (motion.to - motion.from) * fraction * fraction * (3 - 2 * fraction)
    study?.update(value)
    setProgress(value)
    if (fraction === 1) setPlaying(false)
  }

  return (
    <Section
      nativeID="kumimono"
      aria-labelledby="kumimono-heading"
      className="max-w-[1120px] mx-auto px-4 pt-10 pb-14 sm:px-6 sm:pt-16 sm:pb-[88px]"
    >
      <View className="flex flex-row flex-wrap justify-between items-end gap-x-6 gap-y-3 sm:gap-y-4 mb-6">
        {/* A View does not shrink by default; this one has to, so its text wraps. */}
        <View className="shrink">
          <Text className="block mb-3 font-mono text-[11px] tracking-[0.08em] text-[#c8a06a]">
            @hozo/three · WebGL
          </Text>
          {/* The heading says what the section shows a developer; the subject
              is the line under it. It used to be 組物 Kumimono: a term most
              readers of an English page cannot read, without lang="ja", so a
              screen reader voiced the kanji with an English voice. */}
          <Heading
            level={2}
            nativeID="kumimono-heading"
            className="text-[28px] sm:text-4xl leading-[1.2] font-medium tracking-[0.04em]"
          >
            Interactive 3D, from the same React
          </Heading>
          <Paragraph className="mt-2 text-sm sm:text-[15px] text-[#a39a88]">
            Kumimono — a Japanese roof-bracket set, 56 parts
          </Paragraph>
          <Paragraph className="sr-only">
            A 3D study of Japanese timber roof brackets. Use the button or assembly slider to
            separate and rejoin its 56 parts.
          </Paragraph>
        </View>
        <View className="flex flex-row flex-wrap items-center gap-4">
          <Link
            href={`${cleanBase}/three/`}
            className="text-xs text-[#c8a06a] whitespace-nowrap hover:underline focus-visible:outline-2 focus-visible:outline-offset-[5px] focus-visible:outline-[#e0c195]"
          >
            3D Documentation &rarr;
          </Link>
          <Link
            href="https://github.com/iray-tno/hozo/tree/main/apps/landing/src/components/Kumimono.tsx"
            className="text-xs text-[#c8a06a] whitespace-nowrap hover:underline focus-visible:outline-2 focus-visible:outline-offset-[5px] focus-visible:outline-[#e0c195]"
          >
            View source ↗
          </Link>
        </View>
      </View>
      {/* A div rather than a View: the observer and the WebGL canvas need the
          element itself, and `data-*` here is what the browser check reads. */}
      <div
        ref={root}
        className="kumimono-stage relative h-[440px] sm:h-[560px] overflow-hidden bg-[#080806] border border-[#c8a06a26] rounded-t-xl"
        data-playing={playing && visible}
        data-progress={Math.round(progress * 100)}
      >
        {study && !error ? (
          <ThreeCanvas
            scene={study.scene}
            camera={study.camera}
            decorative
            style={{ width: '100%', height: '100%', display: 'block' }}
            pixelRatio={Math.min(globalThis.devicePixelRatio || 1, 1.5)}
            frameloop={playing && visible ? 'always' : 'demand'}
            revision={progress}
            onFrame={frame}
            onCreated={configureKumimonoRenderer}
            onResize={({ width }) => {
              study.camera.fov = width < 600 ? 50 : 40
              study.camera.updateProjectionMatrix()
            }}
            onError={() => {
              setError(true)
              setPlaying(false)
            }}
          />
        ) : (
          <Paragraph className="absolute inset-0 grid place-items-center p-6 text-center text-[#a39a88]">
            {error
              ? 'The 3D study needs WebGL. You can still explore the source.'
              : 'Kumimono · 3D assembly study'}
          </Paragraph>
        )}
        <Text
          aria-hidden
          className="absolute bottom-5 left-6 font-mono text-[10px] text-[#a39a88] pointer-events-none"
        >
          {study?.pieceCount ?? 0} parts · procedural geometry
        </Text>
      </div>
      <View className="flex flex-row flex-wrap sm:flex-nowrap items-center gap-3.5 sm:gap-5 p-4 sm:px-6 sm:py-[18px] border border-t-0 border-[#c8a06a26] rounded-b-xl bg-[#100f0b] text-xs">
        <Button
          disabled={!study || error}
          onPress={toggle}
          className="min-h-11 min-w-28 px-3.5 py-[9px] border border-[#c8a06a66] rounded text-[#e0c195] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-[5px] focus-visible:outline-[#e0c195]"
        >
          {playing ? 'Reverse' : progress > 0.5 ? 'Disassemble' : 'Assemble'}
        </Button>
        {/* Seen, not read: the slider carries the same word as its name. */}
        <Text aria-hidden className="flex-1 sm:flex-none text-[#a39a88]">
          Assembly
        </Text>
        <Slider
          min={0}
          max={1000}
          step={1}
          bigStep={100}
          value={Math.round(progress * 1000)}
          disabled={!study || error}
          accessibilityLabel="Assembly"
          valueText={(value) => `${Math.round(value / 10)}% assembled`}
          onValueChange={(value) => {
            setPlaying(false)
            const fraction = value / 1000
            animation.current.to = fraction
            study?.update(fraction)
            setProgress(fraction)
          }}
          className="relative mx-2.5 order-1 sm:order-none basis-[calc(100%-80px)] sm:basis-auto flex-1 min-w-0 h-8 cursor-pointer touch-none before:absolute before:inset-x-0 before:top-1/2 before:h-1 before:-translate-y-1/2 before:rounded-full before:bg-[#c8a06a33] data-[hozo-disabled]:opacity-50 data-[hozo-disabled]:cursor-default"
          fillClassName="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[#c8a06a]"
          thumbClassName="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#e0c195] focus-visible:outline-2 focus-visible:outline-offset-[5px] focus-visible:outline-[#e0c195]"
        />
        <Text className="order-2 sm:order-none w-[4ch] text-right tabular-nums">
          {Math.round(progress * 100)}%
        </Text>
      </View>
    </Section>
  )
}
