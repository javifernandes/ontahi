import { Facet } from '@codemirror/state';
import type { SelectionLanguageEntityReflection } from '@ontahi/language';

export const selectionExpressionEntity = Facet.define<
  SelectionLanguageEntityReflection,
  SelectionLanguageEntityReflection | undefined
>({ combine: values => values.at(-1) });
