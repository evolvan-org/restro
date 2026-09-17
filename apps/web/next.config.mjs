/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship compiled CommonJS `dist` and are consumed as normal
  // dependencies (NOT in transpilePackages). Keep webpack from resolving the
  // yarn workspace symlink to its real path under packages/ — otherwise Next
  // treats the compiled dist as first-party source, applies the Fast Refresh
  // transform, and injects `import.meta` into CommonJS (which fails to parse).
  webpack: (config) => {
    config.resolve.symlinks = false;
    return config;
  },
};

export default nextConfig;
