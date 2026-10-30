import { type ClassResolver, createClassTransitions } from '@hozo/engine'
import { HozoAnimated } from '@hozo/engine/generated/animated'
import { useHozoEnvironment } from '@hozo/engine/generated/environment'
import { hozoClasses, hozoClassTransitions } from '@hozo/engine/project'
import { View } from 'react-native'
import type { HozoControlIndicatorClasses } from './control-indicator-classes.ts'

type IndicatorState = NonNullable<Parameters<ClassResolver>[1]>

// Read once: the table is the project's, and it does not change while the
// app runs.
const transitionOf = createClassTransitions(hozoClassTransitions)

/** Real layout nodes, with the same decorative contract as the Web spans. */
export function controlIndicator(
  look: HozoControlIndicatorClasses | undefined,
  state: IndicatorState,
) {
  if (!look) return null
  return (
    <Part
      className={look.className}
      mark={look.markClassName}
      state={state}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    />
  )
}

interface PartProps {
  className: string
  /** The classes of the one part inside this one, a checkbox's tick or a switch's thumb. */
  mark?: string
  state: IndicatorState
  [prop: string]: unknown
}

// A part whose classes ask for a transition animates to its new look, as the
// same classes do on the Web: a switch's thumb slides, its track fades
// (#1450). One that asks for none is the plain `View` it always was, with no
// animation set up and no subscription to the reduced-motion setting.
function Part({ className, mark, state, ...props }: PartProps) {
  const style = hozoClasses(className, state)
  const inner =
    mark !== undefined ? <Part className={mark} state={state} accessible={false} /> : null
  if (
    !transitionOf(className, { reduceMotion: false }) &&
    !transitionOf(className, { reduceMotion: true })
  )
    return (
      <View {...props} style={style}>
        {inner}
      </View>
    )
  return (
    <AnimatedPart {...props} className={className} style={style}>
      {inner}
    </AnimatedPart>
  )
}

function AnimatedPart({
  className,
  style,
  children,
  ...props
}: {
  className: string
  style: ReturnType<typeof hozoClasses>
  children: ReturnType<typeof Part> | null
  [prop: string]: unknown
}) {
  const reduceMotion = useHozoEnvironment('motion-reduce')
  return (
    <HozoAnimated
      {...props}
      style={style}
      hozoTransition={transitionOf(className, { reduceMotion })}
    >
      {children}
    </HozoAnimated>
  )
}
