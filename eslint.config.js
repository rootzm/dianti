/**
 * ESLint configuration for Meta Horizon Studio TypeScript projects
 * This is the recommended configuration for linting Horizon TypeScript code
 *
 * Summary:
 * 1. Download the MHS Linter: https://fburl.com/4kk2ilwq
 * 2. Install the package: npm install --save-dev /path/to/mhs-linter-x.x.x.tgz
 * 3. Install required dependencies: npm install --save-dev eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint-plugin-tsdoc
 * 4. Uncomment the lines below to enable MHS Linter
 */

// Uncomment this line after installing and enabling mhsLinter
const mhsLinter = require('eslint-plugin-mhs-linter');

const typescriptEslint = require('@typescript-eslint/eslint-plugin');
const typescriptParser = require('@typescript-eslint/parser');
const tsdocPlugin = require('eslint-plugin-tsdoc');

module.exports = [
  // Uncomment this line after installing and enabling mhsLinter
  ...mhsLinter.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      '@typescript-eslint': typescriptEslint,
      'tsdoc': tsdocPlugin,
    },
    rules: {
      ...typescriptEslint.configs.recommended.rules,
      ...typescriptEslint.configs['recommended-requiring-type-checking'].rules,

      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn', {
          'argsIgnorePattern': '^_',
          'varsIgnorePattern': '^_',
          'caughtErrorsIgnorePattern': '^_',
          'destructuredArrayIgnorePattern': '^_'
        }
      ],

      'tsdoc/syntax': 'warn',
    },
  },
];
