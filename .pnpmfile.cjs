// pnpm resolves workspace dependency versions concurrently. Stabilize only unordered
// dependency maps: conditional exports and other ordered metadata must stay untouched.
const beforePacking = manifest => {
  const packed = { ...manifest };
  for (const field of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    if (manifest[field]) {
      packed[field] = Object.fromEntries(
        Object.keys(manifest[field])
          .sort()
          .map(name => [name, manifest[field][name]]),
      );
    }
  }
  return packed;
};

module.exports = { hooks: { beforePacking } };
