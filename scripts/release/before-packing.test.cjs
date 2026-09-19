const assert = require('node:assert/strict');
const { test } = require('node:test');

const { hooks } = require('../../.pnpmfile.cjs');

test('dependency resolution order does not change the published manifest bytes', () => {
  for (const field of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    const entries = [
      ['@ontahi/language', '1.0.0-alpha.12'],
      ['@ontahi/language-codemirror', '1.0.0-alpha.12'],
      ['react', '^18.3.0 || ^19.0.0'],
    ];
    const first = { name: '@ontahi/devtools', [field]: Object.fromEntries(entries) };
    const second = {
      name: '@ontahi/devtools',
      [field]: Object.fromEntries([...entries].reverse()),
    };
    assert.equal(
      JSON.stringify(hooks.beforePacking(first)),
      JSON.stringify(hooks.beforePacking(second)),
      field,
    );
    assert.deepEqual(hooks.beforePacking(first), first);
  }
});

test('preserves order-sensitive exports, arrays, absent fields and the source manifest', () => {
  const manifest = {
    name: '@ontahi/example',
    exports: { '.': { types: './index.d.ts', import: './index.js', default: './fallback.js' } },
    files: ['dist', 'LICENSE'],
    dependencies: { z: '^1.0.0', a: '^2.0.0' },
    peerDependenciesMeta: { react: { optional: true } },
  };
  const original = JSON.stringify(manifest);
  const packed = hooks.beforePacking(manifest);
  assert.equal(JSON.stringify(packed.exports), JSON.stringify(manifest.exports));
  assert.deepEqual(packed, manifest);
  assert.equal(JSON.stringify(manifest), original);
  assert.equal(Object.hasOwn(packed, 'optionalDependencies'), false);
  assert.deepEqual(hooks.beforePacking({ name: 'empty' }), { name: 'empty' });
});
