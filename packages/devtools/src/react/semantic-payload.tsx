import {
  formatSelectionExpression,
  graphReadSummary,
  isRecord,
  viewFields,
  type RecordValue,
} from './activity-model.js';
import { styles } from './devtools-styles.js';

const isEntityRefValue = (
  value: unknown,
): value is RecordValue & { readonly locator: RecordValue } =>
  isRecord(value) && value.kind === 'entity-ref' && isRecord(value.locator);

const formatLocatorValue = (value: unknown) => {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value === null) return 'null';
  return JSON.stringify(value) ?? String(value);
};

const formatEntityRef = (value: RecordValue & { readonly locator: RecordValue }) => {
  const locator = Object.entries(value.locator);
  if (locator.length === 1 && locator[0]?.[0] === 'id') {
    return formatLocatorValue(locator[0][1]);
  }
  return locator.map(([key, item]) => `${key}: ${formatLocatorValue(item)}`).join(' · ');
};

const formatLeaf = (value: unknown): string => {
  if (isEntityRefValue(value)) return formatEntityRef(value);
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `${value.length} items`;
  if (isRecord(value)) return `${Object.keys(value).length} fields`;
  return String(value ?? '—');
};

const ResultTable = ({ value }: { readonly value: readonly unknown[] }) => {
  const records = value.filter(isRecord);
  if (records.length !== value.length || records.length === 0) {
    return (
      <div style={styles.semanticCard}>
        <span style={styles.semanticLabel}>Result</span>
        <span style={styles.semanticValue}>{value.map(formatLeaf).join(', ') || 'Empty list'}</span>
      </div>
    );
  }
  const columns = [...new Set(records.flatMap(record => Object.keys(record)))].slice(0, 8);
  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            {columns.map(column => (
              <th key={column} style={{ ...styles.tableCell, color: '#7fa28f', textAlign: 'left' }}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.slice(0, 50).map((record, index) => (
            <tr key={index}>
              {columns.map(column => (
                <td key={column} style={styles.tableCell} title={formatLeaf(record[column])}>
                  {formatLeaf(record[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const DomainValue = ({ value }: { readonly value: unknown }) => {
  if (Array.isArray(value)) return <ResultTable value={value} />;
  if (!isRecord(value)) return <span style={styles.semanticValue}>{formatLeaf(value)}</span>;
  if (isEntityRefValue(value)) {
    return <span style={styles.semanticValue}>{formatEntityRef(value)}</span>;
  }
  if (value.kind === 'graph-read-result') return <DomainValue value={value.value} />;
  return (
    <div style={styles.semanticGrid}>
      {Object.entries(value).map(([key, item]) => (
        <div key={key} style={styles.semanticCard}>
          <span style={styles.semanticLabel}>{key}</span>
          {Array.isArray(item) || isRecord(item) ? (
            <DomainValue value={item} />
          ) : (
            <span style={styles.semanticValue}>{formatLeaf(item)}</span>
          )}
        </div>
      ))}
    </div>
  );
};

const DomainProjection = ({
  label,
  value,
  empty,
}: {
  readonly label: string;
  readonly value: unknown;
  readonly empty: string;
}) => (
  <div style={styles.semanticSection}>
    <span style={{ ...styles.semanticLabel, marginBottom: 0 }}>{label}</span>
    {value === undefined ? (
      <span style={styles.semanticValue}>{empty}</span>
    ) : (
      <DomainValue value={value} />
    )}
  </div>
);

const operationFailureValue = (result: RecordValue) =>
  Object.fromEntries(
    Object.entries(result).filter(([key]) => key !== 'ok' && key !== 'kind' && key !== 'executed'),
  );

const OperationPayloadVisual = ({ body }: { readonly body: RecordValue }) => {
  if (body.kind === 'invoke' || body.kind === 'check-permission') {
    return <DomainProjection label='Input' value={body.input} empty='No input.' />;
  }
  if (body.kind === 'invocation-result' && isRecord(body.result)) {
    return body.result.ok === true ? (
      <DomainProjection
        label='Returned value'
        value={body.result.value}
        empty='No value returned.'
      />
    ) : (
      <DomainProjection
        label='Failure'
        value={operationFailureValue(body.result)}
        empty='Failed.'
      />
    );
  }
  if (body.kind === 'permission-result') {
    return <DomainProjection label='Permission' value={body.result} empty='No result.' />;
  }
  if (body.kind === 'protocol-error') {
    return <DomainProjection label='Protocol error' value={body.error} empty='Unknown error.' />;
  }
  return <DomainValue value={body} />;
};

const GraphReadVisual = ({ body }: { readonly body: RecordValue }) => {
  const selection = isRecord(body.selection) ? body.selection : undefined;
  const view = isRecord(body.view) ? body.view : undefined;
  const fields = viewFields(view);
  return (
    <>
      <p style={styles.semanticHeadline}>{graphReadSummary(body)}</p>
      <div style={styles.semanticGrid}>
        <div style={styles.semanticCard}>
          <span style={styles.semanticLabel}>Selection</span>
          <span style={styles.semanticValue}>
            {String(selection?.entityName ?? 'Unknown')}
            {' · '}
            {formatSelectionExpression(selection?.expression)}
          </span>
        </div>
        {Array.isArray(body.orderBy) ? (
          <div style={styles.semanticCard}>
            <span style={styles.semanticLabel}>Order</span>
            <span style={styles.semanticValue}>
              {body.orderBy
                .map(order =>
                  isRecord(order) ? `${String(order.fieldName)} ${String(order.direction)}` : '',
                )
                .filter(Boolean)
                .join(', ')}
            </span>
          </div>
        ) : null}
        {view ? (
          <div style={styles.semanticCard}>
            <span style={styles.semanticLabel}>
              View {typeof view.name === 'string' ? `· ${view.name}` : ''}
            </span>
            <span style={styles.chips}>
              {fields.map(field => (
                <span key={field} style={styles.chip}>
                  {field}
                </span>
              ))}
            </span>
          </div>
        ) : null}
      </div>
    </>
  );
};

export const SemanticPayload = ({ value }: { readonly value: unknown }) => {
  if (!isRecord(value)) return <DomainValue value={value} />;
  if (value.kind === 'graph-read') return <GraphReadVisual body={value} />;
  if (
    value.kind === 'invoke' ||
    value.kind === 'check-permission' ||
    value.kind === 'invocation-result' ||
    value.kind === 'permission-result' ||
    value.kind === 'protocol-error'
  ) {
    return <OperationPayloadVisual body={value} />;
  }
  return <DomainValue value={value} />;
};
