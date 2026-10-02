import type { NextConfig } from 'next';
const config: NextConfig = {
  output: 'standalone',
  // Development-only pages are not registered as routes in production builds.
  pageExtensions:
    process.env.NODE_ENV === 'development'
      ? ['dev.tsx', 'tsx', 'ts', 'jsx', 'js']
      : ['tsx', 'ts', 'jsx', 'js'],
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
};
export default config;
