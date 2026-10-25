// Draws Hozo's mark, a four-way dovetail (四方蟻, shihō-ari), and writes it as
// the favicon and as the shapes the header's BrandMark renders:
//
//   node scripts/brand-mark.mjs
//
// Two square timbers meet end to end. The upper one carries two dovetail
// tongues that run along the square's diagonal, each cutting across a corner,
// so every face shows one dovetail. The tongues run parallel, so the joint goes
// together by sliding horizontally along that diagonal; the mark shows it a
// little short of home. It is drawn flat and corner-on: one colour per piece
// and per side, so neighbouring faces of one colour merge into one shape.
import { writeFileSync } from 'node:fs'

const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k]
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross3 = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const unit = (a) => mul3(a, 1 / Math.hypot(...a))
const EPS = 1e-7

// A convex solid: the intersection of half-spaces n·p <= d, each tagged.
function solid(planes, part) {
  const R = 10
  const P = (x, y, z) => [x * R, y * R, z * R]
  let faces = [
    [P(-1, -1, -1), P(1, -1, -1), P(1, 1, -1), P(-1, 1, -1)],
    [P(-1, -1, 1), P(-1, 1, 1), P(1, 1, 1), P(1, -1, 1)],
    [P(-1, -1, -1), P(-1, 1, -1), P(-1, 1, 1), P(-1, -1, 1)],
    [P(1, -1, -1), P(1, -1, 1), P(1, 1, 1), P(1, 1, -1)],
    [P(-1, -1, -1), P(-1, -1, 1), P(1, -1, 1), P(1, -1, -1)],
    [P(-1, 1, -1), P(1, 1, -1), P(1, 1, 1), P(-1, 1, 1)],
  ].map((pts) => ({ pts, tag: 'box' }))
  for (const { n, d, tag } of planes) {
    const cap = []
    const next = []
    for (const f of faces) {
      const out = []
      for (let i = 0; i < f.pts.length; i++) {
        const A = f.pts[i]
        const B = f.pts[(i + 1) % f.pts.length]
        const da = dot3(n, A) - d
        const db = dot3(n, B) - d
        if (da <= EPS) out.push(A)
        if ((da < -EPS && db > EPS) || (da > EPS && db < -EPS)) {
          const X = add3(A, mul3(sub3(B, A), da / (da - db)))
          out.push(X)
          cap.push(X)
        } else if (Math.abs(da) <= EPS) cap.push(A)
      }
      if (out.length >= 3) next.push({ pts: out, tag: f.tag, n: f.n })
    }
    faces = next
    const uniq = []
    for (const p of cap) if (!uniq.some((q) => Math.hypot(...sub3(p, q)) < 1e-6)) uniq.push(p)
    if (uniq.length >= 3) {
      const c = mul3(uniq.reduce(add3, [0, 0, 0]), 1 / uniq.length)
      const u = unit(Math.abs(n[0]) < 0.9 ? cross3(n, [1, 0, 0]) : cross3(n, [0, 1, 0]))
      const v = cross3(n, u)
      const angle = (p) => Math.atan2(dot3(sub3(p, c), v), dot3(sub3(p, c), u))
      uniq.sort((p, q) => angle(p) - angle(q))
      faces.push({ pts: uniq, tag, n })
    }
  }
  // Every face of the seed box has been clipped away; what is left carries a plane.
  faces = faces.filter((f) => f.n)
  for (const f of faces) f.d = dot3(f.n, f.pts[0])
  return { faces, verts: faces.flatMap((f) => f.pts), part }
}

const H = (n, d, tag) => ({ n, d, tag })
const shifted = (planes, D) => planes.map((p) => ({ ...p, d: p.d + dot3(p.n, D) }))

