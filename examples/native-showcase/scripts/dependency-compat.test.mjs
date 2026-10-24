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
  path.join(server, 'DevToolsPlugin.schema.js'),
)
const { createMCPDevToolsExtensionSchema } = cliRequire(
  path.join(server, 'createMCPDevToolsExtensionSchema.js'),
)

// Expo still requests Zod 3, which has no patch for GHSA-mrhx-c7xc-m3w5.
// Exercise its actual consumers rather than assuming a major override is safe.
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

test('Expo plugin descriptors retain validation with the patched Zod', () => {
  assert.deepEqual(PluginSchema.parse(plugin), plugin)
  assert.equal(PluginSchema.safeParse({ ...plugin, packageName: '' }).success, false)
  assert.equal(
    PluginSchema.safeParse({ ...plugin, cliExtensions: { ...plugin.cliExtensions, commands: [] } })
      .success,
    false,
  )
})

test('Expo output schemas accept supported media and reject malformed output', () => {
  const output = [
    { type: 'text', text: 'Ready', level: 'info' },
    { type: 'audio', url: 'https://example.com/audio.mp3' },
    { type: 'image', url: 'https://example.com/image.png', text: 'Preview' },
  ]
  assert.deepEqual(DevToolsPluginOutputSchema.parse(output), output)
  assert.equal(DevToolsPluginOutputSchema.safeParse([{ type: 'text', text: 1 }]).success, false)
  assert.equal(DevToolsPluginOutputSchema.safeParse([{ type: 'video', url: 'x' }]).success, false)
  assert.equal(
    DevToolsPluginOutputSchema.safeParse([{ type: 'audio', url: 'invalid' }]).success,
    false,
  )
})

test('Expo MCP commands keep strict, typed parameters and a serializable schema', () => {
  const schema = createMCPDevToolsExtensionSchema(plugin)
  const parameters = { command: 'inspect', label: 'demo', count: 2, enabled: true }
  assert.deepEqual(schema.parse(parameters), parameters)
  assert.deepEqual(schema.parse({ command: 'inspect' }), { command: 'inspect' })
  assert.equal(schema.safeParse({ command: 'missing' }).success, false)
  assert.equal(schema.safeParse({ ...parameters, count: '2' }).success, false)
  assert.equal(schema.safeParse({ ...parameters, extra: true }).success, false)
  const json = cliRequire('zod').toJSONSchema(schema)
  assert.deepEqual(json.required, ['command'])
  assert.equal(json.additionalProperties, false)
  assert.equal(json.properties.count.type, 'number')
  assert.equal(json.properties.enabled.type, 'boolean')
})
