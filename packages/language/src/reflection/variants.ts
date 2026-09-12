import { isEntityVariantDescriptor, type EntityVariantDescriptor } from '@ontahi/core/data-graph';

import type {
  ConsoleLanguageApplicationReflection,
  SelectionLanguageEntityReflection,
} from '../model/contracts.js';

/** Project discovered read roots over existing base reflection; no source execution or dialect logic. */
export const reflectConsoleApplicationVariants = (
  entities: readonly SelectionLanguageEntityReflection[],
  variants: readonly EntityVariantDescriptor[],
): ConsoleLanguageApplicationReflection => {
  const names = new Set(entities.map(entity => entity.name));
  const classified: SelectionLanguageEntityReflection[] = [];
  for (const variant of variants) {
    if (!isEntityVariantDescriptor(variant) || names.has(variant.name)) continue;
    const base = entities.find(entity => entity.name === variant.baseEntityName);
    const discriminator = base?.fields.find(
      field => field.name === variant.discriminator.fieldName,
    );
    if (
      !base ||
      discriminator?.type !== 'enum' ||
      !discriminator.enumValues?.includes(variant.discriminator.value)
    )
      continue;
    names.add(variant.name);
    classified.push({
      name: variant.name,
      variant: structuredClone(variant),
      ...(base.selectionFactories ? { selectionFactories: base.selectionFactories } : {}),
      ...(base.contextualSelections ? { contextualSelections: base.contextualSelections } : {}),
      ...(base.relations ? { relations: base.relations } : {}),
      fields: base.fields.map(field =>
        field === discriminator
          ? { ...field, nullable: false, enumValues: [variant.discriminator.value] }
          : field,
      ),
    });
  }
  return { entities: [...entities, ...classified] };
};
