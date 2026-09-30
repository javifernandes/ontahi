import { useState } from 'react';
import { JsonView as JsonTree } from 'react-json-view-lite';

import { styles } from './devtools-styles.js';

const treeStyles = {
  container: 'ontahi-json-view',
  childFieldsContainer: 'ontahi-json-children',
  basicChildStyle: 'ontahi-json-child',
  collapseIcon: 'ontahi-json-toggle ontahi-json-collapse',
  expandIcon: 'ontahi-json-toggle ontahi-json-expand',
  collapsedContent: 'ontahi-json-collapsed',
  label: 'ontahi-json-label',
  clickableLabel: 'ontahi-json-label ontahi-json-clickable-label',
  nullValue: 'ontahi-json-null',
  undefinedValue: 'ontahi-json-null',
  numberValue: 'ontahi-json-number',
  stringValue: 'ontahi-json-string',
  booleanValue: 'ontahi-json-boolean',
  otherValue: 'ontahi-json-value',
  punctuation: 'ontahi-json-punctuation',
  quotesForFieldNames: true,
  ariaLables: {
    collapseJson: 'Collapse JSON node',
    expandJson: 'Expand JSON node',
  },
} as const;

export const jsonViewCss = `
.ontahi-json-view {
  color: #bcd4c7;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  padding-left: 18px;
}
.ontahi-json-children { margin: 0; padding: 0 0 0 16px; list-style: none; }
.ontahi-json-child { margin: 0; padding: 0; }
.ontahi-json-toggle {
  display: inline-grid;
  width: 16px;
  height: 16px;
  margin: 0 2px 0 -18px;
  padding: 0;
  place-items: center;
  border: 0;
  color: #6f9581;
  background: transparent;
  cursor: pointer;
  font: inherit;
  vertical-align: -1px;
}
.ontahi-json-toggle:hover { color: #b9d6c7; background: #15251d; border-radius: 4px; }
.ontahi-json-toggle:focus-visible { outline: 1px solid #67c995; outline-offset: 1px; border-radius: 4px; }
.ontahi-json-collapse::after { content: '▾'; }
.ontahi-json-expand::after { content: '▸'; }
.ontahi-json-collapsed { margin-left: 4px; color: #60796c; }
.ontahi-json-collapsed::after { content: '…'; }
.ontahi-json-label { margin-right: 5px; color: #79b99a; font-weight: 650; }
.ontahi-json-clickable-label { cursor: pointer; }
.ontahi-json-string { color: #d6bd82; }
.ontahi-json-number { color: #d58ba3; }
.ontahi-json-boolean { color: #88afe0; }
.ontahi-json-null { color: #87938d; }
.ontahi-json-value, .ontahi-json-punctuation { color: #bcd4c7; }
`;

const isTreeValue = (value: unknown): value is object =>
  value !== null && typeof value === 'object';
const expandAllNodes = () => true;

const primitiveColor = (value: unknown) => {
  if (value === null || value === undefined) return '#87938d';
  if (typeof value === 'string') return '#d6bd82';
  if (typeof value === 'boolean') return '#88afe0';
  if (typeof value === 'number') return '#d58ba3';
  return '#bcd4c7';
};

export const JsonView = ({ value, label }: { readonly value: unknown; readonly label: string }) => {
  const [copied, setCopied] = useState(false);
  const serialized = JSON.stringify(value, null, 2) ?? 'undefined';
  const copy = async () => {
    try {
      const clipboard = globalThis.navigator?.clipboard;
      if (!clipboard) return;
      await clipboard.writeText(serialized);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <>
      <button type='button' style={styles.copyButton} onClick={copy} aria-label={`Copy ${label}`}>
        {copied ? 'Copied' : 'Copy'}
      </button>
      {isTreeValue(value) ? (
        <JsonTree
          data={value}
          style={treeStyles}
          shouldExpandNode={expandAllNodes}
          clickToExpandNode
          aria-label={label}
        />
      ) : (
        <pre style={{ ...styles.pre, color: primitiveColor(value) }}>{serialized}</pre>
      )}
    </>
  );
};
