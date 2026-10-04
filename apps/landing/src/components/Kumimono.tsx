import { configureKumimonoRenderer, createKumimonoScene } from '@hozo/example-three-kumimono'
import { ThreeCanvas, type ThreeCanvasFrame } from '@hozo/three/webgl'
import { useEffect, useRef, useState } from 'react'

type Study = ReturnType<typeof createKumimonoScene>

export function Kumimono() {
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
    <section id="kumimono" className="kumimono-section" aria-labelledby="kumimono-heading">
      <div className="kumimono-heading">
        <div>
          <p className="kumimono-eyebrow">@hozo/three · WebGL</p>
          {/* The heading says what the section shows a developer; the subject
              is the line under it. It used to be 組物 Kumimono: a term most
              readers of an English page cannot read, without lang="ja", so a
              screen reader voiced the kanji with an English voice. */}
          <h2 id="kumimono-heading">Interactive 3D, from the same React</h2>
          <p className="kumimono-subject">Kumimono — a Japanese roof-bracket set, 56 parts</p>
          <p id="kumimono-description" className="sr-only">
            A 3D study of Japanese timber roof brackets. Use the button or assembly slider to
            separate and rejoin its 56 parts.
          </p>
        </div>
        <a href="https://github.com/iray-tno/hozo/tree/main/apps/landing/src/components/Kumimono.tsx">
          View source ↗
        </a>
      </div>
      <div
        ref={root}
        className="kumimono-stage"
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
          <p className="kumimono-placeholder">
            {error
              ? 'The 3D study needs WebGL. You can still explore the source.'
              : 'Kumimono · 3D assembly study'}
          </p>
        )}
        <div className="kumimono-caption" aria-hidden="true">
          {study?.pieceCount ?? 0} parts · procedural geometry
        </div>
      </div>
      <div className="kumimono-controls">
        <button type="button" disabled={!study || error} onClick={toggle}>
          {playing ? 'Reverse' : progress > 0.5 ? 'Disassemble' : 'Assemble'}
        </button>
        <label htmlFor="kumimono-progress">Assembly</label>
        <input
          id="kumimono-progress"
          type="range"
          min="0"
          max="1000"
          step="1"
          value={Math.round(progress * 1000)}
          disabled={!study || error}
          aria-valuetext={`${Math.round(progress * 100)}% assembled`}
          aria-describedby="kumimono-description"
          onChange={(event) => {
            setPlaying(false)
            const value = Number(event.currentTarget.value) / 1000
            animation.current.to = value
            study?.update(value)
            setProgress(value)
          }}
        />
        <output htmlFor="kumimono-progress" aria-live="off">
          {Math.round(progress * 100)}%
        </output>
      </div>
    </section>
  )
}
