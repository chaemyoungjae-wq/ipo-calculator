import { defineConfig } from "vitest/config";

// 접근 규칙 시험. Firestore 에뮬레이터가 필요하다: npm run test:rules
export default defineConfig({
  test: { include: ["tests/rules.test.ts"], environment: "node", testTimeout: 20000 },
});
