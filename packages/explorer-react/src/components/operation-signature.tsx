import { ArrowRight } from 'lucide-react';

import type {
  ExplorerOperationDescriptor,
  ExplorerOperationInputRefDescriptor,
  ExplorerSchemaField,
} from '../contracts/index.js';
import { cx } from '../internal/cx.js';

type OperationParameter = {
  name: string;
  type: string;
};

const lowerFirst = (value: string) => (value ? `${value[0]?.toLowerCase()}${value.slice(1)}` : '');

const topLevelSchemaFields = (fields: ExplorerSchemaField[]) => {
  const topLevelFields = fields.filter(field => !field.path.includes('.'));

  return topLevelFields.length > 0 ? topLevelFields : fields;
};

const getRefCoveredInputFields = (inputRefs: ExplorerOperationInputRefDescriptor[] = []) =>
  new Set(
    inputRefs.flatMap(inputRef =>
      inputRef.locators.flatMap(locator => locator.fields.filter(field => !field.includes('.'))),
    ),
  );

const getBooleanInputLabels = (field: ExplorerSchemaField) => ({
  true: field.presentation?.booleanLabels?.true ?? 'yes',
  false: field.presentation?.booleanLabels?.false ?? 'no',
});

const humanizeScalarType = (field: ExplorerSchemaField) => {
  if (field.selection) {
    return `${field.selection.entityName} selection (${field.selection.cardinality})`;
  }

  if (field.valueType) {
    return field.valueType;
  }

  const normalizedType = field.type.toLowerCase();

  if (normalizedType.includes('string')) {
    return 'text';
  }

  if (normalizedType.includes('boolean')) {
    const labels = getBooleanInputLabels(field);

    return `${labels.true.toLowerCase()}/${labels.false.toLowerCase()}`;
  }

  if (normalizedType.includes('number')) {
    return 'number';
  }

  if (normalizedType.includes('array')) {
    return 'list';
  }

  if (normalizedType.includes('object') || normalizedType.includes('json')) {
    return 'object';
  }

  return field.type;
};

const maybeEntityParameter = (
  operation: ExplorerOperationDescriptor,
  field: ExplorerSchemaField,
): OperationParameter | null => {
  const entityName = operation.entityName;
  const parameterName = lowerFirst(entityName);
  const fieldPattern = new RegExp(`^${parameterName}(Id|Slug|Token|Uuid|Key)$`);

  if (fieldPattern.test(field.path)) {
    return {
      name: parameterName,
      type: entityName,
    };
  }

  return null;
};

const getOperationParameters = (operation: ExplorerOperationDescriptor): OperationParameter[] => {
  const inputRefs = operation.inputRefs ?? [];
  const refParameters = inputRefs.map(inputRef => ({
    name: inputRef.path,
    type:
      inputRef.resolution === 'existing' ? `Existing<${inputRef.entityName}>` : inputRef.entityName,
  }));
  const refCoveredInputFields = getRefCoveredInputFields(inputRefs);
  const refInputPaths = new Set(inputRefs.map(inputRef => inputRef.path));
  const scalarParameters = topLevelSchemaFields(operation.inputSchema.fields)
    .filter(field => !refCoveredInputFields.has(field.path) && !refInputPaths.has(field.path))
    .map(
      field =>
        maybeEntityParameter(operation, field) ?? {
          name: field.path,
          type: humanizeScalarType(field),
        },
    );

  return [...refParameters, ...scalarParameters];
};

export const ExplorerOperationSignature = ({
  operation,
  className,
  variant = 'inline',
  maxInlineParameters = 3,
}: {
  operation: ExplorerOperationDescriptor;
  className?: string;
  variant?: 'inline' | 'stacked';
  maxInlineParameters?: number;
}) => {
  const parameters = getOperationParameters(operation);
  const visibleInlineParameters = parameters.slice(0, maxInlineParameters);
  const hiddenInlineParameterCount = parameters.length - visibleInlineParameters.length;

  if (variant === 'stacked') {
    return (
      <div className={cx('grid min-w-0 gap-1.5', className)}>
        <span className='truncate font-mono text-xs text-muted-foreground'>{operation.id}</span>
        {parameters.length > 0 ? (
          <ul className='grid gap-1'>
            {parameters.map((parameter, index) => (
              <li
                key={`${parameter.name}:${parameter.type}`}
                className='grid grid-cols-[0.875rem_minmax(0,1fr)_auto] items-baseline gap-2 rounded-md bg-muted/45 px-2 py-1 text-xs'
              >
                {index === 0 ? (
                  <ArrowRight className='mt-0.5 size-3 text-primary' aria-hidden='true' />
                ) : (
                  <span className='size-3' aria-hidden='true' />
                )}
                <span className='truncate font-medium text-foreground/80'>{parameter.name}</span>
                <span className='shrink-0 text-muted-foreground'>{parameter.type}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  return (
    <span className={cx('inline-flex min-w-0 max-w-full items-center gap-1.5', className)}>
      <span className='truncate font-mono text-xs text-muted-foreground'>{operation.id}</span>
      {parameters.length > 0 ? (
        <span className='inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground'>
          <span>(</span>
          {visibleInlineParameters.map((parameter, index) => (
            <span
              key={`${parameter.name}:${parameter.type}`}
              className='inline-flex items-center gap-1'
            >
              {index > 0 ? <span className='text-muted-foreground/60'>,</span> : null}
              <span className='inline-flex items-baseline gap-1 whitespace-nowrap rounded-full bg-muted/55 px-1.5 py-0.5'>
                <span className='font-medium text-foreground/80'>{parameter.name}</span>
                <span className='text-muted-foreground'>{parameter.type}</span>
              </span>
            </span>
          ))}
          {hiddenInlineParameterCount > 0 ? (
            <span className='rounded-full bg-muted px-1.5 py-0.5 font-medium text-muted-foreground'>
              [+{hiddenInlineParameterCount}]
            </span>
          ) : null}
          <span>)</span>
        </span>
      ) : null}
    </span>
  );
};
