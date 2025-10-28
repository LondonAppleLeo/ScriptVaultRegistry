/** @type {import('next').NextConfig} */
const isCI = process.env.GITHUB_ACTIONS === 'true';
const repoName = 'ScriptVaultRegistry';

const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  images: { unoptimized: true },
  // Ensure correct paths when hosted under https://<user>.github.io/ScriptVaultRegistry
  basePath: isCI ? `/${repoName}` : '',
  assetPrefix: isCI ? `/${repoName}/` : '',
  env: {
    NEXT_PUBLIC_BASE_PATH: isCI ? `/${repoName}` : '',
  },
};

module.exports = nextConfig;



