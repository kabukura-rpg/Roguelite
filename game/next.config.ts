import type { NextConfig } from 'next';
const basePath = process.env.GITHUB_PAGES === 'true' ? '/Roguelite' : '';

const nextConfig: NextConfig = {
  output: 'export',
  // Keep Next.js generated types separate from the local vinext cache.
  ...(process.env.GITHUB_PAGES === 'true'
    ? {
        distDir: '.next-pages',
        typescript: { tsconfigPath: 'tsconfig.pages.json' },
      }
    : {}),
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  // Public files do not receive basePath automatically.
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};
export default nextConfig;
