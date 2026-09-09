import type { NextConfig } from 'next';
const basePath = process.env.GITHUB_PAGES === 'true' ? '/Roguelite' : '';

const nextConfig: NextConfig = {
  output: 'export',
  // With output: 'export', a custom distDir changes the export destination.
  // Keep the default .next build cache so the static site is written to out/.
  ...(process.env.GITHUB_PAGES === 'true'
    ? {
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
