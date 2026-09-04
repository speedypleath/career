import coreWebVitals from "eslint-config-next/core-web-vitals"
import typescript from "eslint-config-next/typescript"

const config = [
  ...coreWebVitals,
  ...typescript,
  {
    // scripts/ and the Deno worker are excluded from the Next tsconfig and run
    // standalone, so they are not linted with the app's rules.
    ignores: [
      ".next/**",
      "node_modules/**",
      "scripts/**",
      "supabase/functions/email-classifier-worker/**",
    ],
  },
]

export default config
