# Package channels before default manifest migration

RFC010's package-channel shadow extends the existing owner-only prototype with
explicit exports/owner references, finite runtime candidates, exported class
helpers, a compiled-by-consumer flag and strictly validated legacy v1 text
forwarding. Channels must be present even when empty. The bounded data reader
does not execute sources/config, infer a missing channel or certify audit.

This is `rfc010-package-shadow-0`, not public manifest version 2. Owner shapes
reuse the existing bounded reader and remain `audit: unknown`. Export aliases
may refer to the same owner; missing/unpublished owner and helper references
are errors. No primitive mapping is accepted: a custom component keeps its
implementation. New text publication/erasure semantics are not inferred from
legacy text-forwarding facts.

The envelope is at most 64 KiB, 128 exports, 512 finite candidate tokens and 64
helper names, with additional per-channel limits. Text variants use the existing
v1 converter's format, with finite validated conditions/defaults. Unknown fields,
schemas, unsafe identifiers, duplicate declarations and unsupported claims fail
explicitly. No adapter consumes it by default yet; v1 readers remain unchanged.

## Frozen package contributions

The existing instance capture now decodes either the owner-only shadow or this
package envelope. Raw content/entry/platform/context remain in identity. The
package projection unions only finite candidate tokens; exports, helpers,
compiled-source policy and legacy text facts stay attached to each resolved
instance, including when two versions publish the same names. No global
name-to-facts table is manufactured.

Incomplete captures and owner-only declarations expose no usable package union:
the missing channels are explicitly unassessed, not guessed empty. Ordinary
nonparticipants are separately listed as unassessed. A complete participant
union is not proof of their style coverage. Explicit `owners: null` is valid
for a candidate/helper-only package and never invents an audited owner.
