/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Consume the @rms/* workspace packages as first-party TypeScript source so
  // edits are picked up by Fast Refresh without a separate `yarn build`.
  //   - transpilePackages: run each package through Next's compiler.
  //   - conditionNames: prefer each package's `source` export condition
  //     (./src/index.ts) over the compiled `dist`. `'...'` keeps Next's default
  //     conditions as the fallback for everything else.
  transpilePackages: ['@rms/api-contract', '@rms/db', '@rms/shared', '@rms/permissions'],
  webpack: (config) => {
    config.resolve.conditionNames = ['source', '...'];
    return config;
  },
};

export default nextConfig;
