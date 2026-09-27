import { View } from '@hozo/primitives'
import { ThreeCanvas } from '@hozo/three/r3f'
import { Heading, Paragraph } from '@hozo/typography'
import { useFrame } from '@react-three/fiber'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { type RefObject, useCallback, useRef, useState } from 'react'
import type { Mesh } from 'three'

function AnimatedKnot({
  active,
  mesh,
  onActiveChange,
  onPress,
}: {
  active: boolean
  mesh: RefObject<Mesh | null>
  onActiveChange(active: boolean): void
  onPress(): void
}) {
  useFrame((_state, delta) => {
    if (!mesh.current) return
    mesh.current.rotation.x += delta * 0.25
    mesh.current.rotation.y += delta * 0.5
  })

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: this is an R3F object; accessibleObjects supplies its real DOM control
    <mesh
      ref={mesh}
      rotation={[0.35, 0.15, 0]}
      scale={active ? 1.08 : 1}
      onClick={onPress}
      onPointerOver={() => onActiveChange(true)}
      onPointerOut={() => onActiveChange(false)}
    >
      <torusKnotGeometry args={[0.9, 0.28, 128, 24]} />
      <meshStandardMaterial color="#818cf8" roughness={0.28} metalness={0.18} />
    </mesh>
  )
}

function ReactThreeFiberScene() {
  const knot = useRef<Mesh>(null)
  const [active, setActive] = useState(false)
  const [inspected, setInspected] = useState(false)
  const inspect = useCallback(() => setInspected((value) => !value), [])

  return (
    <View className="max-w-2xl w-full space-y-4 rounded-2xl bg-white p-8 shadow-sm">
      <Heading level={2} className="text-xl font-bold text-slate-900">
        React Three Fiber authoring
      </Heading>
      <Paragraph className="text-sm text-slate-600">
        R3F owns the scene, renderer, frame loop, and pointer events. Hozo supplies the responsive
        surface and its accessibility envelope.
      </Paragraph>
      <Paragraph className="text-sm font-medium text-indigo-700">
        {inspected ? 'The torus knot is selected.' : 'Activate the knot to inspect it.'}
      </Paragraph>
      <ThreeCanvas
        accessibilityLabel="Slowly rotating purple torus knot"
        accessibleObjects={[
          { id: 'knot', label: 'Inspect torus knot', object: knot, onPress: inspect },
        ]}
        camera={{ position: [0, 0, 4], fov: 48 }}
        dpr={[1, 1.5]}
        onObjectActiveChange={(event) => setActive(event !== undefined)}
        style={{ width: '100%', height: 360, borderRadius: 12, overflow: 'hidden' }}
      >
        <color attach="background" args={['#0f172a']} />
        <ambientLight intensity={0.8} />
        <directionalLight position={[3, 4, 5]} intensity={2.4} />
        <AnimatedKnot active={active} mesh={knot} onActiveChange={setActive} onPress={inspect} />
      </ThreeCanvas>
    </View>
  )
}

const meta = {
  title: 'Media/React Three Fiber',
  component: ReactThreeFiberScene,
} satisfies Meta<typeof ReactThreeFiberScene>

export default meta
export const AnimatedScene: StoryObj<typeof meta> = {}
