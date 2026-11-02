import js from '@eslint/js'
import globals from 'globals'
import sonarjs from 'eslint-plugin-sonarjs'

export default [
  { ignores: ['data'] },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      globals: globals.node,
      sourceType: 'module',
    },
    plugins: { sonarjs },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-console': 'off',
      'max-depth': ['error', 3],
      'max-params': ['error', 4],
      'sonarjs/cognitive-complexity': ['error', 15],
    },
  },
  {
    files: ['src/video/kit/**/*.js'],
    ignores: ['src/video/kit/**/*.test.js'],
    languageOptions: {
      globals: globals.browser,
      sourceType: 'script',
    },
  },
]
