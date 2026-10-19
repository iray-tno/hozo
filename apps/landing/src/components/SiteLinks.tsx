import { Link, Nav, Text } from '@hozo/core'

export interface SiteLinksProps {
  baseUrl?: string
}

// Every page of the site, in one row: the landing's footer and the /docs
// footer both render it, so the two halves of the site name the same
// places. Its colours are the landing's tokens, which /docs rebinds to
// Starlight's (src/styles/docs.css), so the row follows Starlight's light
// and dark themes there without a second copy of it.
export function SiteLinks({ baseUrl = '' }: SiteLinksProps) {
  const cleanBase = baseUrl ? baseUrl.replace(/\/$/, '') : ''

  return (
    <Nav
      accessibilityLabel="Site"
      className="flex flex-row flex-wrap items-center justify-center sm:justify-start gap-x-6 gap-y-3 pt-6 border-t border-hinoki/18 text-xs font-medium"
    >
      <Link
        href={`${cleanBase}/docs/`}
        className="no-underline hover:underline hover:text-hinoki-light text-shikkui-muted transition-colors"
      >
        <Text>Documentation</Text>
      </Link>
      <Link
        href={`${cleanBase}/docs/getting-started/`}
        className="no-underline hover:underline hover:text-hinoki-light text-shikkui-muted transition-colors"
      >
        <Text>Getting started</Text>
      </Link>
      <Link
        href={`${cleanBase}/#try-hozo`}
        className="no-underline hover:underline hover:text-hinoki-light text-shikkui-muted transition-colors"
      >
        <Text>Try Hozo</Text>
      </Link>
      <Link
        href={`${cleanBase}/repl/`}
        className="no-underline hover:underline hover:text-hinoki-light text-shikkui-muted transition-colors"
      >
        <Text>Interactive REPL</Text>
      </Link>
      <Link
        href={`${cleanBase}/storybook/`}
        className="no-underline hover:underline hover:text-hinoki-light text-shikkui-muted transition-colors"
      >
        <Text>Storybook</Text>
      </Link>
      <Link
        href={`${cleanBase}/reports/`}
        className="no-underline hover:underline hover:text-hinoki-light text-shikkui-muted transition-colors"
      >
        <Text>Test Reports (Allure)</Text>
      </Link>
      <Link
        href={`${cleanBase}/conformance/`}
        className="no-underline hover:underline hover:text-hinoki-light text-shikkui-muted transition-colors"
      >
        <Text>Conformance Matrix</Text>
      </Link>
      <Link
        href={`${cleanBase}/three/`}
        className="no-underline hover:underline hover:text-hinoki-light text-shikkui-muted transition-colors"
      >
        <Text>Three.js (3D)</Text>
      </Link>
      <Link
        href={`${cleanBase}/canvas/`}
        className="no-underline hover:underline hover:text-hinoki-light text-shikkui-muted transition-colors"
      >
        <Text>2D Canvas</Text>
      </Link>
      <Link
        href={`${cleanBase}/svg/`}
        className="no-underline hover:underline hover:text-hinoki-light text-shikkui-muted transition-colors"
      >
        <Text>Universal SVG</Text>
      </Link>
      <Link
        href={`${cleanBase}/tailwind/`}
        className="no-underline hover:underline hover:text-hinoki-light text-shikkui-muted transition-colors"
      >
        <Text>Tailwind AOT</Text>
      </Link>
      <Link
        href={`${cleanBase}/stylex/`}
        className="no-underline hover:underline hover:text-hinoki-light text-shikkui-muted transition-colors"
      >
        <Text>StyleX</Text>
      </Link>
      <Link
        href="https://github.com/iray-tno/hozo"
        className="no-underline hover:underline hover:text-hinoki-light text-shikkui-muted transition-colors"
      >
        <Text>GitHub Repository</Text>
      </Link>
      <Link
        href="https://github.com/iray-tno/hozo/blob/main/docs/proposal.md"
        className="no-underline hover:underline hover:text-hinoki-light text-shikkui-muted transition-colors"
      >
        <Text>Proposal (JP)</Text>
      </Link>
      <Link
        href="https://github.com/iray-tno/hozo/blob/main/LICENSE"
        className="no-underline hover:underline hover:text-hinoki-light text-shikkui-muted transition-colors"
      >
        <Text>MIT License</Text>
      </Link>
    </Nav>
  )
}
