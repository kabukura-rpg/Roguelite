import type { NextConfig } from 'next';
const basePath = process.env.GITHUB_PAGES === 'true' ? '/Roguelite' : '';

const nextConfig: NextConfig = {
  output: 'export',
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  // Public files do not receive basePath automatically.
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};
export default nextConfig;
