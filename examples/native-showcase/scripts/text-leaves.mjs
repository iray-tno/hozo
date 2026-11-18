// Decision 013's reader and scope, for probes that ask about something else.
//
// With nothing published above it the reader hands its host exactly the
// style a plain Text gets, so it stands in as the probe's own Text host; the
// scope renders no host. What they inherit is compared with RFC 006's
// reference model in `packages/tailwind-conformance`, not here.
export const textLeaves = (Text) => ({
  HozoInheritedLeafText: Text,
  HozoInheritedScope: ({ children }) => children,
})
