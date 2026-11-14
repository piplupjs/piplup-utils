import { createOxfmtConfig } from '@piplup/code-infra/oxfmt';
import { config } from '@piplup/code-infra/prettier';

export default {
  ...createOxfmtConfig({
    ...config,
    overrides: [
      ...config.overrides,
      { files: ['*.md', '*.mdx'], options: { printWidth: 80, proseWrap: 'always' } },
    ],
  }),
  // Written by the release script.
  ignorePatterns: ['package-lock.json', 'CHANGELOG.md'],
};
