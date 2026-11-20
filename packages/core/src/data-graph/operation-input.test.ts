import { expectTypeOf, it } from 'vitest';

import { graphLiteral } from './definitions.js';
import { attachOperationInputSchema } from './operation-input.js';
import type { GraphSchemaParseResult } from './schema.js';

it('preserves the historical mutable Graph schema parse result for ordinary calls', () => {
  const input = attachOperationInputSchema(graphLiteral('ready'));
  const result = input.safeParse('ready');

  expectTypeOf(result).toEqualTypeOf<GraphSchemaParseResult<'ready'>>();
});
