const { getDefaultConfig } = require('@react-native/metro-config')
const { withHozo } = require('@hozo/metro/config')

const config = getDefaultConfig(__dirname)
config.maxWorkers = 2
module.exports = withHozo(config, { css: 'theme.css' })
