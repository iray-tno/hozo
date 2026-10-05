import { useEffect, useRef, useState } from 'react'

type CanvasMode = 'waves' | 'particles' | 'candlestick'
type Palette = 'hinoki' | 'bengara' | 'tatami'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  color: string
}

interface Candle {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

const PALETTES: Record<
  Palette,
  { primary: string; secondary: string; accent: string; bg: string }
> = {
  hinoki: {
    primary: '#c8a882',
    secondary: '#dfc8ab',
    accent: '#a8855e',
    bg: 'rgba(200, 168, 130, 0.08)',
  },
  bengara: {
    primary: '#9e3d31',
    secondary: '#b54738',
    accent: '#dfc8ab',
    bg: 'rgba(158, 61, 49, 0.12)',
  },
  tatami: {
    primary: '#708260',
    secondary: '#8a9e77',
    accent: '#c8a882',
    bg: 'rgba(112, 130, 96, 0.1)',
  },
}

export function CanvasWorkbench() {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [mode, setMode] = useState<CanvasMode>('waves')
  const [palette, setPalette] = useState<Palette>('hinoki')
  const [density, setDensity] = useState(500)
  const [isPlaying, setIsPlaying] = useState(true)
  const [fps, setFps] = useState(60)
  const [showTable, setShowTable] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null)

