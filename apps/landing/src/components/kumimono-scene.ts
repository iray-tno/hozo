import * as THREE from 'three'

// Geometry and procedural textures adapted from the supplied Kumimono study.
// Hozo owns the renderer and frame lifecycle; this module owns scene resources.
export function createKumimonoScene() {
  const scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(0x080806, 0.039)

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100)
  camera.position.set(7.8, 4.7, 13.8)

  scene.add(new THREE.HemisphereLight(0xffe8bd, 0x17130c, 1.55))

  const key = new THREE.DirectionalLight(0xffd293, 5.4)
  key.position.set(-4.5, 9.5, 7)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.camera.left = -10
  key.shadow.camera.right = 10
  key.shadow.camera.top = 10
  key.shadow.camera.bottom = -10
  scene.add(key)

  const rim = new THREE.DirectionalLight(0xbdd5ff, 2.15)
  rim.position.set(8, 3, -8)
  scene.add(rim)

  const ember = new THREE.PointLight(0xb43a24, 5.4, 24, 2)
  ember.position.set(-4.5, -1.6, 3.8)
  scene.add(ember)

  function makeWoodTexture() {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 128
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas texture context unavailable')
    const wash = context.createLinearGradient(0, 0, 0, 128)
    wash.addColorStop(0, '#c28a4c')
    wash.addColorStop(0.48, '#e3ba76')
    wash.addColorStop(1, '#a96f37')
    context.fillStyle = wash
    context.fillRect(0, 0, 512, 128)
    for (let i = 0; i < 120; i += 1) {
      const y = ((i * 43) % 128) + Math.sin(i * 1.71) * 2.4
      context.beginPath()
      context.strokeStyle = `rgba(75, 39, 14, ${0.028 + (i % 6) * 0.009})`
      context.lineWidth = 0.45 + (i % 4) * 0.22
      context.moveTo(-20, y)
      for (let x = -20; x <= 540; x += 18) {
        context.lineTo(x, y + Math.sin(x * 0.025 + i * 0.8) * (1.2 + (i % 4)))
      }
      context.stroke()
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(1.8, 1)
    return texture
  }

  function makeEndGrainTexture() {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas texture context unavailable')
    const wash = context.createRadialGradient(126, 132, 12, 126, 132, 178)
    wash.addColorStop(0, '#e8c98e')
    wash.addColorStop(0.58, '#d7a966')
    wash.addColorStop(1, '#bb7d3f')
    context.fillStyle = wash
    context.fillRect(0, 0, 256, 256)

    for (let ring = 1; ring <= 14; ring += 1) {
      context.beginPath()
      context.strokeStyle = `rgba(94, 49, 18, ${0.055 + ring * 0.004})`
      context.lineWidth = ring % 4 === 0 ? 2.1 : 1.05
      context.ellipse(
        126 + Math.sin(ring * 1.8) * 2.2,
        132 + Math.cos(ring * 1.3) * 2.8,
        10 + ring * 9.2,
        8 + ring * 6.8,
        -0.08 + Math.sin(ring) * 0.025,
        0,
        Math.PI * 2,
      )
      context.stroke()
    }

    for (let ray = 0; ray < 7; ray += 1) {
      const angle = ray * 0.91 + 0.34
      context.beginPath()
      context.strokeStyle = 'rgba(82, 43, 17, 0.10)'
      context.lineWidth = 0.8
      context.moveTo(126, 132)
      context.lineTo(126 + Math.cos(angle) * 108, 132 + Math.sin(angle) * 80)
      context.stroke()
    }

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }

  const woodTexture = makeWoodTexture()
  const endGrainTexture = makeEndGrainTexture()
  const timber = new THREE.MeshStandardMaterial({
    color: 0xd8a866,
    map: woodTexture,
    roughness: 0.61,
  })
  const timberDark = timber.clone()
  timberDark.color.setHex(0xb77c40)
  const cutWood = timber.clone()
  cutWood.color.setHex(0xe3bf82)
  const endGrain = new THREE.MeshStandardMaterial({
    color: 0xdfb573,
    map: endGrainTexture,
    roughness: 0.72,
  })
  const endGrainDark = endGrain.clone()
  endGrainDark.color.setHex(0xc18445)
  const mortiseDark = new THREE.MeshStandardMaterial({ color: 0x5b3218, roughness: 0.86 })
  const tileMaterial = new THREE.MeshStandardMaterial({
    color: 0x252620,
    roughness: 0.88,
    metalness: 0.025,
    side: THREE.DoubleSide,
  })
  const tileRidgeMaterial = new THREE.MeshStandardMaterial({
    color: 0x303129,
    roughness: 0.86,
    metalness: 0.03,
    side: THREE.DoubleSide,
  })
  const tileAccent = new THREE.MeshStandardMaterial({
    color: 0x55564c,
    roughness: 0.82,
    metalness: 0.035,
  })

  function finishObject(object: THREE.Object3D) {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    return object
  }

  function endMaterialFor(material: THREE.MeshStandardMaterial) {
    return material === timberDark ? endGrainDark : endGrain
  }

  function box(size: number[], material = timber, grainAxis: string | null = null) {
    const geometry = new THREE.BoxGeometry(size[0], size[1], size[2], 2, 2, 2)
    if ([mortiseDark, tileMaterial, tileAccent].includes(material))
      return new THREE.Mesh(geometry, material)

    const axis =
      grainAxis || (size[0] >= size[1] && size[0] >= size[2] ? 'x' : size[1] >= size[2] ? 'y' : 'z')
    const materials = [material, material, material, material, material, material]
    const endMaterial = endMaterialFor(material)
    if (axis === 'x') {
      materials[0] = endMaterial
      materials[1] = endMaterial
    } else if (axis === 'y') {
      materials[2] = endMaterial
      materials[3] = endMaterial
    } else {
      materials[4] = endMaterial
      materials[5] = endMaterial
    }
    return new THREE.Mesh(geometry, materials)
  }

  function createPost() {
    const group = new THREE.Group()
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.64, 3.2, 32, 2), timberDark)
    shaft.position.y = -0.38
    group.add(shaft)
    const neck = box([0.72, 0.72, 0.72], cutWood, 'y')
    neck.position.y = 1.44
    group.add(neck)
    const peg = box([0.38, 0.46, 0.38], cutWood, 'y')
    peg.position.y = 2.02
    group.add(peg)
    return finishObject(group)
  }

  function createMasu(size = 1, material = timberDark, crossChannel = true) {
    const group = new THREE.Group()
    const height = size * 0.7
    const bodyHeight = height * 0.8
    const topSide = size * 0.92
    const bottomSide = size * 0.67
    const topRadius = topSide / Math.sqrt(2)
    const bottomRadius = bottomSide / Math.sqrt(2)
    const bodyGeometry = new THREE.CylinderGeometry(
      topRadius,
      bottomRadius,
      bodyHeight,
      4,
      1,
      false,
    )
    bodyGeometry.rotateY(Math.PI / 4)
    const body = new THREE.Mesh(bodyGeometry, material)
    body.position.y = -height * 0.09
    group.add(body)

    const bodyTop = body.position.y + bodyHeight / 2
    const lipHeight = height * 0.2
    const lipY = bodyTop + lipHeight / 2

    if (crossChannel) {
      const cornerSize = size * 0.215
      const offset = size * 0.34
      for (const x of [-offset, offset]) {
        for (const z of [-offset, offset]) {
          const shoulder = box([cornerSize, lipHeight, cornerSize], material)
          shoulder.position.set(x, lipY, z)
          group.add(shoulder)
        }
      }

      const cutX = box([size * 0.72, 0.018, size * 0.47], cutWood)
      cutX.position.y = bodyTop + 0.01
      group.add(cutX)
      const cutZ = box([size * 0.47, 0.019, size * 0.72], cutWood)
      cutZ.position.y = bodyTop + 0.011
      group.add(cutZ)
    } else {
      const railDepth = size * 0.25
      const railOffset = size * 0.335
      for (const z of [-railOffset, railOffset]) {
        const shoulder = box([size * 0.82, lipHeight, railDepth], material)
        shoulder.position.set(0, lipY, z)
        group.add(shoulder)
      }

      const cut = box([size * 0.76, 0.018, size * 0.42], cutWood)
      cut.position.y = bodyTop + 0.01
      group.add(cut)
    }

    const lowerSocket = box([size * 0.28, 0.02, size * 0.28], mortiseDark)
    lowerSocket.position.y = body.position.y - bodyHeight / 2 - 0.006
    lowerSocket.rotation.x = Math.PI
    group.add(lowerSocket)
    return finishObject(group)
  }

  function createHijiki(
    length: number,
    height: number,
    depth: number,
    material = timber,
    tenon = true,
    lap: string | null = null,
  ) {
    const shape = new THREE.Shape()
    const half = length / 2
    const notchHalf = Math.max(depth * 0.58, length * 0.075)
    shape.moveTo(-half, height / 2)
    if (lap === 'top') {
      shape.lineTo(-notchHalf, height / 2)
      shape.lineTo(-notchHalf, 0)
      shape.lineTo(notchHalf, 0)
      shape.lineTo(notchHalf, height / 2)
    }
    shape.lineTo(half, height / 2)
    shape.lineTo(half, height * 0.04)
    shape.bezierCurveTo(
      half - length * 0.035,
      -height * 0.1,
      half - length * 0.09,
      -height * 0.29,
      half - length * 0.17,
      -height * 0.34,
    )
    shape.lineTo(length * 0.17, -height / 2)
    if (lap === 'bottom') {
      shape.lineTo(notchHalf, -height / 2)
      shape.lineTo(notchHalf, 0)
      shape.lineTo(-notchHalf, 0)
      shape.lineTo(-notchHalf, -height / 2)
    }
    shape.lineTo(-length * 0.17, -height / 2)
    shape.lineTo(-half + length * 0.17, -height * 0.34)
    shape.bezierCurveTo(
      -half + length * 0.09,
      -height * 0.29,
      -half + length * 0.035,
      -height * 0.1,
      -half,
      height * 0.04,
    )
    shape.closePath()

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      steps: 1,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.025,
      bevelThickness: 0.025,
    })
    geometry.translate(0, 0, -depth / 2)

    const group = new THREE.Group()
    group.add(new THREE.Mesh(geometry, material))
    const capMaterial = endMaterialFor(material)
    const capGeometry = new THREE.PlaneGeometry(depth * 0.84, height * 0.5)
    const rightCap = new THREE.Mesh(capGeometry, capMaterial)
    rightCap.rotation.y = Math.PI / 2
    rightCap.position.set(half + 0.027, height * 0.06, 0)
    group.add(rightCap)
    const leftCap = new THREE.Mesh(capGeometry.clone(), capMaterial)
    leftCap.rotation.y = -Math.PI / 2
    leftCap.position.set(-half - 0.027, height * 0.06, 0)
    group.add(leftCap)
    if (tenon) {
      const peg = box([Math.min(0.42, length * 0.16), height * 0.42, depth * 0.58], cutWood)
      peg.position.y = -height * 0.67
      group.add(peg)
    }

    if (lap === null) {
      const topMortise = box([Math.min(0.38, length * 0.13), 0.022, depth * 0.46], mortiseDark)
      topMortise.position.y = height * 0.52
      group.add(topMortise)
    }
    return finishObject(group)
  }

  function createNotchedBeam(
    length: number,
    height: number,
    depth: number,
    material = timberDark,
    lap = 'top',
  ) {
    const group = new THREE.Group()
    const leftLength = length * 0.43
    const rightLength = length * 0.43
    const left = box([leftLength, height, depth], material)
    left.position.x = -(length - leftLength) / 2
    const right = box([rightLength, height, depth], material)
    right.position.x = (length - rightLength) / 2
    const center = box([length * 0.14, height * 0.48, depth], material)
    center.position.y = lap === 'top' ? -height * 0.26 : height * 0.26
    group.add(left, right, center)
    const notch = box([length * 0.13, 0.025, depth * 0.78], mortiseDark)
    notch.position.y = lap === 'top' ? height * 0.01 : -height * 0.01
    group.add(notch)
    return finishObject(group)
  }

  function createRafter(length: number, material: THREE.MeshStandardMaterial) {
    const group = new THREE.Group()
    const body = box([0.34, 0.24, length], material)
    group.add(body)
    const noseShape = new THREE.Shape()
    noseShape.moveTo(-0.17, 0.12)
    noseShape.lineTo(0.17, 0.12)
    noseShape.lineTo(0.13, -0.08)
    noseShape.quadraticCurveTo(0, -0.17, -0.13, -0.08)
    noseShape.closePath()
    const noseGeometry = new THREE.ExtrudeGeometry(noseShape, {
      depth: 0.46,
      bevelEnabled: true,
      bevelSize: 0.018,
      bevelThickness: 0.018,
      bevelSegments: 2,
    })
    noseGeometry.translate(0, 0, -0.23)
    const nose = new THREE.Mesh(noseGeometry, material)
    nose.rotation.y = Math.PI / 2
    nose.position.z = length / 2 + 0.18
    group.add(nose)
    return finishObject(group)
  }

  function createEaveTile() {
    const group = new THREE.Group()
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19, 0.19, 0.25, 28, 1, false),
      tileMaterial,
    )
    barrel.rotation.x = Math.PI / 2
    group.add(barrel)

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.014, 8, 28), tileAccent)
    ring.position.z = 0.132
    group.add(ring)

    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.032, 14, 10), tileAccent)
    boss.scale.z = 0.45
    boss.position.z = 0.143
    group.add(boss)
    return finishObject(group)
  }

  function createKawaraRoof(width: number, depth: number) {
    const group = new THREE.Group()
    const columns = 12
    const rows = 6
    const columnStep = width / columns
    const rowStep = depth / (rows + 0.24)
    const tileLength = rowStep * 1.26

    const panGeometry = new THREE.PlaneGeometry(columnStep * 0.94, tileLength, 6, 3)
    panGeometry.rotateX(-Math.PI / 2)
    const panPositions = panGeometry.attributes.position
    for (let i = 0; i < panPositions.count; i += 1) {
      const x = panPositions.getX(i)
      const normalizedX = x / (columnStep * 0.47)
      panPositions.setY(i, normalizedX * normalizedX * 0.038)
    }
    panPositions.needsUpdate = true
    panGeometry.computeVertexNormals()

    const ridgeRadius = columnStep * 0.19
    const ridgeGeometry = new THREE.CylinderGeometry(
      ridgeRadius,
      ridgeRadius,
      tileLength * 1.015,
      14,
      1,
      true,
      Math.PI / 2,
      Math.PI,
    )
    ridgeGeometry.rotateX(Math.PI / 2)

    const pans = new THREE.InstancedMesh(panGeometry, tileMaterial, columns * rows)
    const ridges = new THREE.InstancedMesh(ridgeGeometry, tileRidgeMaterial, (columns + 1) * rows)
    const dummy = new THREE.Object3D()
    let panIndex = 0
    let ridgeIndex = 0

    for (let row = 0; row < rows; row += 1) {
      const z = -depth / 2 + tileLength / 2 + row * rowStep
      const front = row / (rows - 1)
      for (let column = 0; column < columns; column += 1) {
        const x = (-columns / 2 + column + 0.5) * columnStep
        const edgeLift = (Math.abs(x) / (width / 2)) ** 4 * front ** 1.35 * 0.25
        dummy.position.set(x, row * 0.018 + edgeLift, z)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        pans.setMatrixAt(panIndex, dummy.matrix)
        panIndex += 1
      }

      for (let column = 0; column <= columns; column += 1) {
        const x = (-columns / 2 + column) * columnStep
        const edgeLift = (Math.abs(x) / (width / 2)) ** 4 * front ** 1.35 * 0.25
        dummy.position.set(x, 0.045 + row * 0.018 + edgeLift, z)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        ridges.setMatrixAt(ridgeIndex, dummy.matrix)
        ridgeIndex += 1
      }
    }

    pans.instanceMatrix.needsUpdate = true
    ridges.instanceMatrix.needsUpdate = true
    pans.castShadow = true
    pans.receiveShadow = true
    ridges.castShadow = true
    ridges.receiveShadow = true
    group.add(pans, ridges)
    return finishObject(group)
  }

  const assembly = new THREE.Group()
  assembly.position.set(0.65, -0.92, 0)
  scene.add(assembly)

  const pieces: {
    object: THREE.Object3D
    finalPosition: THREE.Vector3
    finalQuaternion: THREE.Quaternion
    stagingPosition: THREE.Vector3
    initialPosition: THREE.Vector3
    initialQuaternion: THREE.Quaternion
    order: number
    kind: string
    index: number
  }[] = []
  let pieceIndex = 0

  function addPiece({
    object,
    position,
    rotation = [0, 0, 0],
    order,
    entry = [0, 4, 0],
    approach = [0, 0.82, 0],
    spin = [0.25, 0.35, 0.18],
    kind = 'timber',
  }: {
    object: THREE.Object3D
    position: [number, number, number]
    rotation?: [number, number, number]
    order: number
    entry?: [number, number, number]
    approach?: [number, number, number]
    spin?: [number, number, number]
    kind?: string
  }) {
    finishObject(object)
    const finalPosition = new THREE.Vector3(...position)
    const finalQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation))
    const initialPosition = finalPosition
      .clone()
      .add(new THREE.Vector3(...entry).multiplyScalar(1.85))
    const stagingPosition = finalPosition.clone().add(new THREE.Vector3(...approach))
    const initialQuaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(rotation[0] + spin[0], rotation[1] + spin[1], rotation[2] + spin[2]),
    )
    object.position.copy(initialPosition)
    object.quaternion.copy(initialQuaternion)
    assembly.add(object)
    pieces.push({
      object,
      finalPosition,
      finalQuaternion,
      stagingPosition,
      initialPosition,
      initialQuaternion,
      order,
      kind,
      index: pieceIndex,
    })
    pieceIndex += 1
  }

  addPiece({
    object: createPost(),
    position: [0, -2.25, 0],
    order: 0.0,
    entry: [0, -5.4, 0],
    spin: [0, 0, 0],
    kind: 'post',
  })
  addPiece({
    object: createMasu(1.42),
    position: [0, 0.03, 0],
    order: 0.08,
    entry: [0, 4.6, 0],
    spin: [0, 0, 0],
    kind: 'masu',
  })

  addPiece({
    object: createHijiki(4.25, 0.68, 0.72, timber, true, 'top'),
    position: [0, 0.79, 0],
    order: 0.18,
    entry: [0, 3.45, 0],
    spin: [0, 0, 0],
    kind: 'hijiki',
  })
  addPiece({
    object: createHijiki(3.55, 0.68, 0.68, timberDark, false, 'bottom'),
    position: [0, 0.79, 0],
    rotation: [0, Math.PI / 2, 0],
    order: 0.23,
    entry: [0, 3.65, 0.7],
    spin: [0, 0, 0],
    kind: 'hijiki',
  })

  for (const [x, delay] of [
    [-1.45, 0.31],
    [0, 0.34],
    [1.45, 0.37],
  ]) {
    addPiece({
      object: createMasu(0.82, timberDark, false),
      position: [x, 1.47, 0],
      order: delay,
      entry: [0, 3.25, 0],
      spin: [0, 0, 0],
      kind: 'makito',
    })
  }

  for (const [z, delay] of [
    [-1.2, 0.33],
    [1.2, 0.39],
  ]) {
    addPiece({
      object: createMasu(0.76, timberDark, false),
      position: [0, 1.54, z],
      rotation: [0, Math.PI / 2, 0],
      order: delay,
      entry: [0, 3.35, 0],
      spin: [0, 0, 0],
      kind: 'makito',
    })
  }

  addPiece({
    object: createHijiki(5.65, 0.62, 0.66, timber, true, 'top'),
    position: [0, 2.21, 0],
    order: 0.45,
    entry: [0, 3.2, 0],
    spin: [0, 0, 0],
    kind: 'hijiki',
  })
  addPiece({
    object: createHijiki(4.8, 0.62, 0.62, timberDark, false, 'bottom'),
    position: [0, 2.21, 0],
    rotation: [0, Math.PI / 2, 0],
    order: 0.49,
    entry: [0, 3.4, 0.7],
    spin: [0, 0, 0],
    kind: 'hijiki',
  })

  for (const [x, delay] of [
    [-2.05, 0.54],
    [0, 0.57],
    [2.05, 0.6],
  ]) {
    addPiece({
      object: createMasu(0.76, timberDark, false),
      position: [x, 2.83, 0],
      order: delay,
      entry: [0, 3.15, 0],
      spin: [0, 0, 0],
      kind: 'makito',
    })
  }

  addPiece({
    object: createNotchedBeam(7.15, 0.56, 0.78, timberDark, 'top'),
    position: [0, 3.42, 0],
    order: 0.66,
    entry: [0, 3.1, 0],
    spin: [0, 0, 0],
    kind: 'beam',
  })
  addPiece({
    object: createNotchedBeam(5.9, 0.56, 0.7, timber, 'bottom'),
    position: [0, 3.42, 0],
    rotation: [0, Math.PI / 2, 0],
    order: 0.69,
    entry: [0, 3.3, 0.65],
    spin: [0, 0, 0],
    kind: 'beam',
  })

  for (let i = -6; i <= 6; i += 1) {
    addPiece({
      object: createRafter(6.45, i % 2 === 0 ? timberDark : timber),
      position: [i * 0.56, 4.04 - Math.abs(i) * 0.012, -0.32],
      rotation: [0.105, 0, 0],
      order: 0.72 + (i + 6) * 0.008,
      entry: [0, 3.6 + Math.abs(i) * 0.1, -1.8],
      approach: [0, 0.72, -0.18],
      spin: [-0.035, 0, 0],
      kind: 'eave',
    })
  }

  addPiece({
    object: box([7.55, 0.36, 0.42], timberDark, 'x'),
    position: [0, 3.71, 2.9],
    order: 0.79,
    entry: [0, 4.2, 2.6],
    approach: [0, 0.68, 0],
    spin: [0, 0, 0],
    kind: 'eave',
  })

  for (let i = -5; i <= 5; i += 1) {
    addPiece({
      object: createRafter(4.72, i % 2 === 0 ? timber : timberDark),
      position: [i * 0.67, 4.43 - Math.abs(i) * 0.01, 0.36],
      rotation: [0.16, 0, 0],
      order: 0.8 + (i + 5) * 0.006,
      entry: [0, 4.7 + Math.abs(i) * 0.1, -2.8],
      approach: [0, 0.72, -0.2],
      spin: [-0.045, 0, 0],
      kind: 'ornament',
    })
  }

  addPiece({
    object: box([7.8, 0.38, 0.44], timber, 'x'),
    position: [0, 4.05, 2.7],
    order: 0.855,
    entry: [0, 4.8, 3.1],
    approach: [0, 0.68, 0],
    spin: [0, 0, 0],
    kind: 'ornament',
  })

  for (let i = -6; i <= 6; i += 1) {
    addPiece({
      object: createEaveTile(),
      position: [i * 0.6, 4.26 - Math.abs(i) * 0.004, 2.9],
      order: 0.86 + (i + 6) * 0.003,
      entry: [0, 5.2 + Math.abs(i) * 0.08, 3.6],
      approach: [0, 0.62, 0.05],
      spin: [0, 0, 0],
      kind: 'tile',
    })
  }

  addPiece({
    object: createKawaraRoof(7.55, 4.5),
    position: [0, 4.55, 0.62],
    rotation: [0.16, 0, 0],
    order: 0.9,
    entry: [0, 6.4, -4.8],
    approach: [0, 0.65, -0.15],
    spin: [-0.04, 0, 0],
    kind: 'roof',
  })

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(32, 32),
    new THREE.MeshStandardMaterial({
      color: 0x080806,
      roughness: 1,
      transparent: true,
      opacity: 0.78,
    }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -4.79
  floor.receiveShadow = true
  scene.add(floor)

  const axisMaterial = new THREE.LineBasicMaterial({
    color: 0xb43a24,
    transparent: true,
    opacity: 0.34,
  })
  const axisGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0.65, -4.6, 0),
    new THREE.Vector3(0.65, 5.1, 0),
  ])
  scene.add(new THREE.Line(axisGeometry, axisMaterial))

  function clamp01(value: number) {
    return Math.max(0, Math.min(1, value))
  }
  function smooth(value: number) {
    const x = clamp01(value)
    return x * x * (3 - 2 * x)
  }
  function applyAssembly(value: number, time: number) {
    pieces.forEach((piece) => {
      let span = 0.3
      if (piece.kind === 'eave') span = 0.185
      if (piece.kind === 'ornament') span = 0.14
      if (piece.kind === 'tile' || piece.kind === 'roof') span = 0.1
      const local = clamp01((value - piece.order) / span)

      if (local < 0.6) {
        const travel = smooth(local / 0.6)
        piece.object.position.lerpVectors(piece.initialPosition, piece.stagingPosition, travel)
        piece.object.quaternion.slerpQuaternions(
          piece.initialQuaternion,
          piece.finalQuaternion,
          travel,
        )
      } else {
        const insertion = local < 0.74 ? 0 : smooth((local - 0.74) / 0.26)
        piece.object.position.lerpVectors(piece.stagingPosition, piece.finalPosition, insertion)
        piece.object.quaternion.copy(piece.finalQuaternion)
      }

      if (local > 0.93 && local < 1 && !['eave', 'roof'].includes(piece.kind)) {
        const seat = Math.sin(((local - 0.93) / 0.07) * Math.PI) * 0.025
        piece.object.position.y -= seat
      }

      if (local < 0.035) {
        piece.object.position.y += Math.sin(time * 0.00038 + piece.index * 1.63) * 0.042
      }
    })

    const load = smooth((value - 0.88) / 0.12)
    assembly.position.y = -0.92 - Math.sin(load * Math.PI) * 0.07
    axisMaterial.opacity = 0.34 * (1 - smooth((value - 0.5) / 0.28))
    ember.intensity = 4.8 + value * 4.5
  }

  return {
    scene,
    camera,
    pieceCount: pieces.length,
    update(value: number) {
      applyAssembly(value, 0)
      const closePass = Math.sin(clamp01(value / 0.78) * Math.PI) * 2.1
      // Keep the exploded pieces in view, rather than ending on an empty
      // canvas when the LP's shorter viewport clips the original study.
      const pullback = 18 * (1 - smooth(value / 0.65))
      camera.position.set(
        7.8 + value * 0.4 + pullback * 0.45,
        4.7 + value * 0.15 + pullback * 0.3,
        13.8 - closePass - value * 0.55 + pullback,
      )
      camera.lookAt(0.55, 0.05 + value * 0.38 + (1 - value) * 2, 0)
    },
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>()
      const materials = new Set<THREE.Material>()
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          geometries.add(object.geometry)
          for (const material of [object.material].flat()) materials.add(material)
        }
      })
      for (const geometry of geometries) geometry.dispose()
      for (const material of materials) material.dispose()
      woodTexture.dispose()
      endGrainTexture.dispose()
      key.shadow.dispose()
    },
  }
}
