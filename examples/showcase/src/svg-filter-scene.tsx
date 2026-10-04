import { Svg } from '@hozo/svg'

export type SvgFilterKind = 'color' | 'blur' | 'shadow' | 'composition' | 'blend'
export const SVG_FILTER_KINDS: SvgFilterKind[] = ['color', 'blur', 'shadow', 'composition', 'blend']
export const SVG_FILTER_LABELS: Record<SvgFilterKind, string> = {
  color: 'Grayscale',
  blur: 'Gaussian blur',
  shadow: 'Drop shadow',
  composition: 'Composed shadow',
  blend: 'Screen blend',
}

function ColorFilter({ id }: { id: string }) {
  return (
    <Svg.Filter
      id={id}
      filterUnits="userSpaceOnUse"
      x={0}
      y={0}
      width={96}
      height={96}
      colorInterpolationFilters="sRGB"
    >
      <Svg.FeColorMatrix in="SourceGraphic" type="saturate" values="0" />
    </Svg.Filter>
  )
}
function BlurFilter({ id }: { id: string }) {
  return (
    <Svg.Filter
      id={id}
      filterUnits="userSpaceOnUse"
      x={0}
      y={0}
      width={96}
      height={96}
      colorInterpolationFilters="sRGB"
    >
      <Svg.FeGaussianBlur in="SourceGraphic" stdDeviation="4" />
    </Svg.Filter>
  )
}
function ShadowFilter({ id }: { id: string }) {
  return (
    <Svg.Filter
      id={id}
      filterUnits="userSpaceOnUse"
      x={0}
      y={0}
      width={96}
      height={96}
      colorInterpolationFilters="sRGB"
    >
      <Svg.FeDropShadow
        in="SourceGraphic"
        dx={12}
        dy={12}
        stdDeviation="2"
        floodColor="#dc2828"
        floodOpacity={1}
      />
    </Svg.Filter>
  )
}
function CompositionFilter({ id }: { id: string }) {
  return (
    <Svg.Filter
      id={id}
      filterUnits="userSpaceOnUse"
      x={0}
      y={0}
      width={96}
      height={96}
      colorInterpolationFilters="sRGB"
    >
      <Svg.FeGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur" />
      <Svg.FeOffset in="blur" dx={12} dy={12} result="offset" />
      <Svg.FeFlood floodColor="#dc2828" floodOpacity={1} result="paint" />
      <Svg.FeComposite in="paint" in2="offset" operator="in" result="shadow" />
      <Svg.FeMerge>
        <Svg.FeMergeNode in="shadow" />
        <Svg.FeMergeNode in="SourceGraphic" />
      </Svg.FeMerge>
    </Svg.Filter>
  )
}
function BlendFilter({ id }: { id: string }) {
  return (
    <Svg.Filter
      id={id}
      filterUnits="userSpaceOnUse"
      x={0}
      y={0}
      width={96}
      height={96}
      colorInterpolationFilters="sRGB"
    >
      <Svg.FeFlood x={24} y={24} width={40} height={40} floodColor="#2850dc" result="blue" />
      <Svg.FeBlend in="SourceGraphic" in2="blue" mode="screen" />
    </Svg.Filter>
  )
}
// Static bodies keep the complete filter graphs inside the compiler's JSX
// boundary; selecting a component does not hide its nodes in an expression.
const definitions = {
  color: ColorFilter,
  blur: BlurFilter,
  shadow: ShadowFilter,
  composition: CompositionFilter,
  blend: BlendFilter,
}

// This is also the browser pixel fixture. The two hosts and the compiler
// comparison consume this exact scene, not parallel copies of its graph.
export function SvgFilterScene({
  kind,
  enabled = true,
  idPrefix = 'showcase',
}: {
  kind: SvgFilterKind
  enabled?: boolean
  idPrefix?: string
}) {
  const id = `${idPrefix}-${kind}`
  const fill = kind === 'color' || kind === 'blend' ? '#dc2828' : '#2850dc'
  const Definition = definitions[kind]
  return (
    <Svg width={96} height={96} viewBox="0 0 96 96" role="img" aria-label={SVG_FILTER_LABELS[kind]}>
      <Svg.Defs>
        <Definition id={id} />
      </Svg.Defs>
      <Svg.Rect width={96} height={96} fill="#ffffff" />
      <Svg.Rect
        x={24}
        y={24}
        width={40}
        height={40}
        fill={fill}
        filter={enabled ? `url(#${id})` : undefined}
      />
    </Svg>
  )
}
