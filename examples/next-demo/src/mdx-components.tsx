import type { ComponentProps, ReactNode } from 'react'

/**
 * Required by the App Router, and not because of Hozo.
 *
 * `@next/mdx` aliases `next-mdx-import-source-file` to this file if it
 * exists and to `@mdx-js/react` if it does not -- and that package builds a
 * React context, which a server component may not do. Without this the
 * build fails with `createContext is not a function` pointing at the
 * compiled MDX, which says nothing about the cause.
 */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return components
}

type MDXComponents = Record<string, (props: ComponentProps<'div'>) => ReactNode>
