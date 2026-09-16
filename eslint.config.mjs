import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default [
  ...nextVitals, ...nextTypescript,
  // React Compiler is not enabled; retain the existing external-store and form hydration effects.
  { rules: { "react-hooks/set-state-in-effect": "off", "react-hooks/preserve-manual-memoization": "off" } },
  { ignores: [".next/**", "output/**", "app/page 2.tsx", "app/page 3.tsx", "lib/mock-data 2.ts"] },
];
