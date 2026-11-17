# Framework starters, as they ship

Each directory holds the files `hozo init` reads and edits (RFC 013 §2),
copied byte for byte from the starter named in `sources.json`, at the version
or commit named there. Only those files are copied: the config, the
stylesheet the starter builds with, and the `package.json` that says which
stack it is. Expo's `src/app/_layout.tsx` is there only so the fixture has
the `src/` directory the starter has, which decides where `init` puts a new
stylesheet.

They are not formatted (Biome ignores this directory), because a starter's
own quotes and semicolons are what `init` has to keep.

To refresh one, copy the same files from a newer release and update its
entry in `sources.json` in the same commit.

Storybook has no directory: `storybook init` writes `.storybook/main.ts`
from code rather than copying a template.
