/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // pg is a server-only dependency; keep it external to the server bundle.
    serverComponentsExternalPackages: ["pg"],
  },
};

export default nextConfig;
