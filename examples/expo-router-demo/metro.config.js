const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')
const { withHozo } = require('@hozo/metro/config')
const { createFontFaceCss, defineFonts } = require('@hozo/typography/fonts')
const fontManifest = require('./fonts.json')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '..', '..')
const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

module.exports = withHozo(config, {
  root: projectRoot,
  css: 'global.css',
  sources: ['@hozo/core'],
  fontFaceCss: createFontFaceCss(defineFonts(fontManifest)),
})
