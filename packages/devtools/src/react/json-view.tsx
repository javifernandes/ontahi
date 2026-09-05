import { useState, type ReactNode } from 'react';

import { styles } from './devtools-styles.js';

const jsonTokens = (value: unknown): ReactNode[] => {
  const json = JSON.stringify(value, null, 2) ?? 'undefined';
  const pattern =
    /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"\s*:|"(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b|\btrue\b|\bfalse\b|\bnull\b)/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of json.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push(json.slice(cursor, index));
    const token = match[0];
    const isKey = token.startsWith('"') && token.trimEnd().endsWith(':');
    const color = isKey
      ? '#79b99a'
      : token.startsWith('"')
        ? '#d6bd82'
        : token === 'true' || token === 'false'
          ? '#88afe0'
          : token === 'null'
            ? '#87938d'
            : '#d58ba3';
    nodes.push(
      <span key={`${index}-${token.length}`} style={{ color }}>
        {token}
      </span>,
    );
    cursor = index + token.length;
  }
  if (cursor < json.length) nodes.push(json.slice(cursor));
  return nodes;
};

export const JsonView = ({ value, label }: { readonly value: unknown; readonly label: string }) => {
  const [copied, setCopied] = useState(false);
  const serialized = JSON.stringify(value, null, 2) ?? 'undefined';
  const copy = async () => {
    await globalThis.navigator?.clipboard?.writeText(serialized);
    setCopied(true);
  };
  return (
    <>
      <button type='button' style={styles.copyButton} onClick={copy} aria-label={`Copy ${label}`}>
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre style={styles.pre}>{jsonTokens(value)}</pre>
    </>
  );
};
