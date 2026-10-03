import {
  safeParseUnknownGraphSchema,
  type GraphReadCapabilities,
  type GraphReadRequest,
  type GraphSchemaDefinition,
} from '../../../../data-graph/index.js';
import type { JsonValue } from '../../../../value/json.js';
import { ModelInterpretationError } from '../interpretation.js';

export type ModelGraphReadResult = {
  readonly kind: 'graph-read-result';
  readonly value: JsonValue;
  readonly capabilities?: GraphReadCapabilities;
};

/** A scoped projection of the existing graph-read contract, never an alternative query language. */
export type ModelGraphReadExposure = {
  description: string;
  request: GraphSchemaDefinition;
  validate: (request: GraphReadRequest) => string | undefined;
  message?: (result: ModelGraphReadResult, request: GraphReadRequest) => string;
};

export const resolveModelGraphRead = (
  request: GraphReadRequest,
  reads: readonly ModelGraphReadExposure[],
): ModelGraphReadExposure => {
  const exposure = reads.find(read => safeParseUnknownGraphSchema(read.request, request).success);
  if (!exposure)
    throw new ModelInterpretationError(
      'proposal_out_of_scope',
      'Graph read is outside the configured scope.',
    );
  return exposure;
};

export const validateModelGraphRead = (
  request: GraphReadRequest,
  reads: readonly ModelGraphReadExposure[],
) => resolveModelGraphRead(request, reads).validate(request);