function build({ slide, lower, upper }) {
  const S = unit([1, 0, -1]) // the slide direction
  const W = unit([1, 0, 1]) // across it, towards the +x/+z corner
  const Y = [0, 1, 0]
  // A face point is x = √2·w − 0.5, so w = 1/(2√2) puts each tongue in the middle of both faces it crosses.
  const c = Math.SQRT1_2 / 2
  const a = 0.1 // neck half-width
  const b = 0.24 // flare half-width
  const h = 0.42 // depth
  const k = (b - a) / h
  const square = [
    H([1, 0, 0], 0.5, 'side'),
    H([-1, 0, 0], 0.5, 'side'),
    H([0, 0, 1], 0.5, 'side'),
    H([0, 0, -1], 0.5, 'side'),
  ]
  const slab = [H(Y, 0, 'end'), H(mul3(Y, -1), h, 'floor')]
  const ribPlanes = [
    // Between the two grooves: right of the groove at -c, left of the groove at +c.
    [H(add3(mul3(W, -1), mul3(Y, -k)), c - a, 'cut'), H(add3(W, mul3(Y, -k)), c - a, 'cut')],
    [H(add3(mul3(W, -1), mul3(Y, -k)), -(c + a), 'cut')],
    [H(add3(W, mul3(Y, -k)), -c - a, 'cut')],
  ]
  const parts = [solid([...square, H(Y, -h, 'floor'), H(mul3(Y, -1), lower, 'end')], 'lower')]
  // The ribs reach a little into the block below, so the seam between them lies over the block's own
  // colour instead of letting the faces hidden behind show through its anti-aliasing.
  const ribSlab = [H(Y, 0, 'end'), H(mul3(Y, -1), h + 0.03, 'floor')]
  for (const extra of ribPlanes)
    parts.push({ ...solid([...square, ...ribSlab, ...extra], 'lower'), grooveFloor: -h })
  const D = mul3(S, slide)
  parts.push(solid(shifted([...square, H(mul3(Y, -1), 0, 'end'), H(Y, upper, 'end')], D), 'upper'))
  for (const cc of [c, -c]) {
    const edges = [
      H(add3(mul3(W, -1), mul3(Y, k)), -(cc - a), 'cut'),
      H(add3(W, mul3(Y, k)), cc + a, 'cut'),
    ]
    parts.push(solid(shifted([...square, ...slab, ...edges], D), 'tongue'))
  }
  return parts.filter((p) => p.faces.length >= 4)
}

const FLAT = {
  upper: { top: '#f1dfc2', left: '#d6b48a', right: '#a8825a' },
  // A tongue standing proud of the lower piece would otherwise share the upper
  // piece's colours and vanish into it: its outer face is lifted a step, and
  // its slanted flank, which faces the viewer, is the lightest thing there.
  tongue: { top: '#f1dfc2', left: '#d6b48a', right: '#c49c6e', flank: '#ecd2ab' },
  lower: { top: '#b88d5e', left: '#8c653f', right: '#5f4227' },
  shadow: '#2e2219',
}
function flatFill(part, f, right) {
  if (part === 'lower' && (f.tag === 'cut' || f.tag === 'floor')) return FLAT.shadow
  if (part === 'tongue' && f.tag === 'cut') return FLAT.tongue.flank
  if (f.n[1] > 0.5) return FLAT[part].top
  return dot3(f.n, right) < 0 ? FLAT[part].left : FLAT[part].right
}

// The part of a polygon at or above height y0.
function above(pts, y0) {
  const out = []
  for (let i = 0; i < pts.length; i++) {
    const A = pts[i]
    const B = pts[(i + 1) % pts.length]
    if (A[1] >= y0) out.push(A)
    if ((A[1] - y0) * (B[1] - y0) < 0)
      out.push(add3(A, mul3(sub3(B, A), (y0 - A[1]) / (B[1] - A[1]))))
  }
  return out
}

// The part of a 2D polygon inside the square [0, size]², so the mark needs no clip path.
function inSquare(pts, size) {
  const edges = [(p) => p[0], (p) => size - p[0], (p) => p[1], (p) => size - p[1]]
  for (const inside of edges) {
    const out = []
    for (let i = 0; i < pts.length; i++) {
      const A = pts[i]
      const B = pts[(i + 1) % pts.length]
      const ia = inside(A)
      const ib = inside(B)
      if (ia >= 0) out.push(A)
      if (ia * ib < 0) {
        const t = ia / (ia - ib)
        out.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t])
      }
    }
    pts = out
    if (pts.length < 3) return []
  }
  return pts
}

