/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // pg is a server-only dependency; keep it external to the server bundle.
    serverComponentsExternalPackages: ["pg"],
  },
  // The keyless demo Ask reads the seed search index at runtime via fs; force
  // Next to include it in the serverless function bundle on Vercel (BUG-1).
  outputFileTracingIncludes: {
    "/api/ask": ["./lib/demo/data/search-index.json"],
  },
};

export default nextConfig;
