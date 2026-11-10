// @ts-check

const isCi = process.env.CI !== undefined;

if (!isCi) {
  const { default: husky } = await import('husky');
  husky();
}
