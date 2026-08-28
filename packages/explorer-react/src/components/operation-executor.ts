'use client';

import type {
  OperationInvocationResult,
  OperationValidationIssue,
} from '@ontahi/core/runtime/contracts';
import {
  useReflectedOperationExecutionAffordance,
  useReflectedOperationRunner,
  useReflectedOperationSupport,
} from '@ontahi/react/graph';
import { useEffect, useMemo, useState } from 'react';

import type {
  ExplorerOperationDescriptor,
  ExplorerOperationInputRefDescriptor,
  ExplorerSchemaDescriptor,
} from '../contracts/index.js';

export const isExplorerOperationExecutable = (operation: ExplorerOperationDescriptor) =>
  operation.kind === 'graph'
    ? operation.exposure === 'browser-direct'
    : operation.exposure === 'bridge';

export const isExplorerOperationPotentiallyDestructive = (operation: ExplorerOperationDescriptor) =>
  /(delete|remove|reset)/i.test(operation.name);

const topLevelSchemaFields = (schema: ExplorerSchemaDescriptor) => {
  const fields = schema.fields.filter(field => !field.path.includes('.'));
  return fields.length > 0 ? fields : schema.fields;
};

const buildPlaceholderForType = (type: string, required: boolean): unknown => {
  if (!required) {
    return null;
  }

  const normalizedType = type.toLowerCase();

  if (normalizedType.includes('boolean')) {
    return false;
  }

  if (normalizedType.includes('number')) {
    return 0;
  }

  if (normalizedType.includes('array')) {
    return [];
  }

  if (normalizedType.includes('object') || normalizedType.includes('json')) {
    return {};
  }

  return '';
};

const buildSelectionDraft = (field: ExplorerSchemaDescriptor['fields'][number]) =>
  field.selection
    ? {
        kind: 'selection',
        entityName: field.selection.entityName,
        expression: { kind: 'none' },
      }
    : buildPlaceholderForType(field.type, field.required);

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type ExplorerInputDraftSource =
  | ExplorerSchemaDescriptor
  | Pick<ExplorerOperationDescriptor, 'inputSchema' | 'inputRefs'>;

const isOperationDraftSource = (
  source: ExplorerInputDraftSource,
): source is Pick<ExplorerOperationDescriptor, 'inputSchema' | 'inputRefs'> =>
  'inputSchema' in source;

const getSchemaFieldPaths = (schema: ExplorerSchemaDescriptor) =>
  new Set(topLevelSchemaFields(schema).map(field => field.path));

const scoreLocatorForSchema = (
  locator: ExplorerOperationInputRefDescriptor['locators'][number],
  schemaFieldPaths: Set<string>,
) => locator.fields.filter(field => !field.includes('.') && schemaFieldPaths.has(field)).length;

