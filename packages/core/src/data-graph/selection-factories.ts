import { cloneJson, type JsonValue } from '../value/json.js';
import { hasOwn, isRecord } from '../value/object.js';

import type {
  AnyEntityDefinition,
  AnyFieldDefinition,
  FieldDefinitions,
  GraphObjectDefinition,
  InferGraphSchemaValue,
} from './definitions.js';
import type { SelectionProperties } from './entity-selections.js';
import { getEntityIdentityLocator, createEntityRef } from './ref/index.js';
import {
  toGraphSchemaDescriptor,
  type GraphSchemaDescriptor,
  type GraphSelectionDescriptor,
} from './schema-descriptor.js';
import { parseGraphSchema } from './schema.js';
import { type SelectionExpression, selectionReferences } from './selection-ast.js';
import { Selection } from './selection-value.js';

/** Pure substitution data, not an executable callback or a new runtime Selection node. */
export type SelectionFactoryTemplate<TFieldName extends string = string> =
  | {
      readonly kind: 'predicate';
      readonly fieldName: TFieldName;
      readonly operator: 'eq' | 'lt' | 'lte' | 'gt' | 'gte';
      readonly input: string;
    }
  | { readonly kind: 'identity'; readonly bindings: Readonly<Record<string, string>> };

export type SelectionFactoryDeclaration<TFieldName extends string = string> = {
  readonly version: number;
  readonly input: GraphObjectDefinition<FieldDefinitions>;
  readonly scalarInput?: string;
  readonly template: SelectionFactoryTemplate<TFieldName>;
};

type FactoryInput<T extends SelectionFactoryDeclaration> = InferGraphSchemaValue<T['input']>;
type FactoryArgument<T extends SelectionFactoryDeclaration> =
  | FactoryInput<T>
  | (T extends { scalarInput: infer TKey extends keyof FactoryInput<T> }
      ? FactoryInput<T>[TKey]
      : never);

export type SelectionFactoryArguments<T extends Record<string, SelectionFactoryDeclaration>> = {
  [TName in keyof T]: { [K in TName]: FactoryArgument<T[TName]> } & {
    [K in Exclude<keyof T, TName>]?: never;
  };
}[keyof T];

export type SelectionFactoryDescriptor = {
  readonly version: number;
  readonly input: GraphSchemaDescriptor;
  /** Membership only. Cardinality is imposed by a consumer, not this factory. */
  readonly output: Pick<GraphSelectionDescriptor, 'kind' | 'entityName'>;
  readonly scalarInput?: string;
  readonly template: SelectionFactoryTemplate;
};

export const reflectSelectionFactories = (
  entity: object,
): Readonly<Record<string, SelectionFactoryDescriptor>> | undefined =>
  'selectionFactories' in entity
    ? (cloneJson(entity.selectionFactories) as Readonly<Record<string, SelectionFactoryDescriptor>>)
    : undefined;

export type SelectionFactoryInvocation = {
  readonly entityName: string;
  readonly name: string;
  readonly version: number;
  readonly input: Readonly<Record<string, JsonValue>>;
};

const describeFactoryInput = (input: SelectionFactoryDeclaration['input']) => {
  const descriptor = toGraphSchemaDescriptor(input);
  if (descriptor.kind !== 'object')
    throw new TypeError('Selection factory input must be an object.');
  return { ...descriptor, unknownKeys: 'strict' as const };
};

const validateDeclaration = (
  entity: AnyEntityDefinition,
  name: string,
  factory: SelectionFactoryDeclaration,
) => {
  if (!name.trim() || !Number.isSafeInteger(factory.version) || factory.version < 1)
    throw new TypeError('Selection factory needs a name and a positive integer version.');
  if (factory.input.kind !== 'schema.object')
    throw new TypeError(`Selection factory ${name} needs an object input schema.`);
  const fields = factory.input.fields;
  const names = Object.keys(fields);
  if (
    !names.length ||
    Object.values(fields).some(
      field =>
        field.kind !== 'field' ||
        !['id', 'string', 'number', 'boolean', 'enum'].includes(field.fieldType) ||
        field.optional ||
        field.derived,
    )
  )
    throw new TypeError(
      `Selection factory ${name} currently supports required scalar inputs only.`,
    );
  if (factory.scalarInput !== undefined && (names.length !== 1 || names[0] !== factory.scalarInput))
    throw new TypeError(`Selection factory ${name} shorthand must name its sole input.`);
  const template = factory.template;
  if (template.kind === 'predicate') {
    if (!hasOwn(entity.fields, template.fieldName))
      throw new TypeError(`Unknown Selection factory field ${entity.name}.${template.fieldName}.`);
    if (!['eq', 'lt', 'lte', 'gt', 'gte'].includes(template.operator))
      throw new TypeError(`Unsupported Selection factory operator in ${name}.`);
    if (names.length !== 1 || names[0] !== template.input)
      throw new TypeError(`Selection factory ${name} must bind its declared input.`);
    return;
  }
  if (template.kind !== 'identity')
    throw new TypeError(`Unsupported Selection factory template in ${name}.`);
  const identity = getEntityIdentityLocator(entity)?.locator.fields;
  const boundFields = Object.keys(template.bindings);
  if (
    !identity?.length ||
    boundFields.length !== identity.length ||
    identity.some(field => !hasOwn(template.bindings, field))
  )
    throw new TypeError(
      `Selection factory ${name} must bind exactly the canonical ${entity.name} identity.`,
    );
  const inputs = Object.values(template.bindings);
  if (inputs.some(input => !hasOwn(fields, input)) || names.some(input => !inputs.includes(input)))
    throw new TypeError(`Selection factory ${name} has missing or unknown input bindings.`);
};

