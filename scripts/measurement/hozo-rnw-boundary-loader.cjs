const { pathToFileURL } = require('node:url')
const { createHash } = require('node:crypto')
const { writeFileSync } = require('node:fs')
const path = require('node:path')

let compilerPromise
let babel

module.exports = function hozoRnwBoundaryLoader(source) {
  const done = this.async()
  const options = this.getOptions()

  compilerPromise ??= Promise.all([
    import(pathToFileURL(options.compilerEntry).href),
    import(pathToFileURL(options.lowerEntry).href),
  ]).then(([compilerModule, lowerModule]) => ({
    compiler: compilerModule.createCompiler(),
    lowerModule: lowerModule.lowerModule,
  }))

  compilerPromise.then(({ compiler, lowerModule }) => {
    try {
      const result = lowerModule(
        source,
        this.resourcePath,
        this.resourcePath,
        compiler,
        options.projectRoot,
        undefined,
        { unloweredReactNativeJsx: 'error' },
      )
      const code = result?.code ?? source
      if (options.auditDirectory) {
        const imports = compiler
          .compileNativeModule(code)
          .imports.filter(({ source }) => source === 'react-native')
          .map(({ imported, local }) => ({ imported, local }))
        const importedByLocal = new Map(imports.map((entry) => [entry.local, entry]))
        const used = new Set()
        babel ??= require(options.babelCore)
        babel.transformSync(code, {
          ast: false,
          babelrc: false,
          code: false,
          configFile: false,
          filename: this.resourcePath,
          parserOpts: { plugins: ['jsx', 'typescript'], sourceType: 'unambiguous' },
          plugins: [
            () => ({
              visitor: {
                ReferencedIdentifier(identifier) {
                  // Babel considers identifiers inside TypeScript nodes
                  // referenced too. They disappear before Webpack resolves
                  // imports and therefore are not an RNW runtime boundary.
                  if (identifier.findParent((parent) => parent.isTSType())) return
                  const local = identifier.node.name
                  if (importedByLocal.has(local)) used.add(local)
                },
              },
            }),
          ],
        })
        const referencedImports = imports.filter(({ local }) => used.has(local))
        if (referencedImports.length > 0) {
          const file = path.relative(options.projectRoot, this.resourcePath).replaceAll('\\', '/')
          const name = `${createHash('sha256').update(file).digest('hex')}.json`
          writeFileSync(
            path.join(options.auditDirectory, name),
            JSON.stringify({ file, imports: referencedImports }),
          )
        }
      }
      done(null, code)
    } catch (error) {
      done(error)
    }
  }, done)
}
