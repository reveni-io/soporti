import js from '@eslint/js'
import globals from 'globals'

export default [
  { ignores: ['data'] },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      globals: globals.node,
      sourceType: 'module',
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-console': 'off',
    },
  },
]
