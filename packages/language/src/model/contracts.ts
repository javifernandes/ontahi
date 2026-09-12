import type {
  ContextualSelectionDescriptor,
  SelectionFactoryDescriptor,
  SelectionPredicate,
  SelectionAst,
  GraphReadRequest,
} from '@ontahi/core/data-graph';

export type ConsoleFactorySyntax = SelectionLanguageRange & {
  readonly conjunction?: SelectionLanguageRange;
  readonly by?: SelectionLanguageRange;
  readonly name?: SelectionLanguageRange & { readonly text: string; readonly value: string };
  readonly argument?: SelectionLanguageRange & { readonly text: string };
  readonly properties?: readonly (SelectionLanguageRange & {
    readonly name?: SelectionLanguageRange & { readonly text: string };
    readonly colon?: SelectionLanguageRange;
    readonly value?: SelectionLanguageRange;
  })[];
  readonly value?: unknown;
  readonly error?: string;
};

export type SelectionLanguageRange = {
  readonly from: number;
  readonly to: number;
};

export type SelectionLanguageDiagnostic = SelectionLanguageRange & {
  readonly channel: 'syntax' | 'semantic';
  readonly code:
    | 'selection.syntax.invalid'
    | 'selection.semantic.unknown-field'
    | 'selection.semantic.incompatible-field-type'
    | 'selection.semantic.unsupported-field-type'
    | 'selection.semantic.incompatible-operator'
    | 'selection.semantic.non-nullable-field'
    | 'selection.semantic.unknown-enum-value'
    | 'selection.semantic.non-finite-number'
    | 'selection.semantic.unsupported-reference-identity'
    | 'selection.semantic.unsupported-relation';
  readonly message: string;
};

export type SelectionLanguageFieldReflection = {
  readonly name: string;
  readonly type: string;
  readonly nullable: boolean;
  readonly valueType?: string;
  readonly enumValues?: readonly string[];
  readonly reference?: {
    readonly entityName: string;
    readonly identity?: { readonly name: string; readonly fields: readonly string[] };
  };
  readonly documentation?: string;
};

export type SelectionLanguageEntityReflection<TEntityName extends string = string> = {
  readonly name: TEntityName;
  readonly selectionFactories?: Readonly<Record<string, SelectionFactoryDescriptor>>;
  readonly contextualSelections?: Readonly<Record<string, ContextualSelectionDescriptor>>;
  readonly fields: readonly SelectionLanguageFieldReflection[];
  readonly relations?: readonly { readonly name: string }[];
};

export type SelectionLanguageToken<TKind extends string> = SelectionLanguageRange & {
  readonly kind: TKind;
  readonly text: string;
};

export type SelectionBooleanLiteralSyntax = SelectionLanguageToken<'boolean-literal'> & {
  readonly value: boolean;
};

export type SelectionStringLiteralSyntax = SelectionLanguageToken<'string-literal'> & {
  readonly value?: string;
};

export type SelectionNumberLiteralSyntax = SelectionLanguageToken<'number-literal'> & {
  readonly value: number;
};

export type SelectionScalarLiteralSyntax =
  | SelectionBooleanLiteralSyntax
  | SelectionStringLiteralSyntax
  | SelectionNumberLiteralSyntax;

export type SelectionListLiteralSyntax = SelectionLanguageRange & {
  readonly kind: 'list-literal';
  readonly open?: SelectionLanguageToken<'open-bracket'>;
  readonly values: readonly SelectionScalarLiteralSyntax[];
  readonly commas: readonly SelectionLanguageToken<'comma'>[];
  readonly close?: SelectionLanguageToken<'close-bracket'>;
};

export type SelectionLanguagePredicateOperator = SelectionPredicate['operator'];

export type SelectionPredicateOperatorSyntax = SelectionLanguageToken<'predicate-operator'> & {
  readonly operator: SelectionLanguagePredicateOperator;
};

export type SelectionPredicateSyntax = SelectionLanguageRange & {
  readonly kind: 'predicate';
  readonly field?: SelectionLanguageToken<'field-name'>;
  readonly operator?: SelectionPredicateOperatorSyntax;
  readonly value?: SelectionScalarLiteralSyntax | SelectionListLiteralSyntax;
};

