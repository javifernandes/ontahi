import {
  safeParseUnknownGraphSchema,
  type GraphSchemaDefinition,
  type GraphCommandRequest,
} from '../../data-graph/index.js';

import { ModelInterpretationError } from './model-interpretation.js';

/** A scoped projection of the existing graph-command contract, never an alternative payload. */
export type ModelGraphCommandExposure = {
  description: string;
  request: GraphSchemaDefinition;
  validate: (request: GraphCommandRequest) => string | undefined;
  message?: (request: GraphCommandRequest) => string;
};

export const resolveModelGraphCommand = (
  request: GraphCommandRequest,
  commands: readonly ModelGraphCommandExposure[],
): ModelGraphCommandExposure => {
  const exposure = commands.find(
    command => safeParseUnknownGraphSchema(command.request, request).success,
  );
  if (!exposure)
    throw new ModelInterpretationError(
      'proposal_out_of_scope',
      'Graph command is outside the configured scope.',
    );
  return exposure;
};

export const validateModelGraphCommand = (
  request: GraphCommandRequest,
  commands: readonly ModelGraphCommandExposure[],
) => resolveModelGraphCommand(request, commands).validate(request);