// The mark's faces in a 32-unit square, back to front: [{ d, fill }].
function faces({
  slide = 0.14,
  lower = 2.8,
  upper = 2.5,
  az = 45,
  el = 0,
  dist = 60,
  crop = 30,
} = {}) {
  const parts = build({ slide, lower, upper })
  const center = [0, (upper - lower) / 2, 0]
  const r = (az * Math.PI) / 180
  const e = (el * Math.PI) / 180
  const eye = add3(center, [
    dist * Math.cos(e) * Math.sin(r),
    dist * Math.sin(e),
    dist * Math.cos(e) * Math.cos(r),
  ])
  const fwd = unit(sub3(center, eye))
  const right = unit(cross3(fwd, [0, 1, 0]))
  const up = cross3(right, fwd)
  const proj = (p) => {
    const d = sub3(p, eye)
    const z = dot3(d, fwd)
    return [dot3(d, right) / z, -dot3(d, up) / z]
  }

  // Painter's order between convex solids, from separating face planes.
  const before = (A, B) => {
    for (const f of A.faces)
      if (B.verts.every((p) => dot3(f.n, p) >= f.d - 1e-6)) return dot3(f.n, eye) > f.d
    for (const f of B.faces)
      if (A.verts.every((p) => dot3(f.n, p) >= f.d - 1e-6)) return !(dot3(f.n, eye) > f.d)
    return null
  }
  const order = []
  const left = [...parts]
  while (left.length) {
    const i = left.findIndex((A) => left.every((B) => B === A || before(B, A) !== true))
    order.push(...left.splice(i < 0 ? 0 : i, 1))
  }

  const polys = []
  for (const P of order) {
    for (const f of P.faces) {
      // A face seen edge-on would still leave a hairline of its colour along the joint.
      if (dot3(f.n, unit(sub3(eye, f.pts[0]))) < 0.05) continue
      // A rib's groove walls stop at the groove floor; only its outer faces run on into the block.
      const pts =
        P.grooveFloor !== undefined && f.tag === 'cut' ? above(f.pts, P.grooveFloor) : f.pts
      if (pts.length >= 3) polys.push({ pts: pts.map(proj), fill: flatFill(P.part, f, right) })
    }
  }
  // The timber's width sets the scale and the joint sits at the centre; both pieces run off the edges.
  const xs = polys.flatMap((p) => p.pts.map((q) => q[0]))
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const sc = crop / (x1 - x0)
  const ox = 16 - ((x0 + x1) / 2) * sc
  const oy = 16 - proj([0, -0.21, 0])[1] * sc
  return polys
    .map((p) => ({
      pts: inSquare(
        p.pts.map(([x, y]) => [x * sc + ox, y * sc + oy]),
        32,
      ),
      fill: p.fill,
    }))
    .filter((p) => p.pts.length >= 3)
    .map((p) => ({
      d: `M${p.pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L')}Z`,
      fill: p.fill,
    }))
}

const shapes = faces()
// The mark sits in a plaster window on a sumi tile.
const TILE = '#141312'
const FRAME = '#f7f5f0'
const MARK = { x: 7, y: 7, size: 18 }

// A hairline of each face's own colour closes the anti-aliasing seams between neighbours, but it
// spills a little onto whatever was drawn before; a second pass of bare fills trims the spill.
const paths = [
  ...shapes.map(
    (s) =>
      `<path d="${s.d}" fill="${s.fill}" stroke="${s.fill}" stroke-width="0.12" stroke-linejoin="round"/>`,
  ),
  ...shapes.map((s) => `<path d="${s.d}" fill="${s.fill}"/>`),
].join('')
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><title>Hozo</title><rect width="32" height="32" rx="7" fill="${TILE}"/><rect x="5" y="5" width="22" height="22" fill="none" stroke="${FRAME}" stroke-width="1.5"/><g transform="translate(${MARK.x} ${MARK.y}) scale(${MARK.size / 32})">${paths}</g></svg>\n`
writeFileSync(new URL('../public/favicon.svg', import.meta.url), favicon)

const ts = `// Generated by scripts/brand-mark.mjs; run it rather than editing this file.
// The four-way dovetail's faces in a 32-unit square, back to front.
export const MARK_TILE = '${TILE}'
export const MARK_FRAME = '${FRAME}'
export const MARK_PLACE = { x: ${MARK.x}, y: ${MARK.y}, size: ${MARK.size} }
export const MARK_FACES: readonly { d: string; fill: string }[] = [
${shapes.map((s) => `  { d: '${s.d}', fill: '${s.fill}' },`).join('\n')}
]
`
writeFileSync(new URL('../src/components/brand-mark-faces.ts', import.meta.url), ts)
