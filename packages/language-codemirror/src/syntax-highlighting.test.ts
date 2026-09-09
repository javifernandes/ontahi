import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';

import { syntaxPalettes } from './syntax-highlighting.js';

import { consoleExpressionExtensions } from './index.js';

const luminance = (hex: string) => {
  const channels = [1, 3, 5].map(offset => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
};

describe('authoring syntax contrast', () => {
  it.each([
    ['light', '#ffffff'],
    ['light', '#f6f8f5'],
    ['dark', '#09110d'],
    ['dark', '#102019'],
  ] as const)('keeps all %s token colors readable on %s', (scheme, background) => {
    for (const color of Object.values(syntaxPalettes[scheme])) {
      const values = [luminance(color), luminance(background)].sort((a, b) => a - b);
      expect((values[1]! + 0.05) / (values[0]! + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(['ts', 'declarative'] as const)('highlights where and many in %s', dialect => {
    const view = new EditorView({
      parent: document.body,
      state: EditorState.create({
        doc:
          dialect === 'ts'
            ? 'TodoItem.where(completed = false).many()'
            : 'TodoItem where completed = false many',
        extensions: consoleExpressionExtensions(
          {
            entities: [
              {
                name: 'TodoItem',
                fields: [{ name: 'completed', type: 'boolean', nullable: false }],
              },
            ],
          },
          { dialect, colorScheme: 'dark' },
        ),
      }),
    });
    try {
      const keywords = [...view.dom.querySelectorAll('.cm-ontahi-syntax-keyword')].map(
        node => node.textContent,
      );
      expect(keywords).toContain('where');
      expect(keywords).toContain('many');
      expect(view.state.facet(EditorView.darkTheme)).toBe(true);
    } finally {
      view.destroy();
    }
  });
});
