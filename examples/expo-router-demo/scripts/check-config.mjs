import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const expoCli = require.resolve('expo/bin/cli')
const output = execFileSync(process.execPath, [expoCli, 'config', '--type', 'public', '--json'], {
  cwd: new URL('..', import.meta.url),
  encoding: 'utf8',
})
const config = JSON.parse(output)

assert.deepEqual(config.ios.associatedDomains, ['applinks:app.example.com'])
assert.equal(config.android.intentFilters[0].data[0].host, 'app.example.com')

const fontPlugin = config.plugins.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-font',
)
assert.ok(fontPlugin, 'the generated Expo config omitted expo-font')
assert.deepEqual(fontPlugin[1], {
  ios: {
    fonts: [
      './node_modules/@expo-google-fonts/material-symbols/400Regular/MaterialSymbols_400Regular.ttf',
    ],
  },
  android: {
    fonts: [
      {
        fontFamily: 'material_symbols',
        fontDefinitions: [
          {
            path: './node_modules/@expo-google-fonts/material-symbols/400Regular/MaterialSymbols_400Regular.ttf',
            weight: 400,
            style: 'normal',
          },
        ],
      },
    ],
  },
})

console.log('Expo navigation and font config check passed')
