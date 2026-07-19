/** @type {import('next').NextConfig} */
const nextConfig = {
  // /chief was the app's route until 2026-07-19. Anyone who bookmarked it —
  // including the Mayor — should land on the app, not a 404.
  async redirects() {
    return [{ source: "/chief", destination: "/hub", permanent: false }];
  },

  reactStrictMode: true,
  // Release stamp (RD 2026-07-05): expose the deploying commit to the client
  // so the UI shows exactly which release Vercel is serving.
  env: {
    NEXT_PUBLIC_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? "",
    NEXT_PUBLIC_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF ?? "",
  },
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
