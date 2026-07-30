/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Inlined into the client bundle under its own name (rather than renaming
  // to NEXT_PUBLIC_MAPBOX_TOKEN) so it matches the MAPBOX_TOKEN env var
  // already configured in deployment environments.
  env: {
    MAPBOX_TOKEN: process.env.MAPBOX_TOKEN,
  },
};

module.exports = nextConfig;
