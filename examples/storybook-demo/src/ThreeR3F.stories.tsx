import { View } from '@hozo/primitives'
import { ThreeCanvas } from '@hozo/three/r3f'
import { Heading, Paragraph } from '@hozo/typography'
import { useFrame } from '@react-three/fiber'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useRef } from 'react'
import type { Mesh } from 'three'

function AnimatedKnot() {
  const mesh = useRef<Mesh>(null)

  useFrame((_state, delta) => {
    if (!mesh.current) return
    mesh.current.rotation.x += delta * 0.25
    mesh.current.rotation.y += delta * 0.5
  })

  return (
    <mesh ref={mesh} rotation={[0.35, 0.15, 0]}>
      <torusKnotGeometry args={[0.9, 0.28, 128, 24]} />
      <meshStandardMaterial color="#818cf8" roughness={0.28} metalness={0.18} />
    </mesh>
  )
}

function ReactThreeFiberScene() {
  return (
    <View className="max-w-2xl w-full space-y-4 rounded-2xl bg-white p-8 shadow-sm">
      <Heading level={2} className="text-xl font-bold text-slate-900">
        React Three Fiber authoring
      </Heading>
      <Paragraph className="text-sm text-slate-600">
        R3F owns the scene, renderer, frame loop, and pointer events. Hozo supplies the responsive
        surface and its accessibility envelope.
      </Paragraph>
      <ThreeCanvas
        accessibilityLabel="Slowly rotating purple torus knot"
        camera={{ position: [0, 0, 4], fov: 48 }}
        dpr={[1, 1.5]}
        style={{ width: '100%', height: 360, borderRadius: 12, overflow: 'hidden' }}
      >
        <color attach="background" args={['#0f172a']} />
        <ambientLight intensity={0.8} />
        <directionalLight position={[3, 4, 5]} intensity={2.4} />
        <AnimatedKnot />
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