export type SelectionConstantSyntax =
  | SelectionLanguageToken<'all'>
  | SelectionLanguageToken<'none'>;

export type SelectionNotSyntax = SelectionLanguageRange & {
  readonly kind: 'not';
  readonly operator: SelectionLanguageToken<'not'>;
  readonly operand?: SelectionExpressionSyntax;
};

export type SelectionLogicalSyntax = SelectionLanguageRange & {
  readonly kind: 'and' | 'or';
  readonly operands: readonly SelectionExpressionSyntax[];
  readonly operators: readonly SelectionLanguageToken<'and' | 'or'>[];
};

export type SelectionParenthesizedSyntax = SelectionLanguageRange & {
  readonly kind: 'parenthesized';
  readonly open?: SelectionLanguageToken<'open-parenthesis'>;
  readonly expression?: SelectionExpressionSyntax;
  readonly close?: SelectionLanguageToken<'close-parenthesis'>;
};

export type SelectionExpressionSyntax =
  | SelectionConstantSyntax
  | SelectionPredicateSyntax
  | SelectionNotSyntax
  | SelectionLogicalSyntax
  | SelectionParenthesizedSyntax;

export type SelectionDocumentSyntax = SelectionLanguageRange & {
  readonly kind: 'selection-document';
  readonly expression?: SelectionExpressionSyntax;
};

export type SelectionDocumentParseResult = {
  readonly syntax: SelectionDocumentSyntax;
  readonly syntaxDiagnostics: readonly SelectionLanguageDiagnostic[];
};

export type SelectionDocumentAnalysis<TEntityName extends string = string> =
  SelectionDocumentParseResult & {
    readonly semanticDiagnostics: readonly SelectionLanguageDiagnostic[];
    readonly selection?: SelectionAst<TEntityName>;
  };

export type SelectionLanguageCursorContext =
  | 'expression'
  | 'operator'
  | 'value'
  | 'list-value'
  | 'list-continuation'
  | 'continuation';

export type SelectionLanguageCompletionItem = {
  readonly label: string;
  readonly apply: string;
  readonly kind: 'field' | 'keyword' | 'operator' | 'value' | 'punctuation';
  readonly detail: string;
};

export type SelectionLanguageCompletionResult = SelectionLanguageRange & {
  readonly context: SelectionLanguageCursorContext;
  readonly items: readonly SelectionLanguageCompletionItem[];
};

export type SelectionLanguageCursorContextResult = SelectionLanguageRange & {
  readonly kind: SelectionLanguageCursorContext;
};

export type SelectionReferenceValueContext = SelectionLanguageRange & {
  readonly fieldName: string;
  readonly targetEntityName: string;
  readonly identityField: string;
  readonly value?: string;
};

export type SelectionLanguageExecutionAffordances = {
  readonly fields?: readonly {
    readonly name: string;
    readonly operators: readonly SelectionLanguagePredicateOperator[];
  }[];
};

export type SelectionLanguageSemanticClassification = SelectionLanguageRange & {
  readonly kind:
    | 'field'
    | 'unsupported-field'
    | 'unsupported-relation'
    | 'invalid-identifier'
    | 'operator'
    | 'value'
    | 'keyword';
};

export type SelectionLanguageHover = SelectionLanguageRange & {
  readonly title: string;
  readonly detail: string;
  readonly documentation: string;
};

export type ConsoleLanguageApplicationReflection = {
  readonly entities: readonly SelectionLanguageEntityReflection[];
};

export type ConsoleLanguageDiagnostic =
  | SelectionLanguageDiagnostic
  | (SelectionLanguageRange & {
      readonly channel: 'syntax' | 'semantic';
      readonly code:
        | 'console.syntax.invalid'
        | 'console.semantic.unknown-entity'
        | 'console.semantic.invalid-factory'
        | 'console.semantic.invalid-navigation'
        | 'console.semantic.invalid-limit'
        | 'console.semantic.unsupported-limit'
        | 'console.semantic.invalid-order-field'
        | 'console.semantic.invalid-order-direction'
        | 'console.semantic.unsupported-order';
      readonly message: string;
    });

