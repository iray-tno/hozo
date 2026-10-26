const path = require('node:path')
const { withHozo } = require('@hozo/metro/config')
const { withStorybook } = require('@storybook/react-native/metro/withStorybook')
const { getDefaultConfig } = require('expo/metro-config')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')
const config = getDefaultConfig(projectRoot)
config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.join(projectRoot, 'node_modules'),
  path.join(workspaceRoot, 'node_modules'),
]

// The workspace libraries must share this host's R3F hooks and Three loader
// patches, rather than resolving their separate development dependencies.
const singletons = new Map(
  [
    'react',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
    'react-native',
    'react-native-svg',
    'expo-video',
    '@react-three/fiber',
    '@react-three/fiber/native',
    'three',
  ].map((request) => [request, require.resolve(request, { paths: [projectRoot] })]),
)
config.resolver.resolveRequest = (context, request, platform) =>
  context.resolveRequest(context, singletons.get(request) ?? request, platform)

// This dedicated app always opens Storybook. Use the Metro wrapper (not the
// production-app entry swapping wrapper) and preserve Hozo's transformer.
module.exports = withHozo(config, {
  root: projectRoot,
  css: './src/index.css',
  sources: ['@hozo/core', '@hozo/primitives', '@hozo/typography', '@hozo/patterns'],
  // The ui-docs stories render the /docs demos from apps/landing, outside
  // this root. A class a demo hands a component as a string, such as the
  // Skeleton demo's bar size, is resolved on device from the candidate map,
  // so the scan has to read those files too, or the class draws nothing
  // (#1205). `**/*` keeps the walk this root had without `include`.
  content: { include: ['**/*', '../../apps/landing/src/examples/**/*'] },
}).then((hozoConfig) =>
  withStorybook(hozoConfig, {
    enabled: true,
    configPath: path.join(projectRoot, '.rnstorybook'),
    docTools: false,
  }),
)
