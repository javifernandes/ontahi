import { isPlainObject } from '../../value/object.js';

import type {
  EntityRefInputDeclaration,
  EntityRefInputDeclarations,
  EntityRefInputDerivedRefs,
  EntityRefInputLocator,
  EntityRefInputResolver,
  EntityRefInputRunInput,
} from './input.js';
import {
  createEntityRef,
  isEntityRef,
  isEntityRefLocatorValue,
  normalizeEntityRef,
  type AnyEntityRef,
  type EntityRefLocator,
  type EntityRefLocatorValue,
} from './model.js';

const capitalizePathSegment = (value: string): string =>
  value.length === 0 ? value : `${value[0]?.toUpperCase()}${value.slice(1)}`;

const fieldPathToPascalCase = (fieldPath: string): string =>
  fieldPath.split('.').map(capitalizePathSegment).join('');

const uniqueFieldGroups = (
  groups: readonly (readonly string[])[],
): readonly (readonly string[])[] => {
  const seen = new Set<string>();

  return groups.filter(group => {
    const key = group.join('\u0000');

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

export const inferEntityRefInputLocatorFieldGroups = (
  inputRefName: string,
  sourceFields: readonly string[],
): readonly (readonly string[])[] => {
  if (sourceFields.length === 0) {
    return [];
  }

  return uniqueFieldGroups([
    sourceFields.map(fieldPath =>
      fieldPath.startsWith(inputRefName)
        ? fieldPath
        : `${inputRefName}${fieldPathToPascalCase(fieldPath)}`,
    ),
    sourceFields,
    sourceFields.map(fieldPath => `${inputRefName}.${fieldPath}`),
  ]);
};

const genericLocatorFieldNames = new Set(['email', 'id', 'name', 'slug', 'token']);

const inferPreferredEntityRefInputLocatorFieldGroup = (
  inputRefName: string,
  sourceFields: readonly string[],
): readonly string[] => {
  if (sourceFields.length !== 1) {
    return sourceFields;
  }

  const [sourceField] = sourceFields;

  if (!sourceField || sourceField.startsWith(inputRefName)) {
    return sourceFields;
  }

  return genericLocatorFieldNames.has(sourceField)
    ? [`${inputRefName}${fieldPathToPascalCase(sourceField)}`]
    : sourceFields;
};
const readInputField = (input: Record<string, unknown>, fieldPath: string): unknown =>
  fieldPath
    .split('.')
    .reduce<unknown>(
      (current, segment) =>
        isPlainObject(current) ? (current as Record<string, unknown>)[segment] : undefined,
      input,
    );

const writeInputField = (
  input: Record<string, unknown>,
  fieldPath: string,
  value: EntityRefLocatorValue,
): boolean => {
  if (!fieldPath || fieldPath.includes('.')) {
    return false;
  }

  if (!(fieldPath in input)) {
    input[fieldPath] = value;
  }

  return true;
};

const buildLocatorFromInput = (
  input: Record<string, unknown>,
  locator: EntityRefInputLocator,
): EntityRefLocator | undefined => {
  if (locator.fields.length === 0) {
    return undefined;
  }

  if (locator.fields.length === 1) {
    const value = readInputField(input, locator.fields[0]);

    if (!isEntityRefLocatorValue(value)) {
      return undefined;
    }

    return locator.toLocator ? locator.toLocator(value) : { [locator.name]: value };
  }

  const locatorEntries = locator.fields.flatMap(fieldPath => {
    const value = readInputField(input, fieldPath);
    const locatorField = fieldPath.split('.').at(-1);

    return locatorField && isEntityRefLocatorValue(value) ? [[locatorField, value] as const] : [];
  });

  if (locatorEntries.length !== locator.fields.length) {
    return undefined;
  }

  return locator.toLocator
    ? locator.toLocator(...locatorEntries.map(([, value]) => value))
    : Object.fromEntries(locatorEntries);
};

const resolveEntityRefInputLocators = (
  inputRefName: string,
  inputRef: EntityRefInputDeclaration<any, any, any>,
): readonly EntityRefInputLocator[] => {
  if (inputRef.locators.length > 0) {
    return inputRef.locators;
  }

  return inputRef.inferredLocators.flatMap(locator => {
    const sourceFields = locator.sourceFields ?? locator.fields;

    return inferEntityRefInputLocatorFieldGroups(inputRefName, sourceFields).map(fields => ({
      ...locator,
      fields,
    }));
  });
};

const isEntityRefForInput = (
  value: unknown,
  inputRef: EntityRefInputDeclaration<any, any, any>,
): value is AnyEntityRef => isEntityRef(value) && value.entityName === inputRef.entityName;

const readDirectInputRef = (
  input: Record<string, unknown>,
  inputRefName: string,
  inputRef: EntityRefInputDeclaration<any, any, any>,
): AnyEntityRef | undefined => {
  const value = readInputField(input, inputRefName);

  return isEntityRefForInput(value, inputRef) ? value : undefined;
};

const applyEntityRefLocatorFields = (
  input: Record<string, unknown>,
  inputRefName: string,
  inputRef: EntityRefInputDeclaration<any, any, any>,
  ref: AnyEntityRef,
): boolean => {
  let applied = false;

  for (const locator of resolveEntityRefInputLocators(inputRefName, inputRef)) {
    const sourceFields = locator.sourceFields ?? locator.fields;
    const values = sourceFields.map(sourceField => ref.locator[sourceField]);

    if (values.some(value => !isEntityRefLocatorValue(value))) {
      continue;
    }

    for (const fieldGroup of inferEntityRefInputLocatorFieldGroups(inputRefName, sourceFields)) {
      fieldGroup.forEach((fieldPath, index) => {
        applied =
          writeInputField(input, fieldPath, values[index] as EntityRefLocatorValue) || applied;
      });
    }
  }

  return applied;
};

const applyEntityRefQueryLocatorFields = (
  input: Record<string, unknown>,
  inputRefName: string,
  inputRef: EntityRefInputDeclaration<any, any, any>,
  ref: AnyEntityRef,
): boolean => {
  const locators =
    inputRef.locators.length > 0
      ? inputRef.locators
      : inputRef.inferredLocators.map(locator => ({
          ...locator,
          fields: inferPreferredEntityRefInputLocatorFieldGroup(
            inputRefName,
            locator.sourceFields ?? locator.fields,
          ),
        }));
  let applied = false;

  for (const locator of locators) {
    const sourceFields = locator.sourceFields ?? locator.fields;
    const values = sourceFields.map(sourceField => ref.locator[sourceField]);

    if (values.some(value => !isEntityRefLocatorValue(value))) {
      continue;
    }

    locator.fields.forEach((fieldPath, index) => {
      applied =
        writeInputField(input, fieldPath, values[index] as EntityRefLocatorValue) || applied;
    });
  }

  return applied;
};

const applyGenericEntityRefQueryLocatorFields = (
  input: Record<string, unknown>,
  inputRefName: string,
  ref: AnyEntityRef,
): boolean => {
  const sourceFields = Object.keys(ref.locator);
  const values = sourceFields.map(sourceField => ref.locator[sourceField]);

  if (sourceFields.length === 0 || values.some(value => !isEntityRefLocatorValue(value))) {
    return false;
  }

  let applied = false;

  inferPreferredEntityRefInputLocatorFieldGroup(inputRefName, sourceFields).forEach(
    (fieldPath, index) => {
      applied =
        writeInputField(input, fieldPath, values[index] as EntityRefLocatorValue) || applied;
    },
  );

  return applied;
};

const readEntityRefQueryLocatorValue = (
  input: Record<string, unknown>,
  locator: Pick<EntityRefInputLocator, 'fields'>,
): EntityRefLocatorValue | EntityRefLocator | undefined => {
  const values = locator.fields.map(fieldPath => readInputField(input, fieldPath));

  if (values.some(value => !isEntityRefLocatorValue(value))) {
    return undefined;
  }

  if (values.length === 1) {
    return values[0] as EntityRefLocatorValue;
  }

  return Object.fromEntries(
    locator.fields.map((fieldPath, index) => [
      fieldPath.split('.').at(-1) ?? fieldPath,
      values[index] as EntityRefLocatorValue,
    ]),
  );
};

export const readEntityRefQueryInputValue = (
  input: unknown,
  inputRefName: string,
  inputRef?: EntityRefInputDeclaration<any, any, any>,
): string | EntityRefLocatorValue | EntityRefLocator | undefined => {
  if (!isPlainObject(input)) {
    return undefined;
  }

  const directRef = inputRef
    ? readDirectInputRef(input, inputRefName, inputRef)
    : isEntityRef(readInputField(input, inputRefName))
      ? (readInputField(input, inputRefName) as AnyEntityRef)
      : undefined;

  if (directRef) {
    return normalizeEntityRef(directRef);
  }

  if (inputRef) {
    const locators =
      inputRef.locators.length > 0
        ? inputRef.locators
        : inputRef.inferredLocators.map(locator => ({
            ...locator,
            fields: inferPreferredEntityRefInputLocatorFieldGroup(
              inputRefName,
              locator.sourceFields ?? locator.fields,
            ),
          }));

    for (const locator of locators) {
      const value = readEntityRefQueryLocatorValue(input, locator);

      if (value !== undefined) {
        return value;
      }
    }
  }

  for (const sourceField of genericLocatorFieldNames) {
    const fieldPath = `${inputRefName}${fieldPathToPascalCase(sourceField)}`;
    const value = readInputField(input, fieldPath);

    if (isEntityRefLocatorValue(value)) {
      return value;
    }
  }

  const nested = readInputField(input, inputRefName);

  if (isEntityRefLocatorValue(nested)) {
    return nested;
  }

  return undefined;
};

export const normalizeEntityRefInput = <
  TInput extends object,
  TInputRefs extends EntityRefInputDeclarations,
>(
  input: TInput,
  inputRefs: TInputRefs | undefined,
): TInput => {
  if (Object.keys(inputRefs ?? {}).length === 0 || !isPlainObject(input)) {
    return input;
  }

  const normalized = { ...(input as Record<string, unknown>) };

  for (const [name, inputRef] of Object.entries(inputRefs ?? {})) {
    const directRef = readDirectInputRef(normalized, name, inputRef);

    if (directRef) {
      applyEntityRefLocatorFields(normalized, name, inputRef, directRef);
    }
  }

  return normalized as TInput;
};

export const normalizeEntityRefQueryInput = <
  TInput,
  TInputRefs extends EntityRefInputDeclarations = EntityRefInputDeclarations,
>(
  input: TInput,
  inputRefs?: TInputRefs,
): TInput => {
  if (!isPlainObject(input)) {
    return input;
  }

  const normalized = { ...(input as Record<string, unknown>) };
  const projectedRefFields = new Set<string>();

  for (const [name, inputRef] of Object.entries(inputRefs ?? {})) {
    const directRef = readDirectInputRef(normalized, name, inputRef);

    if (directRef && applyEntityRefQueryLocatorFields(normalized, name, inputRef, directRef)) {
      projectedRefFields.add(name);
    }
  }

  for (const [name, value] of Object.entries(input as Record<string, unknown>)) {
    if (isEntityRef(value) && applyGenericEntityRefQueryLocatorFields(normalized, name, value)) {
      projectedRefFields.add(name);
    }
  }

  for (const name of projectedRefFields) {
    delete normalized[name];
  }

  return normalized as TInput;
};

export const bindEntityRefInputResolver = <
  TRef extends AnyEntityRef,
  TResolver extends EntityRefInputResolver<TRef['entityName'], unknown> | undefined,
>(
  ref: TRef,
  resolver: TResolver,
  resolutionScope?: EntityRefInputResolutionScope,
) => {
  if (!resolver) {
    return ref;
  }

  const resolvedRef = createEntityRef(ref.entityName, ref.locator) as TRef;
  let hasResolved = false;
  let resolved: unknown;

  const resolve = () => {
    if (!resolver) return resolvedRef;
    if (resolutionScope) {
      return resolutionScope.resolve(
        resolvedRef,
        resolver as EntityRefInputResolver<TRef['entityName'], unknown>,
      );
    }
    if (!hasResolved) {
      resolved = resolver(resolvedRef);
      hasResolved = true;
    }

    return resolved;
  };

  const invalidate = () => {
    hasResolved = false;
    resolved = undefined;
    resolutionScope?.invalidate(resolvedRef);
  };

  Object.defineProperties(resolvedRef, {
    resolve: {
      configurable: true,
      enumerable: false,
      value: resolve,
    },
    invalidate: {
      configurable: true,
      enumerable: false,
      value: invalidate,
    },
    refresh: {
      configurable: true,
      enumerable: false,
      value: () => {
        invalidate();
        return resolve();
      },
    },
  });

  return resolvedRef as TRef & {
    resolve: () => TResolver extends EntityRefInputResolver<TRef['entityName'], infer TResult>
      ? TResult
      : never;
    invalidate: () => void;
    refresh: () => TResolver extends EntityRefInputResolver<TRef['entityName'], infer TResult>
      ? TResult
      : never;
  };
};

export type EntityRefInputResolutionScope = {
  resolve: <TResult>(
    ref: AnyEntityRef,
    resolver: EntityRefInputResolver<string, TResult>,
  ) => TResult;
  invalidate: (ref: AnyEntityRef) => void;
};

export const deriveEntityRefInputRefs = <TInputRefs extends EntityRefInputDeclarations>(
  input: object,
  inputRefs: TInputRefs | undefined,
  resolutionScope?: EntityRefInputResolutionScope,
): EntityRefInputDerivedRefs<TInputRefs> => {
  const inputRecord = input as Record<string, unknown>;

  return Object.fromEntries(
    Object.entries(inputRefs ?? {}).flatMap(([name, inputRef]) => {
      const directRef = readDirectInputRef(inputRecord, name, inputRef);
      const ref =
        directRef ??
        (() => {
          const locator = resolveEntityRefInputLocators(name, inputRef)
            .map(candidate => buildLocatorFromInput(inputRecord, candidate))
            .find(candidate => candidate !== undefined);

          return locator ? createEntityRef(inputRef.entityName, locator) : undefined;
        })();

      return ref
        ? [[name, bindEntityRefInputResolver(ref, inputRef.resolver, resolutionScope)]]
        : [];
    }),
  ) as EntityRefInputDerivedRefs<TInputRefs>;
};

export const attachEntityRefInputRefs = <
  TInput extends object,
  TInputRefs extends EntityRefInputDeclarations,
>(
  input: TInput,
  inputRefs: TInputRefs | undefined,
  resolutionScope?: EntityRefInputResolutionScope,
): EntityRefInputRunInput<TInput, TInputRefs> => {
  const refs = deriveEntityRefInputRefs(input, inputRefs, resolutionScope);
  const hasInputRefs = Object.keys(inputRefs ?? {}).length > 0;

  return !hasInputRefs
    ? (input as EntityRefInputRunInput<TInput, TInputRefs>)
    : ({
        ...input,
        refs,
      } as EntityRefInputRunInput<TInput, TInputRefs>);
};
