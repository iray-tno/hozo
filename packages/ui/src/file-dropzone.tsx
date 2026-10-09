/**
 * A file dropzone with a look, wearing `@hozo/form`.
 *
 * The behaviour is the form package's: a button that opens the picker, a
 * drop target on top of it on the Web, the same rules and the same sentence
 * after every pick. This file draws a dashed box that fills with the accent
 * while something is dragged over it.
 */

import { FileDropzone, type FileDropzoneProps } from '@hozo/form'

export type HozoFileDropzoneProps = FileDropzoneProps

const zone =
  'flex w-full flex-col items-center justify-center gap-2 rounded-hozo-surface border-2 border-dashed border-hozo-border-strong bg-hozo-surface px-6 py-8 text-center text-sm text-hozo-text-body cursor-pointer hover:bg-hozo-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus disabled:cursor-not-allowed disabled:text-hozo-text-subtle'
const active = 'border-hozo-accent bg-hozo-accent-subtle'

// Not named `HozoFileDropzone` here, as the others in this package are not:
// the local binding stays free for compiled output's runtime import.
function StyledFileDropzone({ className, activeClassName, ...rest }: HozoFileDropzoneProps) {
  return (
    <FileDropzone
      {...rest}
      className={className ? `${zone} ${className}` : zone}
      activeClassName={activeClassName ? `${active} ${activeClassName}` : active}
    />
  )
}

export {
  type HozoFileDropzoneProps as FileDropzoneProps,
  StyledFileDropzone as FileDropzone,
  StyledFileDropzone as HozoFileDropzone,
}
