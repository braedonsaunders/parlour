import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  transpilePackages: ['@parlour/engine', '@parlour/game-blitz', '@parlour/game-wildpile'],
  images: { unoptimized: true },
  // Static export can't emit dynamic routes; the share URL /join/CODE is served
  // by the /join page (prod: vercel.json rewrite; dev: this rewrite).
  async rewrites() {
    return [{ source: '/join/:code', destination: '/join' }];
  },
};

export default nextConfig;
