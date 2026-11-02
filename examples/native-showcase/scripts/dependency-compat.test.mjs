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

// Expo still requests Zod 3, which has no patch for GHSA-mrhx-c7xc-m3w5, and
// the workspace overrides it with Zod 4. Expo CLI 58 validates plugin
// descriptors and output with JSON Schema through @expo/schema-utils, so Zod's
// one consumer left is the MCP command schema, which takes the `z` it is
// given. Exercise those consumers rather than assuming the override is safe.
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

test('Expo MCP commands keep strict, typed parameters and a serializable schema with the patched Zod', () => {
  const z = cliRequire('zod')
  assert.match(cliRequire('zod/package.json').version, /^4\./)
  const schema = createMCPDevToolsExtensionSchema(plugin, z)
  const parameters = { command: 'inspect', label: 'demo', count: 2, enabled: true }
  assert.deepEqual(schema.parse(parameters), parameters)
  assert.deepEqual(schema.parse({ command: 'inspect' }), { command: 'inspect' })
  assert.equal(schema.safeParse({ command: 'missing' }).success, false)
  assert.equal(schema.safeParse({ ...parameters, count: '2' }).success, false)
  assert.equal(schema.safeParse({ ...parameters, extra: true }).success, false)
  const json = z.toJSONSchema(schema)
  assert.deepEqual(json.required, ['command'])
  assert.equal(json.additionalProperties, false)
  assert.equal(json.properties.count.type, 'number')
  assert.equal(json.properties.enabled.type, 'boolean')
})
