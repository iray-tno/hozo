import { useState } from 'react'

type SvgShape = 'badge' | 'emblem' | 'stamp'

export function SvgWorkbench() {
  const [shape, setShape] = useState<SvgShape>('badge')
  const [dx, setDx] = useState(0)
  const [dy, setDy] = useState(4)
  const [blur, setBlur] = useState(6)
  const [opacity, setOpacity] = useState(0.4)
  const [floodColor, setFloodColor] = useState('#c8a882')
  const [glowBlur, setGlowBlur] = useState(2)
  const [codeTab, setCodeTab] = useState<'jsx' | 'web' | 'native'>('jsx')

  const filterId = 'studio-filter'
  const glowId = 'studio-glow'

  return (
    <div className="rounded-2xl border border-wood bg-yakisugi-950 overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-wood bg-yakisugi-900/60 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-hinoki animate-pulse" />
            <h3 className="text-lg font-bold text-shikkui">Interactive SVG & Filter Studio</h3>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-wood-subtle text-hinoki border border-wood">
              @hozo/svg
            </span>
          </div>
          <p className="text-xs text-stone-400 mt-1">
            Zero-runtime lowering · Real-time filter effects (feDropShadow, feGaussianBlur) · Live
            code generator
          </p>
        </div>

        {/* Shape Preset Selector */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-yakisugi-950 border border-wood">
          <button
            type="button"
            onClick={() => setShape('badge')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              shape === 'badge'
                ? 'bg-hinoki/20 text-hinoki border border-hinoki/30 shadow-sm'
                : 'text-stone-400 hover:text-shikkui'
            }`}
          >
            Verified Badge
          </button>
          <button
            type="button"
            onClick={() => setShape('emblem')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              shape === 'emblem'
                ? 'bg-hinoki/20 text-hinoki border border-hinoki/30 shadow-sm'
                : 'text-stone-400 hover:text-shikkui'
            }`}
          >
            Timber Emblem
          </button>
          <button
            type="button"
            onClick={() => setShape('stamp')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              shape === 'stamp'
                ? 'bg-hinoki/20 text-hinoki border border-hinoki/30 shadow-sm'
                : 'text-stone-400 hover:text-shikkui'
            }`}
          >
            Bengara Stamp
          </button>
        </div>
      </div>

      {/* Main Studio Grid: Left Live Preview, Right Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-wood">
        {/* Left: SVG Canvas Viewport */}
        <div className="lg:col-span-6 p-6 sm:p-10 flex flex-col items-center justify-center bg-[#0d0c0a] relative min-h-[360px]">
          <div className="w-64 h-64 flex items-center justify-center relative">
            <svg
              className="w-full h-full drop-shadow-sm select-none"
              viewBox="0 0 200 200"
              xmlns="http://www.w3.org/2000/svg"
              aria-label="Interactive SVG Vector Graphic with Filter"
            >
              <defs>
                <filter id={filterId} x="-40%" y="-40%" width="180%" height="180%">
                  <feDropShadow
                    dx={dx}
                    dy={dy}
                    stdDeviation={blur}
                    floodColor={floodColor}
                    floodOpacity={opacity}
                  />
                </filter>
                <filter id={glowId}>
                  <feGaussianBlur stdDeviation={glowBlur} />
                </filter>
                <linearGradient id="studio-grad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#dfc8ab" />
                  <stop offset="100%" stopColor="#9e3d31" />
                </linearGradient>
              </defs>

              {shape === 'badge' && (
                <g filter={`url(#${filterId})`}>
                  <circle cx="100" cy="100" r="64" fill="#c8a882" />
                  <circle cx="100" cy="100" r="54" fill="#141312" />
                  <path
                    d="M75 100 L92 117 L128 80"
                    stroke="#c8a882"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                  <circle
                    cx="100"
                    cy="100"
                    r="46"
                    stroke="#c8a882"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                    fill="none"
                  />
                </g>
              )}

              {shape === 'emblem' && (
                <g filter={`url(#${filterId})`}>
                  {/* Japanese Joinery Emblem */}
                  <polygon
                    points="100,28 168,68 168,148 100,188 32,148 32,68"
                    fill="#1c1a18"
                    stroke="#c8a882"
                    strokeWidth="3"
                  />
                  <polygon
                    points="100,48 148,76 148,136 100,164 52,136 52,76"
                    fill="#141312"
                    stroke="#a8855e"
                    strokeWidth="2"
                  />
                  <circle
                    cx="100"
                    cy="106"
                    r="28"
                    fill="url(#studio-grad)"
                    filter={`url(#${glowId})`}
                  />
                  <line x1="100" y1="56" x2="100" y2="156" stroke="#c8a882" strokeWidth="2" />
                  <line x1="56" y1="106" x2="144" y2="106" stroke="#c8a882" strokeWidth="2" />
                </g>
              )}

              {shape === 'stamp' && (
                <g filter={`url(#${filterId})`}>
                  <rect x="36" y="36" width="128" height="128" rx="20" fill="#9e3d31" />
                  <rect
                    x="46"
                    y="46"
                    width="108"
                    height="108"
                    rx="14"
                    fill="#141312"
                    stroke="#9e3d31"
                    strokeWidth="2"
                  />
                  <text
                    x="100"
                    y="118"
                    textAnchor="middle"
                    fill="#dfc8ab"
                    fontFamily="Zen Kaku Gothic New, sans-serif"
                    fontSize="46"
                    fontWeight="bold"
                    letterSpacing="0.05em"
                  >
                    組
                  </text>
                  <circle
                    cx="100"
                    cy="100"
                    r="50"
                    stroke="#9e3d31"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                    fill="none"
                  />
                </g>
              )}
            </svg>
          </div>

          <div className="mt-4 text-xs font-mono text-stone-400">
            Real SVG DOM Rendering · Zero Runtime Wrappers
          </div>
        </div>

        {/* Right: Live Filter Parameters */}
        <div className="lg:col-span-6 p-6 sm:p-8 flex flex-col justify-between bg-yakisugi-900/40">
          <div>
            <h4 className="text-sm font-bold text-shikkui mb-4 flex items-center justify-between">
              <span>Filter Parameters</span>
              <span className="text-[11px] font-mono text-hinoki">Svg.FeDropShadow</span>
            </h4>

            <div className="space-y-4 text-xs">
              {/* dx offset */}
              <div className="flex items-center justify-between gap-4">
                <span className="text-stone-300 font-medium w-28">dx (Horizontal):</span>
                <input
                  type="range"
                  min="-10"
                  max="10"
                  value={dx}
                  onChange={(e) => setDx(Number(e.target.value))}
                  className="flex-1 accent-hinoki cursor-pointer"
                />
                <span className="font-mono text-stone-300 w-12 text-right">{dx}px</span>
              </div>

              {/* dy offset */}
              <div className="flex items-center justify-between gap-4">
                <span className="text-stone-300 font-medium w-28">dy (Vertical):</span>
                <input
                  type="range"
                  min="0"
                  max="20"
                  value={dy}
                  onChange={(e) => setDy(Number(e.target.value))}
                  className="flex-1 accent-hinoki cursor-pointer"
                />
                <span className="font-mono text-stone-300 w-12 text-right">{dy}px</span>
              </div>

              {/* stdDeviation (blur) */}
              <div className="flex items-center justify-between gap-4">
                <span className="text-stone-300 font-medium w-28">stdDeviation:</span>
                <input
                  type="range"
                  min="0"
                  max="20"
                  value={blur}
                  onChange={(e) => setBlur(Number(e.target.value))}
                  className="flex-1 accent-hinoki cursor-pointer"
                />
                <span className="font-mono text-stone-300 w-12 text-right">{blur}px</span>
              </div>

              {/* Opacity */}
              <div className="flex items-center justify-between gap-4">
                <span className="text-stone-300 font-medium w-28">floodOpacity:</span>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={opacity}
                  onChange={(e) => setOpacity(Number(e.target.value))}
                  className="flex-1 accent-hinoki cursor-pointer"
                />
                <span className="font-mono text-stone-300 w-12 text-right">
                  {Math.round(opacity * 100)}%
                </span>
              </div>

              {/* Glow Blur */}
              <div className="flex items-center justify-between gap-4">
                <span className="text-stone-300 font-medium w-28">Glow Radius:</span>
                <input
                  type="range"
                  min="0"
                  max="8"
                  value={glowBlur}
                  onChange={(e) => setGlowBlur(Number(e.target.value))}
                  className="flex-1 accent-hinoki cursor-pointer"
                />
                <span className="font-mono text-stone-300 w-12 text-right">{glowBlur}px</span>
              </div>

              {/* Flood Color Presets */}
              <div className="pt-2 flex items-center justify-between gap-4">
                <span className="text-stone-300 font-medium w-28">floodColor:</span>
                <div className="flex items-center gap-2">
                  {[
                    { label: 'Hinoki', value: '#c8a882' },
                    { label: 'Bengara', value: '#9e3d31' },
                    { label: 'Tatami', value: '#708260' },
                    { label: 'Sumi', value: '#141312' },
                  ].map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setFloodColor(c.value)}
                      className={`px-2.5 py-1 rounded text-[11px] font-mono transition-all flex items-center gap-1.5 ${
                        floodColor === c.value
                          ? 'border border-shikkui text-shikkui bg-yakisugi-800'
                          : 'border border-wood text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: c.value }}
                      />
                      <span>{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Filter Presets */}
          <div className="mt-6 pt-4 border-t border-wood flex items-center justify-between">
            <span className="text-xs font-mono text-stone-400">Presets:</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setDx(0)
                  setDy(4)
                  setBlur(6)
                  setOpacity(0.4)
                  setFloodColor('#c8a882')
                }}
                className="px-2.5 py-1 rounded bg-yakisugi-950 border border-wood text-[11px] text-stone-300 hover:text-shikkui"
              >
                Soft Ambient
              </button>
              <button
                type="button"
                onClick={() => {
                  setDx(0)
                  setDy(8)
                  setBlur(16)
                  setOpacity(0.8)
                  setFloodColor('#9e3d31')
                }}
                className="px-2.5 py-1 rounded bg-yakisugi-950 border border-wood text-[11px] text-stone-300 hover:text-shikkui"
              >
                Dramatic Crimson
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Code Preview Pane with Tabs */}
      <div className="border-t border-wood bg-yakisugi-950">
        <div className="px-4 py-2 border-b border-wood-subtle flex items-center justify-between bg-yakisugi-900/80">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCodeTab('jsx')}
              className={`px-3 py-1 rounded text-xs font-mono font-semibold transition-all ${
                codeTab === 'jsx'
                  ? 'bg-wood-strong text-hinoki border border-hinoki/30'
                  : 'text-stone-400 hover:text-shikkui'
              }`}
            >
              Hozo JSX (@hozo/svg)
            </button>
            <button
              type="button"
              onClick={() => setCodeTab('web')}
              className={`px-3 py-1 rounded text-xs font-mono font-semibold transition-all ${
                codeTab === 'web'
                  ? 'bg-wood-strong text-hinoki border border-hinoki/30'
                  : 'text-stone-400 hover:text-shikkui'
              }`}
            >
              Lowered Web DOM
            </button>
            <button
              type="button"
              onClick={() => setCodeTab('native')}
              className={`px-3 py-1 rounded text-xs font-mono font-semibold transition-all ${
                codeTab === 'native'
                  ? 'bg-wood-strong text-hinoki border border-hinoki/30'
                  : 'text-stone-400 hover:text-shikkui'
              }`}
            >
              Lowered Native (react-native-svg)
            </button>
          </div>
          <span className="text-[11px] font-mono text-emerald-400">Zero Runtime Lowering</span>
        </div>

        <div className="p-4 sm:p-5 overflow-x-auto font-mono text-xs text-shikkui-muted leading-relaxed max-h-48">
          {codeTab === 'jsx' && (
            <pre>
              <code>{`<Svg viewBox="0 0 200 200">
  <Svg.Defs>
    <Svg.Filter id="drop-shadow" x="-40%" y="-40%" width="180%" height="180%">
      <Svg.FeDropShadow dx={${dx}} dy={${dy}} stdDeviation={${blur}} floodColor="${floodColor}" floodOpacity={${opacity}} />
    </Svg.Filter>
  </Svg.Defs>
  <Svg.Circle cx={100} cy={100} r={64} fill="#c8a882" filter="url(#drop-shadow)" />
</Svg>`}</code>
            </pre>
          )}

          {codeTab === 'web' && (
            <pre>
              <code>{`<!-- Web: Zero-runtime native DOM lowering -->
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="drop-shadow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="${dx}" dy="${dy}" stdDeviation="${blur}" flood-color="${floodColor}" flood-opacity="${opacity}" />
    </filter>
  </defs>
  <circle cx="100" cy="100" r="64" fill="#c8a882" filter="url(#drop-shadow)" />
</svg>`}</code>
            </pre>
          )}

          {codeTab === 'native' && (
            <pre>
              <code>{`// React Native: Lowered directly to react-native-svg elements
import Svg, { Defs, Filter, FeDropShadow, Circle } from 'react-native-svg'

<Svg viewBox="0 0 200 200">
  <Defs>
    <Filter id="drop-shadow" x="-40%" y="-40%" width="180%" height="180%">
      <FeDropShadow dx={${dx}} dy={${dy}} stdDeviation={${blur}} floodColor="${floodColor}" floodOpacity={${opacity}} />
    </Filter>
  </Defs>
  <Circle cx={100} cy={100} r={64} fill="#c8a882" filter="url(#drop-shadow)" />
</Svg>`}</code>
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
