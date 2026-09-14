# Changesets

Every published package releases in lockstep, and past two or three that is not
something to do by hand.

A change that users will notice gets a changeset:

```sh
pnpm changeset
```

It asks which packages moved and whether the move is major, minor or
patch, and writes a small markdown file here. Commit it with the change.
The description becomes the changelog entry, so write it for someone
reading the release notes rather than the diff.

`.changeset/config.json` has all of them as a `fixed` group: they take one
version number between them. Bumping any one bumps all of them. That is
deliberate — `@hozo/vite` and `@hozo/compiler` are halves of one compiler,
and a project holding two Hozo packages at different versions is a support
question nobody wants.

Under `0.x`, a breaking change is a **minor** bump: `0.1.x` → `0.2.0`.
`^0.1.0` does not allow `0.2.0`, so that is the signal semver gives you
before 1.0. Reserve `major` for the deliberate move to 1.0.

## Releasing

1. Merge the **Version Packages** pull request that the `version` workflow
   opens. It applies every pending changeset: every version bumped, every
   changelog written, the changeset files consumed.
2. Tag the resulting commit and push the tag.

```sh
git tag v0.2.0 && git push origin v0.2.0
```

The tag is what publishes. Nothing reaches npm without one, which for a
registry with no undo past 72 hours is worth the extra step.

The same tag publishes the library crates (`hozo_ir`, `hozo_parser`,
`hozo_web`, `hozo_native`, `hozo_cache`) to crates.io, after the npm
packages and at the same version. `scripts/crate-metadata.mjs` writes that
version into `Cargo.toml`, and `pnpm run version` runs it. crates.io has no
unpublish at all, only yank.

## The first release

Neither registry accepts trusted publishing for a name that does not exist
yet: npm configures a trusted publisher only on an existing package, and
crates.io only "after an initial manual publishing of a crate". So the first
tag publishes with tokens:

1. Add the `NPM_TOKEN` and `CARGO_REGISTRY_TOKEN` repository secrets.
2. Tag `v0.1.0` -- the version every package and crate already carries --
   and push it.
3. Configure a trusted publisher for `release.yml` on each npm package and
   each crate.
4. Delete both secrets. npm falls back to OIDC once `NPM_TOKEN` is gone;
   the `crates` job in `release.yml` switches to
   `rust-lang/crates-io-auth-action`.
