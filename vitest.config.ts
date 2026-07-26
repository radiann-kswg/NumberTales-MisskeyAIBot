import { defineConfig } from 'vitest/config';

/**
 * テストは tsc でコンパイル済みの dist/ を対象に実行する。
 *
 * ソースは NodeNext の `.js` 拡張子付き import（例: `import x from './foo.js'` で実体は
 * `foo.ts`）を用いており、Vite/Vitest の `.js`→`.ts` 解決と相性が悪い。ビルド済み JS を
 * import して検証することでこの摩擦を避ける（`npm test` が build → vitest run の順で実行）。
 * dist が古いと結果がズレるため、単発実行は `npm test`（build 込み）を使うこと。
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
