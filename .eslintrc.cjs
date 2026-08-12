const importRules = {
  'import/no-duplicates': 'error',
  'import/no-useless-path-segments': 'warn',
  'import/order': [
    'warn',
    {
      'newlines-between': 'always',
      alphabetize: {
        order: 'asc',
        caseInsensitive: true,
      },
    },
  ],
};

module.exports = {
  root: true,
  ignorePatterns: ['**/node_modules/**', '**/dist/**', '**/coverage/**', 'apps/www/.next/**'],
  overrides: [
    {
      files: ['packages/**/*.{ts,tsx}', 'examples/**/*.{ts,tsx,mts,mjs}'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: {
          jsx: true,
        },
        sourceType: 'module',
      },
      plugins: ['@typescript-eslint', 'import', 'unused-imports', 'unicorn'],
      rules: {
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        'unused-imports/no-unused-imports': 'error',
        'unused-imports/no-unused-vars': 'off',
        'unicorn/prefer-global-this': 'error',
        ...importRules,
      },
    },
  ],
};
