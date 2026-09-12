import type { ContextualSelectionDescriptor } from '@ontahi/core/data-graph';

import type {
  ConsoleGraphReadSyntax,
  ConsoleLanguageApplicationReflection,
  SelectionLanguageEntityReflection,
} from '../model/contracts.js';

/** Shared semantic navigation, independent of punctuation, dialect and editor. */
export const consoleNavigationTarget = (
  entity: SelectionLanguageEntityReflection,
  name: string,
  application: ConsoleLanguageApplicationReflection,
):
  | { descriptor: ContextualSelectionDescriptor; entity: SelectionLanguageEntityReflection }
  | undefined => {
  if (!Object.prototype.hasOwnProperty.call(entity.contextualSelections ?? {}, name))
    return undefined;
  const descriptor = entity.contextualSelections![name]!;
  const target = application.entities.find(
    candidate => candidate.name === descriptor.output.entityName,
  );
  if (
    descriptor.version !== 1 ||
    descriptor.input.context.entityName !== (entity.variant?.baseEntityName ?? entity.name) ||
    descriptor.template.target.entityName !== target?.name ||
    !entity.relations?.some(relation => relation.name === descriptor.template.relationName) ||
    !target
  )
    return undefined;
  return { descriptor, entity: target };
};

/** Resolve only completed hops before the cursor; invalid prefixes never fall back to the root. */
export const resolveConsoleContext = (
  syntax: ConsoleGraphReadSyntax | undefined,
  application: ConsoleLanguageApplicationReflection,
  position = Number.POSITIVE_INFINITY,
): SelectionLanguageEntityReflection | undefined => {
  let entity = application.entities.find(candidate => candidate.name === syntax?.entity?.text);
  if (!syntax || !entity) return undefined;
  for (const navigation of syntax.navigations) {
    if (navigation.to >= position) break;
    if (!navigation.name) return undefined;
    entity = consoleNavigationTarget(entity, navigation.name.text, application)?.entity;
    if (!entity) return undefined;
  }
  return entity;
};
