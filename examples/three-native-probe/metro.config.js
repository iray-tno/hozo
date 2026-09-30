const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '..', '..')
const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

// pnpm gives @hozo/three its own development instance of R3F because R3F has
// optional Expo peers. A source workspace would otherwise bundle that instance
// beside the application's copy, leaving useFrame outside Canvas's context.
// Published consumers do not install @hozo/three's dev dependencies, but this
// probe intentionally exercises the source workspace and must preserve R3F as
// a renderer singleton.
// R3F's Native entry is CJS and patches that Three instance's TextureLoader.
// Metro can otherwise give ESM application/addon imports another Three build,
// whose ImageLoader still needs a DOM. Share the CJS instance with GLTFLoader
// so host texture loading, renderer caches, and object identities agree.
const singletonRequests = new Map(
  ['@react-three/fiber', '@react-three/fiber/native', 'three'].map((request) => [
    request,
    require.resolve(request, { paths: [projectRoot] }),
  ]),
)

config.resolver.resolveRequest = (context, moduleName, platform) =>
  context.resolveRequest(context, singletonRequests.get(moduleName) ?? moduleName, platform)

module.exports = config
