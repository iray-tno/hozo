/**
 * A form with a look, wearing `@hozo/form`.
 *
 * The behaviour is theirs and is deliberately small: a submission with no event
 * in it, and a refusal to submit past a control already marked `aria-invalid`,
 * focusing that control instead.
 *
 * ## It is a column, and that is the whole look
 *
 * Which is worth saying rather than leaving as an apparent oversight. A form is a
 * grouping element: its own appearance is the gaps between the fields in it, and
 * everything else belongs to the `Field`s, the `Input`s and the `Button`s inside.
 * `Stack` would have done the same job, and the reason to have this file anyway is
 * that `<Stack>` around `<Form>` is two elements where one would do, and the
 * application would have to remember which of the two carries the label.
 *
 * `gap-4` rather than `gap-6`: a form's fields belong together more closely than a
 * page's sections do, and each `Field` already has its own internal spacing
 * between the label, the control and the message.
 */

import { Form as FormBase, type FormProps } from '@hozo/form'

export type HozoFormProps = Omit<FormProps, 'className'>

const form = 'flex w-full flex-col gap-4'

export function HozoForm(props: HozoFormProps) {
  return <FormBase {...props} className={form} />
}

export { HozoForm as Form, type HozoFormProps as FormProps }
