import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const expoRequire = createRequire(require.resolve('expo/package.json'))
const cliRequire = createRequire(expoRequire.resolve('@expo/cli/package.json'))
const server = path.join(
  path.dirname(cliRequire.resolve('./package.json')),
  'build/src/start/server',
)
const { PluginSchema, DevToolsPluginOutputSchema } = cliRequire(
  path.join(server, 'devtools/DevToolsPlugin.schema.js'),
)
const { createMCPDevToolsExtensionSchema } = cliRequire(
  path.join(server, 'mcp/createMCPDevToolsExtensionSchema.js'),
)
const { validate } = cliRequire('@expo/schema-utils')
const valid = (schema, value) => {
  try {
    validate(schema, value)
    return true
  } catch {
    return false
  }
}

// Expo CLI 57 validated these with Zod 3, which has no patch for
// GHSA-mrhx-c7xc-m3w5, so the workspace overrode it with Zod 4 and this test
// exercised the consumers. Expo CLI 58 validates plugin descriptors and
// output with JSON Schema through @expo/schema-utils and installs no Zod; its
// MCP schema takes a `z` from expo-mcp, which this app does not install. The
// test now pins that: the validators work, and no Zod 3 comes back with Expo.
const plugin = {
  packageName: 'test-plugin',
  packageRoot: '/test-plugin',
  cliExtensions: {
    description: 'Dependency compatibility fixture',
    entryPoint: './commands.js',
    commands: [
      {
        name: 'inspect',
        title: 'Inspect',
        environments: ['cli', 'mcp'],
        parameters: [
          { name: 'label', type: 'text' },
          { name: 'count', type: 'number' },
          { name: 'enabled', type: 'confirm' },
        ],
      },
    ],
  },
}

test('Expo plugin descriptors are validated', () => {
  assert.equal(valid(PluginSchema, plugin), true)
  assert.equal(valid(PluginSchema, { ...plugin, packageName: '' }), false)
})

test('Expo output schemas accept supported media and reject malformed output', () => {
  const output = [
    { type: 'text', text: 'Ready', level: 'info' },
    { type: 'audio', url: 'https://example.com/audio.mp3' },
    { type: 'image', url: 'https://example.com/image.png', text: 'Preview' },
  ]
  assert.equal(valid(DevToolsPluginOutputSchema, output), true)
  assert.equal(valid(DevToolsPluginOutputSchema, [{ type: 'text', text: 1 }]), false)
  assert.equal(valid(DevToolsPluginOutputSchema, [{ type: 'video', url: 'x' }]), false)
})

test('Expo CLI installs no Zod of its own', () => {
  const manifest = cliRequire('./package.json')
  for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies'])
    assert.equal(manifest[section]?.zod, undefined, `@expo/cli ${section} lists zod again`)
  assert.equal(typeof createMCPDevToolsExtensionSchema, 'function')
  assert.throws(() => createMCPDevToolsExtensionSchema({ ...plugin, cliExtensions: undefined }))
})
