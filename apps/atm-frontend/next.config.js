/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow importing from the monorepo's workspace packages without extra
  // transpile config (Next 14 supports this out of the box via transpilePackages).
  transpilePackages: ['@atm/xfs-core'],
  experimental: {
    typedRoutes: false,
  },
};

module.exports = nextConfig;
