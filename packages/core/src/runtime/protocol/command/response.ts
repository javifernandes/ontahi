import {
  isEntityMutationCommandDiagnostic,
  type EntityMutationCommandDiagnostic,
  type EntityMutationDelta,
} from '../../../data-graph/entity-mutation-command.js';
import {
  isRelationshipCommandDiagnostic,
  type RelationshipCommandDiagnostic,
  type RelationshipCommandResult,
} from '../../../model/relation/command-result.js';
import { isRecord } from '../../../value/object.js';

import type { GraphCommandCapabilitiesResult, GraphCommandProtocolError } from './protocol.js';

export type GraphCommandDispatchResponse =
  | GraphCommandCapabilitiesResult
  | {
      readonly kind: 'graph-command-result';
      readonly value: RelationshipCommandResult | EntityMutationDelta;
    }
  | {
      readonly kind: 'graph-command-rejection';
      readonly diagnostic: RelationshipCommandDiagnostic | EntityMutationCommandDiagnostic;
    }
  | GraphCommandProtocolError;

export const isGraphCommandRejection = (
  value: unknown,
): value is Extract<GraphCommandDispatchResponse, { kind: 'graph-command-rejection' }> =>
  isRecord(value) &&
  value.kind === 'graph-command-rejection' &&
  (isRelationshipCommandDiagnostic(value.diagnostic) ||
    isEntityMutationCommandDiagnostic(value.diagnostic));