const getPreferredEntityRefLocator = (
  inputRef: ExplorerOperationInputRefDescriptor,
  schema?: ExplorerSchemaDescriptor,
) => {
  if (!schema) {
    return inputRef.locators[0];
  }

  const schemaFieldPaths = getSchemaFieldPaths(schema);
  const ranked = inputRef.locators
    .map((locator, index) => ({
      index,
      locator,
      score: scoreLocatorForSchema(locator, schemaFieldPaths),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const best = ranked[0];

  return best && best.score > 0 ? best.locator : inputRef.locators[0];
};

const buildEntityRefDraftValue = (
  inputRef: ExplorerOperationInputRefDescriptor,
  schema?: ExplorerSchemaDescriptor,
) => {
  const locator = getPreferredEntityRefLocator(inputRef, schema);
  const sourceFields = locator?.sourceFields ?? [];

  if (!locator || sourceFields.length === 0) {
    return undefined;
  }

  return {
    kind: 'entity-ref',
    entityName: inputRef.entityName,
    locator: Object.fromEntries(sourceFields.map(field => [field, ''])),
  };
};

const getRefCoveredInputFields = (inputRefs: ExplorerOperationInputRefDescriptor[] = []) =>
  new Set(
    inputRefs.flatMap(inputRef =>
      inputRef.locators.flatMap(locator => locator.fields.filter(field => !field.includes('.'))),
    ),
  );

export const getExplorerOperationScalarInputFields = (
  operation: Pick<ExplorerOperationDescriptor, 'inputSchema' | 'inputRefs'>,
) => {
  const inputRefs = operation.inputRefs ?? [];
  const refCoveredInputFields = getRefCoveredInputFields(inputRefs);
  const refInputPaths = new Set(inputRefs.map(inputRef => inputRef.path));

  return topLevelSchemaFields(operation.inputSchema).filter(
    field => !refCoveredInputFields.has(field.path) && !refInputPaths.has(field.path),
  );
};

type ExplorerEntityRefDraft = {
  kind: 'entity-ref';
  entityName: string;
  locator: Record<string, unknown>;
};

type ExplorerCompactRefExpression = {
  kind: 'explorer-ref-expression';
  locatorName?: string;
  locator: Record<string, unknown>;
};

const isExplorerCompactRefExpression = (value: unknown): value is ExplorerCompactRefExpression =>
  isObjectRecord(value) &&
  value.kind === 'explorer-ref-expression' &&
  isObjectRecord(value.locator);

const isCanonicalEntityRefDraft = (
  value: unknown,
  inputRef: ExplorerOperationInputRefDescriptor,
): value is ExplorerEntityRefDraft =>
  isObjectRecord(value) &&
  value.kind === 'entity-ref' &&
  value.entityName === inputRef.entityName &&
  isObjectRecord(value.locator);

const readEntityRefDraft = (
  input: unknown,
  inputRef: ExplorerOperationInputRefDescriptor,
): ExplorerEntityRefDraft | undefined => {
  if (!isObjectRecord(input)) {
    return undefined;
  }

  const value = input[inputRef.path];

  if (!isCanonicalEntityRefDraft(value, inputRef)) {
    return undefined;
  }

  return value;
};

export const getExplorerEntityRefInputLocator = (
  input: unknown,
  inputRef: ExplorerOperationInputRefDescriptor,
) => {
  const ref = readEntityRefDraft(input, inputRef);

  return (
    inputRef.locators.find(
      locator =>
        ref &&
        locator.sourceFields.length > 0 &&
        locator.sourceFields.every(field => field in ref.locator),
    ) ??
    inputRef.locators[0] ??
    null
  );
};

export const getExplorerEntityRefInputFieldValue = (
  input: unknown,
  inputRef: ExplorerOperationInputRefDescriptor,
  sourceField: string,
) => {
  const ref = readEntityRefDraft(input, inputRef);
  const value = ref?.locator[sourceField];

  return value == null ? '' : String(value);
};

export const updateExplorerEntityRefInputDraft = ({
  input,
  inputRef,
  locatorName,
  sourceField,
  value,
  locatorValues,
}: {
  input: unknown;
  inputRef: ExplorerOperationInputRefDescriptor;
  locatorName: string;
  sourceField: string;
  value: string;
  locatorValues?: Record<string, unknown>;
}) => {
  const locator =
    inputRef.locators.find(candidate => candidate.name === locatorName) ?? inputRef.locators[0];

  if (!locator) {
    return input;
  }

  const currentInput = isObjectRecord(input) ? input : {};
  const currentRef = readEntityRefDraft(currentInput, inputRef);
  const currentLocator = isObjectRecord(currentRef?.locator) ? currentRef.locator : {};
  const nextInput = { ...currentInput };

  for (const coveredField of inputRef.locators.flatMap(candidate => candidate.fields)) {
    if (!coveredField.includes('.') && coveredField !== inputRef.path) {
      delete nextInput[coveredField];
    }
  }

  nextInput[inputRef.path] = {
    kind: 'entity-ref',
    entityName: inputRef.entityName,
    locator: Object.fromEntries(
      locator.sourceFields.map(field => [
        field,
        locatorValues && field in locatorValues
          ? locatorValues[field]
          : field === sourceField
            ? value
            : (currentLocator[field] ?? ''),
      ]),
    ),
  };

  return nextInput;
};

export const getExplorerInputFieldDraftValue = (input: unknown, path: string) =>
  isObjectRecord(input) ? input[path] : undefined;

export const updateExplorerInputFieldDraft = ({
  input,
  path,
  value,
}: {
  input: unknown;
  path: string;
  value: unknown;
}) => ({
  ...(isObjectRecord(input) ? input : {}),
  [path]: value,
});

const readExplorerInputPathValue = (input: unknown, path: string): unknown => {
  if (path.includes('[]')) {
    return undefined;
  }

  return path.split('.').reduce<unknown>((value, segment) => {
    if (!isObjectRecord(value)) {
      return undefined;
    }

    return value[segment];
  }, input);
};

const schemaFieldAllowsNull = (type: string) =>
  type
    .split('|')
    .map(part => part.trim().toLowerCase())
    .includes('null');

const isMissingRequiredValue = (value: unknown, type: string) =>
  value === undefined ||
  (value === null && !schemaFieldAllowsNull(type)) ||
  (typeof value === 'string' && value.trim() === '');

export const validateExplorerOperationInput = (
  operation: Pick<ExplorerOperationDescriptor, 'inputSchema' | 'inputRefs'>,
  input: unknown,
): OperationValidationIssue[] => {
  const issues: OperationValidationIssue[] = [];
  const issuePaths = new Set<string>();
  const addRequiredIssue = (path: string) => {
    if (issuePaths.has(path)) {
      return;
    }

    issuePaths.add(path);
    issues.push({
      path,
      code: 'required',
      message: `${path} is required.`,
    });
  };
  const inputRefs = operation.inputRefs ?? [];
  const refCoveredInputFields = getRefCoveredInputFields(inputRefs);
  const refInputPaths = new Set(inputRefs.map(inputRef => inputRef.path));

  for (const inputRef of inputRefs) {
    if (inputRef.optional) {
      continue;
    }

    const ref = readEntityRefDraft(input, inputRef);
    const locator = getExplorerEntityRefInputLocator(input, inputRef);

    if (!ref || !locator) {
      addRequiredIssue(inputRef.path);
      continue;
    }

    const hasMissingLocatorValue = locator.sourceFields.some(sourceField => {
      const schemaField = operation.inputSchema.fields.find(field => field.path === sourceField);
      return isMissingRequiredValue(ref.locator[sourceField], schemaField?.type ?? 'unknown');
    });

    if (hasMissingLocatorValue) {
      addRequiredIssue(inputRef.path);
    }
  }

  for (const field of operation.inputSchema.fields) {
    const topLevelPath = field.path.split('.')[0];

    if (
      !field.required ||
      field.path.includes('[]') ||
      refInputPaths.has(topLevelPath) ||
      refCoveredInputFields.has(topLevelPath)
    ) {
      continue;
    }

    if (isMissingRequiredValue(readExplorerInputPathValue(input, field.path), field.type)) {
      addRequiredIssue(field.path);
    }
  }

  return issues;
};

export const buildExplorerOperationInputDraft = (source: ExplorerInputDraftSource) => {
  const schema = isOperationDraftSource(source) ? source.inputSchema : source;
  const inputRefs = isOperationDraftSource(source) ? (source.inputRefs ?? []) : [];
  const refDraftEntries = inputRefs.flatMap(inputRef => {
    const refDraftValue = buildEntityRefDraftValue(inputRef, schema);

    return refDraftValue ? [[inputRef.path, refDraftValue] as const] : [];
  });
  const fields = isOperationDraftSource(source)
    ? getExplorerOperationScalarInputFields(source)
    : topLevelSchemaFields(schema);

  if (fields.length === 0 && refDraftEntries.length === 0) {
    return {};
  }

  return Object.fromEntries([
    ...refDraftEntries,
    ...fields.map(field => [field.path, buildSelectionDraft(field)]),
  ]);
};

const isIdentifierKey = (value: string) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value);

const formatExpressionKey = (key: string) => (isIdentifierKey(key) ? key : JSON.stringify(key));

const indent = (level: number) => '  '.repeat(level);

const orderLocatorValues = (
  locator: ExplorerOperationInputRefDescriptor['locators'][number] | null,
  locatorValue: Record<string, unknown>,
) => {
  if (!locator) {
    return locatorValue;
  }

  return {
    ...Object.fromEntries(
      locator.sourceFields
        .filter(field => field in locatorValue)
        .map(field => [field, locatorValue[field]]),
    ),
    ...locatorValue,
  };
};

const formatExplorerInputExpressionValue = (
  value: unknown,
  level = 0,
  inputRef?: ExplorerOperationInputRefDescriptor,
): string => {
  if (inputRef && isCanonicalEntityRefDraft(value, inputRef)) {
    const locator = getExplorerEntityRefInputLocator({ [inputRef.path]: value }, inputRef);
    const matchingLocators = inputRef.locators.filter(candidate =>
      candidate.sourceFields.every(field => field in value.locator),
    );
    const needsExplicitLocator = matchingLocators.length !== 1;
    const locatorInput = formatExplorerInputExpressionValue(
      orderLocatorValues(locator, value.locator),
      level,
    );

    return needsExplicitLocator && locator
      ? `ref(${JSON.stringify(locator.name)}, ${locatorInput})`
      : `ref(${locatorInput})`;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }

    return `[\n${value
      .map(item => `${indent(level + 1)}${formatExplorerInputExpressionValue(item, level + 1)}`)
      .join(',\n')}\n${indent(level)}]`;
  }

  if (isObjectRecord(value)) {
    const entries = Object.entries(value);

    if (entries.length === 0) {
      return '{}';
    }

    return `{\n${entries
      .map(
        ([key, entryValue]) =>
          `${indent(level + 1)}${formatExpressionKey(key)}: ${formatExplorerInputExpressionValue(
            entryValue,
            level + 1,
          )}`,
      )
      .join(',\n')}\n${indent(level)}}`;
  }

  return JSON.stringify(value);
};

export const formatExplorerOperationInputValue = (
  operation: Pick<ExplorerOperationDescriptor, 'inputRefs'>,
  value: unknown,
) => {
  const inputRefs = operation.inputRefs ?? [];

  if (inputRefs.length === 0 || !isObjectRecord(value)) {
    return JSON.stringify(value, null, 2);
  }

  const entries = Object.entries(value);

  if (entries.length === 0) {
    return '{}';
  }

  return `{\n${entries
    .map(([key, entryValue]) => {
      const inputRef = inputRefs.find(candidate => candidate.path === key);

      return `${indent(1)}${formatExpressionKey(key)}: ${formatExplorerInputExpressionValue(
        entryValue,
        1,
        inputRef,
      )}`;
    })
    .join(',\n')}\n}`;
};

export const formatExplorerOperationInputDraft = (operation: ExplorerOperationDescriptor) =>
  formatExplorerOperationInputValue(operation, buildExplorerOperationInputDraft(operation));

class ExplorerInputExpressionParser {
  private index = 0;

  constructor(private readonly text: string) {}

  parse(): unknown {
    this.skipIgnored();

    const value = this.peek() === '{' ? this.parseObject() : this.parseObjectEntries();

    this.skipIgnored();

    if (!this.isAtEnd()) {
      throw this.error('Unexpected token.');
    }

    return value;
  }

  private parseObject(): Record<string, unknown> {
    this.expect('{');
    return this.parseObjectEntries('}');
  }

  private parseObjectEntries(terminator?: string): Record<string, unknown> {
    const entries: Record<string, unknown> = {};

    this.skipIgnored();

    if (terminator && this.peek() === terminator) {
      this.index += 1;
      return entries;
    }

    while (!this.isAtEnd()) {
      if (terminator && this.peek() === terminator) {
        this.index += 1;
        return entries;
      }

      const key = this.parseKey();
      this.skipIgnored();
      this.expect(':');
      entries[key] = this.parseValue();
      this.skipIgnored();

      if (this.peek() === ',') {
        this.index += 1;
        this.skipIgnored();
        continue;
      }

      if (terminator && this.peek() === terminator) {
        this.index += 1;
        return entries;
      }

      if (!terminator && this.isAtEnd()) {
        return entries;
      }

      throw this.error(terminator ? `Expected "," or "${terminator}".` : 'Expected ",".');
    }

    if (terminator) {
      throw this.error(`Expected "${terminator}".`);
    }

    return entries;
  }

  private parseKey(): string {
    this.skipIgnored();

    if (this.peek() === '"' || this.peek() === "'") {
      return this.parseString();
    }

    const identifier = this.readIdentifier();

    if (!identifier) {
      throw this.error('Expected object key.');
    }

    return identifier;
  }

  private parseValue(): unknown {
    this.skipIgnored();

    const current = this.peek();

    if (current === '{') {
      return this.parseObject();
    }

    if (current === '[') {
      return this.parseArray();
    }

    if (current === '"' || current === "'") {
      return this.parseString();
    }

    if (current === '-' || this.isDigit(current)) {
      return this.parseNumber();
    }

    const start = this.index;
    const identifier = this.readIdentifier();

    if (!identifier) {
      throw this.error('Expected value.');
    }

    this.skipIgnored();

    if (identifier === 'ref' && this.peek() === '(') {
      return this.parseRefCall();
    }

    if (identifier === 'true') {
      return true;
    }

    if (identifier === 'false') {
      return false;
    }

    if (identifier === 'null') {
      return null;
    }

    this.index = start;
    throw this.error(`Unknown identifier "${identifier}".`);
  }

  private parseRefCall(): ExplorerCompactRefExpression {
    this.expect('(');
    this.skipIgnored();

    let locatorName: string | undefined;
    let locator: unknown;

    if (this.peek() === '"' || this.peek() === "'") {
      const first = this.parseString();
      this.skipIgnored();

      if (this.peek() === ',') {
        this.index += 1;
        locatorName = first;
        locator = this.parseValue();
      } else {
        locator = first;
      }
    } else {
      locator = this.parseValue();
    }

    this.skipIgnored();
    this.expect(')');

    if (!isObjectRecord(locator)) {
      throw this.error('ref(...) expects a locator object.');
    }

    return {
      kind: 'explorer-ref-expression',
      ...(locatorName ? { locatorName } : {}),
      locator,
    };
  }

  private parseArray(): unknown[] {
    const values: unknown[] = [];

    this.expect('[');
    this.skipIgnored();

    if (this.peek() === ']') {
      this.index += 1;
      return values;
    }

    while (!this.isAtEnd()) {
      values.push(this.parseValue());
      this.skipIgnored();

      if (this.peek() === ',') {
        this.index += 1;
        this.skipIgnored();
        continue;
      }

      if (this.peek() === ']') {
        this.index += 1;
        return values;
      }

      throw this.error('Expected "," or "]".');
    }

    throw this.error('Expected "]".');
  }

  private parseString(): string {
    const quote = this.peek();
    let value = '';

    if (quote !== '"' && quote !== "'") {
      throw this.error('Expected string.');
    }

    this.index += 1;

    while (!this.isAtEnd()) {
      const character = this.text[this.index];
      this.index += 1;

      if (character === quote) {
        return value;
      }

      if (character === '\\') {
        if (this.isAtEnd()) {
          throw this.error('Unterminated escape sequence.');
        }

        const escaped = this.text[this.index];
        this.index += 1;

        value +=
          escaped === 'n'
            ? '\n'
            : escaped === 'r'
              ? '\r'
              : escaped === 't'
                ? '\t'
                : escaped === 'b'
                  ? '\b'
                  : escaped === 'f'
                    ? '\f'
                    : (escaped ?? '');
        continue;
      }

      value += character;
    }

    throw this.error('Unterminated string.');
  }

  private parseNumber(): number {
    const start = this.index;

    if (this.peek() === '-') {
      this.index += 1;
    }

    while (this.isDigit(this.peek())) {
      this.index += 1;
    }

    if (this.peek() === '.') {
      this.index += 1;

      while (this.isDigit(this.peek())) {
        this.index += 1;
      }
    }

    if (this.peek()?.toLowerCase() === 'e') {
      this.index += 1;

      if (this.peek() === '+' || this.peek() === '-') {
        this.index += 1;
      }

      while (this.isDigit(this.peek())) {
        this.index += 1;
      }
    }

    const parsed = Number(this.text.slice(start, this.index));

    if (Number.isNaN(parsed)) {
      throw this.error('Invalid number.');
    }

    return parsed;
  }

  private readIdentifier(): string | null {
    const start = this.index;
    const first = this.peek();

    if (!first || !/[A-Za-z_$]/.test(first)) {
      return null;
    }

    this.index += 1;

    while (/[A-Za-z0-9_$]/.test(this.peek() ?? '')) {
      this.index += 1;
    }

    return this.text.slice(start, this.index);
  }

  private skipIgnored() {
    while (!this.isAtEnd()) {
      const current = this.peek();
      const next = this.text[this.index + 1];

      if (/\s/.test(current ?? '')) {
        this.index += 1;
        continue;
      }

      if (current === '/' && next === '/') {
        this.index += 2;

        while (!this.isAtEnd() && this.peek() !== '\n') {
          this.index += 1;
        }

        continue;
      }

      if (current === '/' && next === '*') {
        this.index += 2;

        while (!this.isAtEnd() && !(this.peek() === '*' && this.text[this.index + 1] === '/')) {
          this.index += 1;
        }

        if (this.isAtEnd()) {
          throw this.error('Unterminated block comment.');
        }

        this.index += 2;
        continue;
      }

      return;
    }
  }

  private expect(character: string) {
    this.skipIgnored();

    if (this.peek() !== character) {
      throw this.error(`Expected "${character}".`);
    }

    this.index += 1;
  }

  private peek() {
    return this.text[this.index];
  }

  private isDigit(value: string | undefined) {
    return Boolean(value && /[0-9]/.test(value));
  }

  private isAtEnd() {
    return this.index >= this.text.length;
  }

  private error(message: string) {
    return new Error(`${message} at position ${this.index}.`);
  }
}

const compactJsonRefToExpression = (value: unknown): ExplorerCompactRefExpression | undefined => {
  if (!isObjectRecord(value) || !('$ref' in value)) {
    return undefined;
  }

  const refValue = value.$ref;

  if (isObjectRecord(refValue)) {
    return {
      kind: 'explorer-ref-expression',
      locator: refValue,
    };
  }

  if (typeof refValue === 'string' && isObjectRecord(value.locator)) {
    return {
      kind: 'explorer-ref-expression',
      locatorName: refValue,
      locator: value.locator,
    };
  }

  return undefined;
};

const resolveCompactRefLocator = (
  inputRef: ExplorerOperationInputRefDescriptor,
  expression: ExplorerCompactRefExpression,
) => {
  if (expression.locatorName) {
    const explicitLocator = inputRef.locators.find(
      locator => locator.name === expression.locatorName,
    );

    if (!explicitLocator) {
      throw new Error(`Unknown locator "${expression.locatorName}" for input "${inputRef.path}".`);
    }

    return explicitLocator;
  }

  const matches = inputRef.locators.filter(locator =>
    locator.sourceFields.every(field => field in expression.locator),
  );

  if (matches.length === 1) {
    return matches[0];
  }

  if (matches.length > 1) {
    throw new Error(
      `Ambiguous ref(...) for input "${inputRef.path}". Pass the locator name explicitly.`,
    );
  }

  throw new Error(`ref(...) fields do not match a locator for input "${inputRef.path}".`);
};

const lowerExplorerInputRefExpressions = (
  operation: Pick<ExplorerOperationDescriptor, 'inputRefs'>,
  value: unknown,
) => {
  if (!isObjectRecord(value)) {
    return value;
  }

  const nextValue = { ...value };

  for (const inputRef of operation.inputRefs ?? []) {
    const candidate = nextValue[inputRef.path];
    const expression = isExplorerCompactRefExpression(candidate)
      ? candidate
      : compactJsonRefToExpression(candidate);

    if (!expression) {
      continue;
    }

    const locator = resolveCompactRefLocator(inputRef, expression);

    nextValue[inputRef.path] = {
      kind: 'entity-ref',
      entityName: inputRef.entityName,
      locator: Object.fromEntries(
        locator.sourceFields.map(field => [field, expression.locator[field] ?? null]),
      ),
    };
  }

  return nextValue;
};

export const parseExplorerOperationInputText = (
  operation: Pick<ExplorerOperationDescriptor, 'inputRefs'>,
  inputText: string,
) => {
  try {
    return lowerExplorerInputRefExpressions(operation, JSON.parse(inputText) as unknown);
  } catch (jsonError) {
    try {
      return lowerExplorerInputRefExpressions(
        operation,
        new ExplorerInputExpressionParser(inputText).parse(),
      );
    } catch (expressionError) {
      const message =
        expressionError instanceof Error
          ? expressionError.message
          : jsonError instanceof Error
            ? jsonError.message
            : 'Input is not valid JSON or Explorer input expression.';

      throw new Error(message);
    }
  }
};

type ExplorerOperationExecutionState =
  | {
      status: 'idle';
    }
  | {
      status: 'running';
    }
  | {
      status: 'success';
      result: unknown;
      invocation?: OperationInvocationResult;
      runtimeResult?: unknown;
    }
  | {
      status: 'error';
      error: string;
      invocation?: OperationInvocationResult;
      runtimeResult?: unknown;
      permission?: unknown;
    };

type UseExplorerOperationExecutorOptions = {
  operation: ExplorerOperationDescriptor;
};

const getOperationInvocationErrorMessage = (invocation: { message?: string }) =>
  invocation.message ?? 'Operation execution failed.';

export function useExplorerOperationExecutor({ operation }: UseExplorerOperationExecutorOptions) {
  const reflectedOperation = useMemo(
    () => ({
      id: operation.id,
      kind: operation.kind,
      entityName: operation.entityName,
      name: operation.name,
      authority: operation.authority,
      exposure: operation.exposure,
      ...(operation.execution ? { execution: operation.execution } : {}),
      ...(operation.conditions ? { conditions: operation.conditions } : {}),
    }),
    [
      operation.authority,
      operation.entityName,
      operation.exposure,
      operation.id,
      operation.execution,
      operation.conditions,
      operation.kind,
      operation.name,
    ],
  );
  const runOperation = useReflectedOperationRunner(reflectedOperation);
  const supportsOperation = useReflectedOperationSupport();
  const executionAffordance = useReflectedOperationExecutionAffordance(reflectedOperation);
  const inputDraftText = useMemo(() => formatExplorerOperationInputDraft(operation), [operation]);
  const [inputJson, setInputJson] = useState(() => inputDraftText);
  const [confirmed, setConfirmed] = useState(false);
  const [state, setState] = useState<ExplorerOperationExecutionState>({ status: 'idle' });
  const executable = executionAffordance
    ? executionAffordance.status !== 'unavailable'
    : operation.execution?.atomicity !== 'required' &&
      isExplorerOperationExecutable(operation) &&
      supportsOperation(reflectedOperation);
  const destructive = isExplorerOperationPotentiallyDestructive(operation);
  const inputSyntax = (operation.inputRefs?.length ?? 0) > 0 ? 'expression' : 'json';

  useEffect(() => {
    setInputJson(inputDraftText);
    setConfirmed(false);
    setState({ status: 'idle' });
  }, [inputDraftText, operation.id]);

  const parsedInputPreview = useMemo(() => {
    try {
      return {
        ok: true as const,
        value: parseExplorerOperationInputText(operation, inputJson),
      };
    } catch (cause) {
      return {
        ok: false as const,
        error:
          cause instanceof Error
            ? cause.message
            : 'Input is not valid JSON or Explorer input expression.',
      };
    }
  }, [inputJson, operation]);
  const localValidationIssues = useMemo(
    () =>
      parsedInputPreview.ok
        ? validateExplorerOperationInput(operation, parsedInputPreview.value)
        : [],
    [operation, parsedInputPreview],
  );
  const validationIssues =
    state.status === 'error' && state.invocation?.kind === 'input_invalid'
      ? state.invocation.issues
      : localValidationIssues;
  const canExecute =
    executable &&
    parsedInputPreview.ok &&
    localValidationIssues.length === 0 &&
    (!destructive || confirmed) &&
    state.status !== 'running';

  const execute = async () => {
    if (!executable || !parsedInputPreview.ok || !canExecute) {
      return;
    }

    setState({ status: 'running' });

    try {
      const invocation = await runOperation(parsedInputPreview.value);

      if (invocation.ok) {
        setState({
          status: 'success',
          result: invocation.value,
          invocation,
        });
        return;
      }

      setState({
        status: 'error',
        error: getOperationInvocationErrorMessage(invocation),
        invocation,
      });
    } catch (cause) {
      setState({
        status: 'error',
        error: cause instanceof Error ? cause.message : 'Operation execution failed.',
      });
    }
  };

  const updateInputJson = (value: string) => {
    setInputJson(value);
    setState({ status: 'idle' });
  };

  return {
    canExecute,
    confirmed,
    destructive,
    executable,
    executionAffordance,
    inputJson,
    inputSyntax,
    localValidationIssues,
    parsedInputPreview,
    state,
    validationIssues,
    execute,
    resetInput: () => {
      setInputJson(inputDraftText);
      setState({ status: 'idle' });
    },
    setConfirmed,
    setInputJson: updateInputJson,
    setInputValue: (value: unknown) =>
      updateInputJson(formatExplorerOperationInputValue(operation, value)),
  };
}
