import { toZodSchema } from '../computation/schema/zod.js';
import type { GraphSchemaDefinition } from '../model/schema/definition.js';

import { getGraphOutputDescriptor, type GraphOutputDescriptor } from './output/index.js';

export * from '../computation/schema/zod.js';

export const toGraphOutputDescriptor = (
  schema: GraphSchemaDefinition,
): GraphOutputDescriptor | undefined => getGraphOutputDescriptor(schema);

export const graphAdapters = {
  zod: toZodSchema,
  graphOutput: toGraphOutputDescriptor,
};