const bindTemplate = (
  entity: Pick<AnyEntityDefinition, 'name'>,
  template: SelectionFactoryTemplate,
  input: Record<string, JsonValue>,
): SelectionExpression => {
  if (template.kind === 'predicate')
    return {
      kind: 'predicate',
      fieldName: template.fieldName,
      operator: template.operator,
      value: input[template.input],
    };
  const ref = createEntityRef(
    entity,
    Object.fromEntries(
      Object.entries(template.bindings).map(([field, parameter]) => [field, input[parameter]]),
    ),
  );
  return selectionReferences([ref]);
};

/** Expand portable authoring data; the eventual receiver still validates membership and policy. */
export const expandSelectionFactory = (
  descriptor: SelectionFactoryDescriptor,
  argument: unknown,
) => {
  if (descriptor.input.kind !== 'object' || descriptor.output.kind !== 'selection')
    throw new TypeError('Expected a Selection factory object input and Selection output.');
  const fields = Object.fromEntries(
    Object.entries(descriptor.input.fields).map(([name, input]) => {
      const scalar = input.kind === 'nullable' ? input.item : input;
      if (
        scalar.kind !== 'scalar' ||
        !['id', 'string', 'number', 'boolean', 'enum'].includes(scalar.type)
      )
        throw new TypeError(`Unsupported Selection factory input ${name}.`);
      const { kind: _kind, type, ...metadata } = scalar;
      return [
        name,
        {
          ...metadata,
          kind: 'field',
          fieldType: type,
          ...(input.kind === 'nullable' ? { nullable: true } : {}),
        } as AnyFieldDefinition,
      ];
    }),
  );
  const supplied = cloneJson(argument);
  const normalized =
    isRecord(supplied) || descriptor.scalarInput === undefined
      ? supplied
      : { [descriptor.scalarInput]: supplied };
  const input = cloneJson(
    parseGraphSchema({ kind: 'schema.object', fields, unknownKeys: 'strict' }, normalized),
  ) as Record<string, JsonValue>;
  return {
    input,
    expression: bindTemplate({ name: descriptor.output.entityName }, descriptor.template, input),
  };
};

/** Adds an experimental data-first by surface without replacing Entity identity or legacy locators. */
export const withSelectionFactories = <
  TEntity extends AnyEntityDefinition,
  const TFactories extends Record<
    string,
    SelectionFactoryDeclaration<keyof TEntity['fields'] & string>
  >,
>(
  entity: TEntity,
  declarations: TFactories,
) => {
  if ('by' in entity || 'selectionFactories' in entity)
    throw new TypeError(`Selection factories are already defined on ${entity.name}.`);
  if (hasOwn(entity.refLocators, 'by'))
    throw new TypeError(
      `Legacy locator by on ${entity.name} conflicts with Selection factory authoring.`,
    );
  // Own the declaration data: caller edits and reflection consumers cannot mutate the compiler.
  const factories: Record<string, SelectionFactoryDeclaration> = cloneJson(declarations);
  for (const [name, factory] of Object.entries(factories))
    validateDeclaration(entity, name, factory);
  const descriptors = Object.fromEntries(
    Object.entries(factories).map(([name, factory]) => [
      name,
      {
        version: factory.version,
        input: describeFactoryInput(factory.input),
        output: { kind: 'selection', entityName: entity.name },
        ...(factory.scalarInput === undefined ? {} : { scalarInput: factory.scalarInput }),
        template: factory.template,
      },
    ]),
  ) as { readonly [K in keyof TFactories]: SelectionFactoryDescriptor };

  const by = (invocation: SelectionFactoryArguments<TFactories>) => {
    const supplied = cloneJson(invocation);
    if (!isRecord(supplied) || Object.keys(supplied).length !== 1)
      throw new TypeError('Choose exactly one named Selection factory.');
    const name = Object.keys(supplied)[0]!;
    if (!hasOwn(factories, name))
      throw new TypeError(`Unknown Selection factory ${entity.name}.${name}.`);
    const factory = factories[name]!;
    validateDeclaration(entity, name, factory);
    const { input, expression } = expandSelectionFactory(descriptors[name]!, supplied[name]);
    // Validate the output against the Entity as well as the declared input schema.
    parseGraphSchema(
      { kind: 'schema.selection', entity, cardinality: 'many' },
      {
        kind: 'selection',
        entityName: entity.name,
        expression,
      },
    );
    const selected = new Selection<TEntity, undefined>(entity, cloneJson(expression), name);
    const factoryInvocation: SelectionFactoryInvocation = {
      entityName: entity.name,
      name,
      version: factory.version,
      input,
    };
    return Object.defineProperty(selected, 'factoryInvocation', {
      get: () => cloneJson(factoryInvocation),
    }) as Selection<TEntity, undefined> &
      SelectionProperties<TEntity> & {
        readonly factoryInvocation: SelectionFactoryInvocation;
      };
  };
  // Authoring capabilities are not definition data copied by runtime entity binding.
  return Object.defineProperties(entity, {
    by: { value: by },
    selectionFactories: { get: () => cloneJson(descriptors) },
  }) as TEntity & { readonly by: typeof by; readonly selectionFactories: typeof descriptors };
};