  const mousePos = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false })
  const candlesRef = useRef<Candle[]>([])
  const particlesRef = useRef<Particle[]>([])
  const frameCountRef = useRef(0)
  const lastFpsTimeRef = useRef(performance.now())

  // Generate sample candlestick financial data
  useEffect(() => {
    const list: Candle[] = []
    let current = 180
    const now = new Date()
    for (let i = 40; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000)
      const dateStr = `${d.getMonth() + 1}/${d.getDate()}`
      const delta = (Math.random() - 0.48) * 12
      const open = Math.round(current)
      const close = Math.round(open + delta)
      const high = Math.round(Math.max(open, close) + Math.random() * 8)
      const low = Math.round(Math.min(open, close) - Math.random() * 8)
      const volume = Math.round(5000 + Math.random() * 15000)
      current = close
      list.push({ date: dateStr, open, high, low, close, volume })
    }
    candlesRef.current = list
  }, [])

  // Initialize particles
  useEffect(() => {
    const colors = [
      PALETTES[palette].primary,
      PALETTES[palette].secondary,
      PALETTES[palette].accent,
    ]
    const p: Particle[] = []
    for (let i = 0; i < density; i++) {
      p.push({
        x: Math.random() * 800,
        y: Math.random() * 450,
        vx: (Math.random() - 0.5) * 1.6,
        vy: (Math.random() - 0.5) * 1.6,
        radius: Math.random() * 2.5 + 1,
        color: colors[Math.floor(Math.random() * colors.length)],
      })
    }
    particlesRef.current = p
  }, [density, palette])

  // Reduced motion preference
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(media.matches)
    const listener = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [])

  // Render loop
  useEffect(() => {
    let animId: number
    let isVisible = true

    const observer = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting
    })
    if (containerRef.current) observer.observe(containerRef.current)

    let step = 0
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    function render() {
      if (!isVisible || (!isPlaying && !reducedMotion)) {
        animId = requestAnimationFrame(render)
        return
      }

      const now = performance.now()
      frameCountRef.current++
      if (now - lastFpsTimeRef.current >= 1000) {
        setFps(Math.round((frameCountRef.current * 1000) / (now - lastFpsTimeRef.current)))
        frameCountRef.current = 0
        lastFpsTimeRef.current = now
      }

      step += 0.02
      ctx.clearRect(0, 0, 800, 450)

      // Background grid
      ctx.strokeStyle = 'rgba(200, 168, 130, 0.06)'
      ctx.lineWidth = 1
      for (let x = 0; x <= 800; x += 50) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, 450)
        ctx.stroke()
      }
      for (let y = 0; y <= 450; y += 45) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(800, y)
        ctx.stroke()
      }

      const colors = PALETTES[palette]

      if (mode === 'waves') {
        // Multi-layered animated sine waves
        const waveCount = 4
        for (let w = 0; w < waveCount; w++) {
          ctx.beginPath()
          ctx.moveTo(0, 450)
          const baseHeight = 220 + w * 40
          for (let x = 0; x <= 800; x += 10) {
            const freq = 0.008 + w * 0.003
            const phase = step * (1 + w * 0.4)
            const y =
              baseHeight +
              Math.sin(x * freq + phase) * (35 + w * 12) +
              Math.cos(x * 0.004 + phase * 0.8) * 15
            ctx.lineTo(x, y)
          }
          ctx.lineTo(800, 450)
          ctx.closePath()

          const grad = ctx.createLinearGradient(0, 150, 0, 450)
          grad.addColorStop(0, w % 2 === 0 ? colors.primary : colors.secondary)
          grad.addColorStop(1, 'rgba(16, 15, 14, 0)')
          ctx.fillStyle = grad
          ctx.globalAlpha = 0.25 - w * 0.04
          ctx.fill()

          ctx.strokeStyle = w % 2 === 0 ? colors.primary : colors.accent
          ctx.globalAlpha = 0.8 - w * 0.15
          ctx.lineWidth = 2
          ctx.stroke()
        }
        ctx.globalAlpha = 1
      } else if (mode === 'particles') {
        // Spatial particles reacting to mouse
        const particles = particlesRef.current
        const mouse = mousePos.current
        const radiusDist = 100

        for (const p of particles) {
          if (!reducedMotion && isPlaying) {
            p.x += p.vx
            p.y += p.vy
            if (p.x < 0 || p.x > 800) p.vx *= -1
            if (p.y < 0 || p.y > 450) p.vy *= -1

            // Spatial repulsion from mouse
            if (mouse.active) {
              const dx = p.x - mouse.x
              const dy = p.y - mouse.y
              const dist = Math.hypot(dx, dy)
              if (dist < radiusDist && dist > 0) {
                const force = (radiusDist - dist) / radiusDist
                p.x += (dx / dist) * force * 4
                p.y += (dy / dist) * force * 4
              }
            }
          }

          ctx.beginPath()
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
          ctx.fillStyle = p.color
          ctx.fill()
        }

        // Draw spatial circle around cursor if active
        if (mouse.active) {
          ctx.beginPath()
          ctx.arc(mouse.x, mouse.y, radiusDist, 0, Math.PI * 2)
          ctx.strokeStyle = colors.primary
          ctx.lineWidth = 1
          ctx.setLineDash([4, 4])
          ctx.stroke()
          ctx.setLineDash([])
        }
      } else if (mode === 'candlestick') {
        // Japanese Candlestick Chart
        const candles = candlesRef.current
        if (candles.length > 0) {
          const slotWidth = 800 / candles.length
          const minPrice = 140
          const maxPrice = 240
          const priceRange = maxPrice - minPrice
          const chartHeight = 320

          // Volume bars
          const maxVol = 25000
          candles.forEach((c, i) => {
            const x = i * slotWidth + slotWidth * 0.2
            const w = slotWidth * 0.6
            const volH = (c.volume / maxVol) * 80
            ctx.fillStyle = c.close >= c.open ? 'rgba(112, 130, 96, 0.3)' : 'rgba(158, 61, 49, 0.3)'
            ctx.fillRect(x, 450 - volH, w, volH)
          })

          // Moving average curve
          ctx.beginPath()
          ctx.strokeStyle = colors.primary
          ctx.lineWidth = 2
          candles.forEach((c, i) => {
            const x = i * slotWidth + slotWidth / 2
            const y = chartHeight - ((c.close - minPrice) / priceRange) * chartHeight + 20
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          })
          ctx.stroke()

          // Candlestick bodies and wicks
          candles.forEach((c, i) => {
            const x = i * slotWidth + slotWidth * 0.15
            const w = slotWidth * 0.7
            const cx = i * slotWidth + slotWidth / 2

            const yHigh = chartHeight - ((c.high - minPrice) / priceRange) * chartHeight + 20
            const yLow = chartHeight - ((c.low - minPrice) / priceRange) * chartHeight + 20
            const yOpen = chartHeight - ((c.open - minPrice) / priceRange) * chartHeight + 20
            const yClose = chartHeight - ((c.close - minPrice) / priceRange) * chartHeight + 20

            const isUp = c.close >= c.open
            const candleColor = isUp ? '#708260' : '#9e3d31'

            // Wick
            ctx.beginPath()
            ctx.strokeStyle = candleColor
            ctx.lineWidth = 1.5
            ctx.moveTo(cx, yHigh)
            ctx.lineTo(cx, yLow)
            ctx.stroke()

            // Body
            const topY = Math.min(yOpen, yClose)
            const bodyH = Math.max(Math.abs(yClose - yOpen), 2)
            ctx.fillStyle = candleColor
            ctx.fillRect(x, topY, w, bodyH)
          })

          // Cursor crosshair & hit test
          if (mousePos.current.active) {
            const mx = mousePos.current.x
            const my = mousePos.current.y
            ctx.strokeStyle = 'rgba(224, 193, 149, 0.6)'
            ctx.lineWidth = 1
            ctx.setLineDash([3, 3])
            ctx.beginPath()
            ctx.moveTo(mx, 0)
            ctx.lineTo(mx, 450)
            ctx.moveTo(0, my)
            ctx.lineTo(800, my)
            ctx.stroke()
            ctx.setLineDash([])

            const idx = Math.floor(mx / slotWidth)
            if (idx >= 0 && idx < candles.length) {
              setHoveredCandle(candles[idx])
            }
          }
        }
      }

      if (!reducedMotion && isPlaying) {
        animId = requestAnimationFrame(render)
      }
    }

    render()
    return () => {
      cancelAnimationFrame(animId)
      observer.disconnect()
    }
  }, [mode, palette, isPlaying, reducedMotion])

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const scaleX = 800 / rect.width
    const scaleY = 450 / rect.height
    mousePos.current = {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
      active: true,
    }
  }

  function handleMouseLeave() {
    mousePos.current.active = false
    setHoveredCandle(null)
  }

  return (
    <div
      ref={containerRef}
      className="rounded-2xl border border-wood bg-yakisugi-950 overflow-hidden shadow-2xl"
    >
      {/* Workbench Header & Mode Selector */}
      <div className="p-4 sm:p-6 border-b border-wood bg-yakisugi-900/60 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-tatami-light animate-pulse" />
            <h3 className="text-lg font-bold text-shikkui">Interactive 2D Canvas Workbench</h3>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-wood-subtle text-hinoki border border-wood">
              @hozo/canvas
            </span>
          </div>
          <p className="text-xs text-stone-400 mt-1">
            Single GPU surface · Zero DOM node explosion · Native Skia & HTML5 Canvas parity
          </p>
        </div>

        {/* Mode Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-yakisugi-950 border border-wood">
          <button
            type="button"
            onClick={() => setMode('waves')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              mode === 'waves'
                ? 'bg-tatami-light/20 text-tatami-light border border-tatami-light/30 shadow-sm'
                : 'text-stone-400 hover:text-shikkui'
            }`}
          >
            Vector Waves
          </button>
          <button
            type="button"
            onClick={() => setMode('particles')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              mode === 'particles'
                ? 'bg-tatami-light/20 text-tatami-light border border-tatami-light/30 shadow-sm'
                : 'text-stone-400 hover:text-shikkui'
            }`}
          >
            1,000 Particles
          </button>
          <button
            type="button"
            onClick={() => setMode('candlestick')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              mode === 'candlestick'
                ? 'bg-tatami-light/20 text-tatami-light border border-tatami-light/30 shadow-sm'
                : 'text-stone-400 hover:text-shikkui'
            }`}
          >
            Candlestick Chart
          </button>
        </div>
      </div>

      {/* Main Canvas Area with HUD */}
      <div className="relative aspect-[16/9] w-full bg-[#0d0c0a] overflow-hidden select-none">
        <canvas
          ref={canvasRef}
          width={800}
          height={450}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="w-full h-full block cursor-crosshair"
          aria-label="Interactive 2D data visualization canvas"
        />

        {/* Live HUD Overlay */}
        <div className="absolute top-4 left-4 flex flex-wrap items-center gap-2 pointer-events-none font-mono text-[11px]">
          <span className="px-2.5 py-1 rounded-md bg-yakisugi-900/90 border border-wood text-emerald-400 backdrop-blur-sm">
            FPS: {fps}
          </span>
          <span className="px-2.5 py-1 rounded-md bg-yakisugi-900/90 border border-wood text-shikkui backdrop-blur-sm">
            DOM Nodes: 1 &lt;canvas&gt;
          </span>
          <span className="px-2.5 py-1 rounded-md bg-yakisugi-900/90 border border-wood text-hinoki backdrop-blur-sm">
            {mode === 'particles'
              ? `Points: ${density}`
              : mode === 'candlestick'
                ? 'Points: 40 Intervals'
                : 'Batched Paths: 4 Waves'}
          </span>
        </div>

        {/* Candlestick Crosshair Tooltip */}
        {mode === 'candlestick' && hoveredCandle && (
          <div className="absolute top-4 right-4 p-3 rounded-xl bg-yakisugi-900/95 border border-wood-strong text-xs font-mono backdrop-blur-md shadow-2xl pointer-events-none">
            <div className="font-bold text-shikkui mb-1 border-b border-wood pb-1">
              Date: {hoveredCandle.date}
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
              <span className="text-stone-400">Open:</span>
              <span className="text-shikkui font-semibold">${hoveredCandle.open}</span>
              <span className="text-stone-400">High:</span>
              <span className="text-emerald-400 font-semibold">${hoveredCandle.high}</span>
              <span className="text-stone-400">Low:</span>
              <span className="text-bengara font-semibold">${hoveredCandle.low}</span>
              <span className="text-stone-400">Close:</span>
              <span
                className={`font-semibold ${hoveredCandle.close >= hoveredCandle.open ? 'text-emerald-400' : 'text-bengara'}`}
              >
                ${hoveredCandle.close}
              </span>
              <span className="text-stone-400">Volume:</span>
              <span className="text-hinoki">{hoveredCandle.volume.toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>

      {/* Control Bar */}
      <div className="p-4 sm:p-5 border-t border-wood bg-yakisugi-900/60 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          {/* Palette Selector */}
          <div className="flex items-center gap-2">
            <span className="text-stone-400 font-medium">Palette:</span>
            <div className="flex items-center gap-1.5">
              {(['hinoki', 'bengara', 'tatami'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPalette(p)}
                  className={`px-2.5 py-1 rounded text-[11px] font-mono capitalize transition-all ${
                    palette === p
                      ? 'bg-wood-strong text-shikkui border border-hinoki/50'
                      : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Density slider (for particles) */}
          {mode === 'particles' && (
            <div className="flex items-center gap-2">
              <span className="text-stone-400 font-medium">Density:</span>
              <input
                type="range"
                min="200"
                max="1000"
                step="100"
                value={density}
                onChange={(e) => setDensity(Number(e.target.value))}
                className="w-24 accent-tatami-light cursor-pointer"
              />
              <span className="font-mono text-stone-300 w-8">{density}</span>
            </div>
          )}

          {/* Play/Pause */}
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            className="px-3 py-1 rounded bg-yakisugi-800 border border-wood text-shikkui hover:border-wood-strong transition-colors font-mono text-[11px]"
          >
            {isPlaying ? 'Pause Loop' : 'Resume Loop'}
          </button>
        </div>

        {/* Accessible Sibling Table Toggle */}
        <button
          type="button"
          onClick={() => setShowTable(!showTable)}
          className="px-3 py-1 rounded bg-tatami/20 text-tatami-light border border-tatami/40 hover:bg-tatami/30 transition-colors font-medium text-xs flex items-center gap-1.5"
        >
          <span>{showTable ? 'Hide Sibling DOM Table' : 'View Accessible Sibling Table'}</span>
          <span className="text-[10px]">&darr;</span>
        </button>
      </div>

      {/* Accessible Sibling DOM Table (Demonstrating Hozo's A11y invariant) */}
      {showTable && (
        <div className="p-4 sm:p-6 border-t border-wood bg-yakisugi-950 max-h-64 overflow-y-auto">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold text-hinoki uppercase tracking-wider font-mono">
              Semantic Sibling Table (Screen Reader Parity)
            </span>
            <span className="text-[11px] text-stone-500">
              Generated alongside Canvas draw calls
            </span>
          </div>
          <table className="w-full text-left text-xs font-mono text-stone-300 divide-y divide-wood">
            <thead>
              <tr className="text-stone-400 border-b border-wood">
                <th className="py-1.5">Interval / Date</th>
                <th className="py-1.5">Open</th>
                <th className="py-1.5">High</th>
                <th className="py-1.5">Low</th>
                <th className="py-1.5">Close</th>
                <th className="py-1.5">Volume</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-wood/30">
              {candlesRef.current.slice(-8).map((c) => (
                <tr key={c.date} className="hover:bg-wood/10">
                  <td className="py-1.5 text-stone-400">{c.date}</td>
                  <td className="py-1.5">${c.open}</td>
                  <td className="py-1.5 text-emerald-400">${c.high}</td>
                  <td className="py-1.5 text-bengara">${c.low}</td>
                  <td
                    className={`py-1.5 font-bold ${c.close >= c.open ? 'text-emerald-400' : 'text-bengara'}`}
                  >
                    ${c.close}
                  </td>
                  <td className="py-1.5 text-hinoki">{c.volume.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
