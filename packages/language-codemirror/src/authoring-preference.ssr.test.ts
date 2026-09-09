// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { authoringDialectPreference as preference } from './authoring-preference.js';

it('is inert on the server and does not retain a user preference across requests', () => {
  const notify = vi.fn();
  const unsubscribe = preference.subscribe(notify);
  preference.set('declarative');
  expect(preference.getSnapshot()).toBeUndefined();
  expect(preference.getServerSnapshot()).toBeUndefined();
  expect(notify).not.toHaveBeenCalled();
  unsubscribe();
});
