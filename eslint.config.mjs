import nextConfig from "eslint-config-next";

const config = [
  {
    ignores: [".next/**", "node_modules/**", "public/**"],
  },
  ...nextConfig,
];

export default config;
