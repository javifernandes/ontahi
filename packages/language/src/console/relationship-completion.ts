import type { GraphSchemaDescriptor, GraphSchemaObjectDescriptor } from '@ontahi/core/data-graph';

import type {
  ConsoleGraphReadSyntax,
  ConsoleLanguageApplicationReflection,
  ConsoleLanguageCompletionItem,
  ConsoleLanguageCompletionResult,
} from '../model/contracts.js';

import { completionWordRange } from './completion.js';
import { completeStructuredInput } from './structured-value.js';

const placeholder = (descriptor: GraphSchemaDescriptor): unknown => {
  if (descriptor.kind === 'scalar') {
    if (descriptor.type === 'number') return 0;
    if (descriptor.type === 'boolean') return false;
    return descriptor.type === 'enum' ? (descriptor.enumValues?.[0] ?? '') : '';
  }
  if (descriptor.kind === 'entity-ref') return {};
  if ('item' in descriptor && descriptor.item) return placeholder(descriptor.item);
  return null;
};

const locatorApply = (descriptor: GraphSchemaObjectDescriptor) =>
  `{ ${Object.entries(descriptor.fields)
    .map(([name, field]) => `${name}: ${JSON.stringify(placeholder(field))}`)
    .join(', ')} }`;

const locatorItem = (
  entityName: string,
  descriptor: GraphSchemaObjectDescriptor,
): ConsoleLanguageCompletionItem => {
  const apply = locatorApply(descriptor);
  const quote = apply.indexOf('""');
  return {
    label: '{…}',
    apply,
    ...(quote < 0 ? {} : { cursorOffset: quote + 1 }),
    kind: 'punctuation',
    detail: `${entityName} locator`,
  };
};

export const completeRelationshipCommand = (
  document: string,
  position: number,
  expression: ConsoleGraphReadSyntax | undefined,
  application: ConsoleLanguageApplicationReflection,
): ConsoleLanguageCompletionResult | undefined => {
  const action = /^\s*(attach|detach|move)\b/.exec(document)?.[1] as
    | 'attach'
    | 'detach'
    | 'move'
    | undefined;
  if (!action) return undefined;
  const range = completionWordRange(document, position);
  const prefix = document.slice(range.from, position);
  const result = (items: readonly ConsoleLanguageCompletionItem[]) => ({
    ...range,
    items: items.filter(item => item.label.startsWith(prefix)),
  });
  const eligible = (application.commands ?? []).flatMap(command =>
    (command.relationshipAffordances ?? [])
      .filter(affordance =>
        action === 'move'
          ? affordance.relationKind === 'ordered'
          : affordance.actions.some(
              candidate => candidate === (action === 'attach' ? 'link' : 'unlink'),
            ),
      )
      .map(affordance => ({ command, affordance })),
  );
  const syntax = expression?.kind === 'relationship-command' ? expression : undefined;
  if (!syntax?.entity) {
    return result(
      [...new Set(eligible.map(({ command }) => command.entityName))].map(name => ({
        label: name,
        apply: `${name} `,
        kind: 'entity' as const,
        detail: 'Relationship source Entity',
      })),
    );
  }
  const candidates = eligible.filter(({ command }) => command.entityName === syntax.entity?.text);
  if (!syntax.source)
    return result(
      candidates[0]
        ? [
            locatorItem(
              candidates[0].affordance.source.entityName,
              candidates[0].affordance.source.locator,
            ),
          ]
        : [],
    );
  const sourceCompletion = candidates[0]
    ? completeStructuredInput(
        document,
        position,
        syntax.source.from,
        candidates[0].affordance.source.locator,
      )
    : undefined;
  if (position <= syntax.source.to && sourceCompletion) return sourceCompletion;
  if (!syntax.relation)
    return result(
      candidates.map(({ affordance }) => ({
        label:
          affordance.relationKind === 'direct'
            ? affordance.relation.fieldName
            : affordance.relation.relationName,
        apply: `${affordance.relationKind === 'direct' ? affordance.relation.fieldName : affordance.relation.relationName} `,
        kind: 'member' as const,
        detail: `${affordance.relationKind} Relationship`,
      })),
    );
  const selected = candidates.find(({ affordance }) =>
    affordance.relationKind === 'direct'
      ? affordance.relation.fieldName === syntax.relation?.text
      : affordance.relation.relationName === syntax.relation?.text,
  )?.affordance;
  if (!selected) return result([]);
  const endpoint = selected.relationKind === 'ordered' ? selected.member : selected.target;
  if (!syntax.endpointEntity)
    return result([
      {
        label: endpoint.entityName,
        apply: `${endpoint.entityName} `,
        kind: 'entity',
        detail: 'Relationship target Entity',
      },
    ]);
  if (!syntax.endpoint) return result([locatorItem(endpoint.entityName, endpoint.locator)]);
  const endpointCompletion = completeStructuredInput(
    document,
    position,
    syntax.endpoint.from,
    endpoint.locator,
  );
  if (position <= syntax.endpoint.to && endpointCompletion) return endpointCompletion;
  if (action !== 'move') return result([]);
  if (!syntax.placement)
    return result([
      { label: 'before', apply: 'before ', kind: 'keyword', detail: 'Place before a member' },
      { label: 'after', apply: 'after ', kind: 'keyword', detail: 'Place after a member' },
      { label: 'at start', apply: 'at start', kind: 'keyword', detail: 'Place first' },
      { label: 'at end', apply: 'at end', kind: 'keyword', detail: 'Place last' },
    ]);
  if (syntax.placement === 'start' || syntax.placement === 'end') return result([]);
  if (!syntax.anchorEntity)
    return result([
      {
        label: endpoint.entityName,
        apply: `${endpoint.entityName} `,
        kind: 'entity',
        detail: 'Ordered anchor Entity',
      },
    ]);
  if (!syntax.anchor) return result([locatorItem(endpoint.entityName, endpoint.locator)]);
  const anchorCompletion = completeStructuredInput(
    document,
    position,
    syntax.anchor.from,
    endpoint.locator,
  );
  return position <= syntax.anchor.to && anchorCompletion ? anchorCompletion : result([]);
};
