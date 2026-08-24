import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  allowedDevOrigins: ['127.0.0.1'],
  transpilePackages: ['@parlour/engine', '@parlour/game-blitz', '@parlour/game-wildpile'],
  images: { unoptimized: true },
};

export default nextConfig;