export type ConsoleOrderBySyntax = SelectionLanguageRange & {
  readonly by?: SelectionLanguageToken<'by-keyword'>;
  readonly open?: SelectionLanguageToken<'open-parenthesis'>;
  readonly field?: SelectionLanguageToken<'field-name'>;
  readonly comma?: SelectionLanguageToken<'comma'>;
  readonly direction?: SelectionLanguageToken<'order-direction'>;
  readonly close?: SelectionLanguageToken<'close-parenthesis'>;
};

export type ConsoleFilterSyntax = SelectionLanguageRange & {
  readonly kind: 'filter';
  readonly where?: SelectionLanguageToken<'where-member'>;
  readonly whereOpen?: SelectionLanguageToken<'open-parenthesis'>;
  readonly selection?: SelectionExpressionSyntax;
  readonly whereClose?: SelectionLanguageToken<'close-parenthesis'>;
};

export type ConsoleMembershipStep =
  | (ConsoleFactorySyntax & { readonly kind: 'factory' })
  | (SelectionLanguageRange & {
      readonly kind: 'navigation';
      readonly name?: SelectionLanguageToken<'navigation-name'>;
    })
  | ConsoleFilterSyntax;

export type ConsoleGraphReadSyntax = SelectionLanguageRange & {
  readonly kind: 'graph-read';
  /** Authoring stages in source order, before final read shaping. */
  readonly steps: readonly ConsoleMembershipStep[];
  readonly factories: readonly ConsoleFactorySyntax[];
  readonly navigations: readonly (SelectionLanguageRange & {
    readonly name?: SelectionLanguageToken<'navigation-name'>;
  })[];
  readonly entity?: SelectionLanguageToken<'entity-name'>;
  /** Compatibility projection of the last filter, if it is the final membership stage. */
  readonly where?: SelectionLanguageToken<'where-member'>;
  readonly whereOpen?: SelectionLanguageToken<'open-parenthesis'>;
  readonly selection?: SelectionExpressionSyntax;
  readonly whereClose?: SelectionLanguageToken<'close-parenthesis'>;
  readonly orderBy?: ConsoleOrderBySyntax;
  readonly limit?: SelectionLanguageToken<'limit-member'>;
  readonly limitOpen?: SelectionLanguageToken<'open-parenthesis'>;
  readonly limitValue?: SelectionNumberLiteralSyntax;
  readonly limitClose?: SelectionLanguageToken<'close-parenthesis'>;
  readonly terminal?: SelectionLanguageToken<
    'first-member' | 'one-member' | 'many-member' | 'count-member' | 'exists-member'
  >;
  readonly terminalOpen?: SelectionLanguageToken<'open-parenthesis'>;
  readonly terminalClose?: SelectionLanguageToken<'close-parenthesis'>;
};

export type ConsoleDocumentSyntax = SelectionLanguageRange & {
  readonly kind: 'console-document';
  readonly expression?: ConsoleGraphReadSyntax;
};

export type ConsoleDocumentParseResult = {
  readonly syntax: ConsoleDocumentSyntax;
  readonly syntaxDiagnostics: readonly ConsoleLanguageDiagnostic[];
};

export type ConsoleDocumentAnalysis = ConsoleDocumentParseResult & {
  readonly semanticDiagnostics: readonly ConsoleLanguageDiagnostic[];
  readonly request?: GraphReadRequest;
};

export type ConsoleDialect = 'ts' | 'declarative';

export type ConsoleDocumentAnalysisOptions = {
  readonly limit?: number;
  readonly dialect?: ConsoleDialect;
};

export type ConsoleLanguageCompletionItem = {
  readonly label: string;
  readonly apply: string;
  readonly kind: SelectionLanguageCompletionItem['kind'] | 'entity' | 'member';
  readonly detail: string;
};

export type ConsoleLanguageCompletionResult = SelectionLanguageRange & {
  readonly items: readonly ConsoleLanguageCompletionItem[];
};

export type ConsoleLanguageCompletionOptions = {
  readonly dialect?: ConsoleDialect;
  /** Narrow ordering suggestions only. Omit for schema-only completion; return [] when unavailable. */
  readonly orderableFields?: (entityName: string) => readonly string[];
};
