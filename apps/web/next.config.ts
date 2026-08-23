import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  transpilePackages: ['@parlour/engine', '@parlour/game-blitz', '@parlour/game-wildpile'],
  images: { unoptimized: true },
};

export default nextConfig;
