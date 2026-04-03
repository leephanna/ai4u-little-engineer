import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  // Only run files in __tests__ directories or files ending in .test.ts(x)
  testMatch: ["**/__tests__/**/*.test.ts", "**/*.test.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  // Ignore Next.js internals and node_modules
  testPathIgnorePatterns: ["/node_modules/", "/.next/"],
  // Transform only our source files
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "./tsconfig.json" }],
  },
  // Suppress noisy logs during tests
  silent: false,
  verbose: true,
};

export default config;
