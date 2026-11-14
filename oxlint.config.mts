import { combine, presets, rules } from '@piplup/code-infra/oxlint';

// The tests here are `*.spec.*` files run by Vitest, so they get the `test` preset's rules too.
const testPreset = {
  ...presets.test,
  overrides: presets.test.overrides?.map((override) => ({
    ...override,
    files: override.files.map((file) => file.replace('.test.', '.spec.')),
  })),
};

export default combine(presets.recommended, presets.spec, testPreset, {
  overrides: [
    {
      files: ['**/*.spec.*'],
      // Vitest runs without globals here, so Testing Library can't clean up after each test.
      rules: rules({ 'testing-library/no-manual-cleanup': 'off' }),
    },
    {
      // Node.js command-line scripts.
      files: ['scripts/**'],
      rules: rules({ 'compat/compat': 'off', 'no-console': 'off' }),
    },
  ],
});
