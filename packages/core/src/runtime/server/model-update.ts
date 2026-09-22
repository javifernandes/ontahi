import {
  safeParseUnknownGraphSchema,
  type GraphSchemaDefinition,
  type UpdateEntityMutationCommand,
} from '../../data-graph/index.js';
import { isRecord } from '../../value/object.js';

import { ModelInterpretationError } from './model-interpretation.js';

/** Explicit editable projection. The graph command dispatcher remains the write authority. */
export type ModelUpdateBinding = {
  description: string;
  target: GraphSchemaDefinition;
  values: GraphSchemaDefinition;
  unresolvedReason: string;
  prepare: (
    target: Record<string, unknown>,
    values: Record<string, unknown>,
  ) => UpdateEntityMutationCommand | null;
  validate: (command: UpdateEntityMutationCommand) => string | undefined;
  message?: (command: UpdateEntityMutationCommand) => string;
};

export const prepareModelUpdate = (
  proposal: { entityName: string; target: unknown; values: unknown },
  bindings: Readonly<Record<string, ModelUpdateBinding>>,
) => {
  const binding = bindings[proposal.entityName];
  if (!binding)
    throw new ModelInterpretationError(
      'proposal_out_of_scope',
      'Entity update is outside the configured scope.',
    );
  const target = safeParseUnknownGraphSchema(binding.target, proposal.target);
  const values = safeParseUnknownGraphSchema(binding.values, proposal.values);
  if (
    !target.success ||
    !values.success ||
    !isRecord(target.data) ||
    !isRecord(values.data) ||
    !Object.keys(values.data).length
  )
    throw new ModelInterpretationError('model_output_invalid', 'Invalid entity update arguments.');
  return binding.prepare(target.data, values.data);
};

export const validateModelUpdate = (
  command: UpdateEntityMutationCommand,
  bindings: Readonly<Record<string, ModelUpdateBinding>>,
) => {
  const binding = bindings[command.entityName];
  if (!binding)
    throw new ModelInterpretationError(
      'proposal_out_of_scope',
      'Entity update is outside the configured scope.',
    );
  if (
    command.kind !== 'entity-mutation-command' ||
    command.action !== 'update' ||
    command.target.entityName !== command.entityName ||
    !safeParseUnknownGraphSchema(binding.values, command.values).success ||
    !Object.keys(command.values).length
  )
    throw new ModelInterpretationError('model_output_invalid', 'Invalid bound entity update.');
  return binding.validate(command);
};
