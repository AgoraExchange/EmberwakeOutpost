import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts', '*.ts'],
    languageOptions: { globals: { document: 'readonly', window: 'readonly', navigator: 'readonly', indexedDB: 'readonly', localStorage: 'readonly', requestAnimationFrame: 'readonly', performance: 'readonly', crypto: 'readonly' } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['scripts/**/*.mjs'],
    // `window` appears only inside page.evaluate callbacks, which execute in the browser.
    languageOptions: { globals: { Buffer: 'readonly', console: 'readonly', process: 'readonly', navigator: 'readonly', window: 'readonly' } }
  }
);
