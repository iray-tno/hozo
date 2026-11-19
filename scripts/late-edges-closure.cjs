// The closure variants measure-*-late-edges compare (#2047), chosen with
// --variant:
//
// - `declared` (default): what owner-manifest-preflight.ts follows today.
//   Every package's dependencies, peerDependencies and optionalDependencies,
//   each located by resolving its bare name.
// - `instances`: the app root's devDependencies too, since an app bundles
//   what it lists there; and a name whose bare import resolves nothing (no
//   "." export, a package imported only by subpath) located through
//   `<name>/package.json` instead.
// - `carriers`: as `instances`, but past the app root it descends only
//   into packages that declare a manifest (`hozo.manifest`). A package
//   without one is located, so a manifest it carries would be seen, but its
//   own dependencies are not followed.

const VARIANTS = ['declared', 'instances', 'carriers']
const first = (error) => String(error?.message ?? error).split('\n')[0]

function closureVariant(variant = 'declared') {
  if (!VARIANTS.includes(variant))
    throw new Error(`unknown variant ${variant}; one of ${VARIANTS.join(', ')}`)
  const proposed = variant !== 'declared'

  /** Whether the closure follows this package's own declarations. */
  function descends(isAppRoot, json) {
    return variant !== 'carriers' || isAppRoot || typeof json.hozo?.manifest === 'string'
  }

  /** The package.json fields whose names the closure follows. */
  function declaredFields(isAppRoot) {
    const fields = ['dependencies', 'peerDependencies', 'optionalDependencies']
    return proposed && isAppRoot ? [...fields, 'devDependencies'] : fields
  }

  /** resolve(specifier) returns an absolute file or throws. */
  function locateSync(resolve, name) {
    try {
      return { file: resolve(name) }
    } catch (error) {
      if (!proposed) return { error: first(error) }
      try {
        return { file: resolve(`${name}/package.json`), recovered: true }
      } catch (second) {
        return { error: `${first(error)}; ${first(second)}` }
      }
    }
  }

  async function locate(resolve, name) {
    try {
      return { file: await resolve(name) }
    } catch (error) {
      if (!proposed) return { error: first(error) }
      try {
        return { file: await resolve(`${name}/package.json`), recovered: true }
      } catch (second) {
        return { error: `${first(error)}; ${first(second)}` }
      }
    }
  }

  return { declaredFields, descends, locate, locateSync, variant }
}

/** The value of --variant in argv, or the default. */
function variantArgument(argv) {
  const index = argv.indexOf('--variant')
  return index === -1 ? 'declared' : argv[index + 1]
}

module.exports = { closureVariant, variantArgument }
