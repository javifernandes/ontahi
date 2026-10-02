import type {
  AnyEntityDefinition,
  GraphCommandProtocolError,
  GraphCommandRequest,
  GraphSchemaDefinition,
  GraphSchemaValidationIssue,
} from '../data-graph/index.js';
import {
  normalizeGraphSchemaClientInput,
  parseGraphCommandRequest,
  resolveGraphCommandRequest,
  safeParseUnknownGraphSchema,
} from '../data-graph/index.js';

import { applicationHole, isApplicationHole } from './application-hole.js';

export type GraphCommandApplication = {
  readonly kind: 'graph-command-application';
  readonly request: GraphCommandRequest;
};

export type GraphCommandApplicationSubstitutionResult =
  | { readonly success: true; readonly application: GraphCommandApplication }
  | {
      readonly success: false;
      readonly reason: 'unknown-hole';
      readonly holeId: string;
    }
  | {
      readonly success: false;
      readonly reason: 'invalid-substitution';
      readonly holeId: string;
      readonly issues: readonly GraphSchemaValidationIssue[];
    };

export type GraphCommandApplicationLoweringResult =
  | { readonly success: true; readonly request: GraphCommandRequest }
  | {
      readonly success: false;
      readonly reason: 'open-application';
      readonly holes: readonly string[];
    }
  | {
      readonly success: false;
      readonly reason: 'invalid-request';
      readonly error: GraphCommandProtocolError;
    };

const valueHoleEntries = (application: GraphCommandApplication) => {
  const { command } = application.request;
  if (command.kind !== 'entity-mutation-command' || command.action === 'delete') return [];
  return Object.entries(command.values).filter(
    (entry): entry is [string, { kind: 'hole'; id: string }] => isApplicationHole(entry[1]),
  );
};

const readEntity = (
  entityName: string,
  entities: readonly AnyEntityDefinition[],
): AnyEntityDefinition | undefined => entities.find(entity => entity.name === entityName);

const parseFieldValue = (schema: GraphSchemaDefinition, value: unknown) => {
  try {
    return safeParseUnknownGraphSchema(schema, normalizeGraphSchemaClientInput(schema, value));
  } catch (error) {
    return {
      success: false as const,
      issues: [
        {
          code: 'invalid_graph_command_input',
          path: [],
          message: error instanceof Error ? error.message : 'Invalid Graph Command value.',
        },
      ],
    };
  }
};

export const openGraphCommandApplication = (
  request: GraphCommandRequest,
  entities: readonly AnyEntityDefinition[],
  holesByValueField: Readonly<Record<string, string>>,
): GraphCommandApplication => {
  const resolved = resolveGraphCommandRequest(request, { entities });
  if (!resolved.success) throw new Error(resolved.error.error.message);
  const { command } = request;
  if (command.kind !== 'entity-mutation-command' || command.action === 'delete') {
    throw new Error('Graph Command application requires an Entity create or update payload.');
  }

  const missing = Object.keys(holesByValueField).filter(
    fieldName => !Object.prototype.hasOwnProperty.call(command.values, fieldName),
  );
  if (missing.length > 0)
    throw new Error(`Graph Command application has no value field for ${missing.join(', ')}.`);

  return {
    kind: 'graph-command-application',
    request: {
      ...request,
      command: {
        ...command,
        values: Object.fromEntries(
          Object.entries(command.values).map(([fieldName, value]) => [
            fieldName,
            holesByValueField[fieldName] === undefined
              ? value
              : applicationHole(holesByValueField[fieldName]),
          ]),
        ),
      },
    } as GraphCommandRequest,
  };
};

export const graphCommandApplicationHoles = (
  application: GraphCommandApplication,
): readonly string[] => [...new Set(valueHoleEntries(application).map(([, hole]) => hole.id))];

export const substituteGraphCommandApplication = (
  application: GraphCommandApplication,
  entities: readonly AnyEntityDefinition[],
  holeId: string,
  value: unknown,
): GraphCommandApplicationSubstitutionResult => {
  const command = application.request.command;
  if (command.kind !== 'entity-mutation-command' || command.action === 'delete') {
    return { success: false, reason: 'unknown-hole', holeId };
  }
  const positions = Object.entries(command.values).filter(
    (entry): entry is [string, { kind: 'hole'; id: string }] =>
      isApplicationHole(entry[1]) && entry[1].id === holeId,
  );
  if (positions.length === 0) return { success: false, reason: 'unknown-hole', holeId };

  const entity = readEntity(command.entityName, entities);
  const normalizedValues = new Map<string, unknown>();
  const issues = positions.flatMap(([fieldName]) => {
    const schema = entity?.fields[fieldName];
    if (!schema)
      return [
        {
          code: 'unknown_graph_command_field',
          path: [fieldName],
          message: `Unknown Graph Command field ${fieldName}.`,
        },
      ];
    const parsed = parseFieldValue(schema as GraphSchemaDefinition, value);
    if (parsed.success) {
      normalizedValues.set(fieldName, parsed.data);
      return [];
    }
    return parsed.issues.map(issue => ({ ...issue, path: [fieldName, ...issue.path] }));
  });
  if (issues.length > 0) return { success: false, reason: 'invalid-substitution', holeId, issues };

  return {
    success: true,
    application: {
      ...application,
      request: {
        ...application.request,
        command: {
          ...command,
          values: Object.fromEntries(
            Object.entries(command.values).map(([fieldName, current]) => [
              fieldName,
              isApplicationHole(current) && current.id === holeId
                ? normalizedValues.get(fieldName)
                : current,
            ]),
          ),
        },
      } as GraphCommandRequest,
    },
  };
};

export const lowerGraphCommandApplication = (
  application: GraphCommandApplication,
  entities: readonly AnyEntityDefinition[],
): GraphCommandApplicationLoweringResult => {
  const holes = graphCommandApplicationHoles(application);
  if (holes.length > 0) return { success: false, reason: 'open-application', holes };

  const parsed = parseGraphCommandRequest(application.request);
  if (!parsed.success) return { success: false, reason: 'invalid-request', error: parsed.error };
  const resolved = resolveGraphCommandRequest(parsed.request, { entities });
  return resolved.success
    ? { success: true, request: resolved.request }
    : { success: false, reason: 'invalid-request', error: resolved.error };
};
