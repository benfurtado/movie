import type { NextConfig } from "next";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof process !== 'undefined' ? 'http://localhost:3001' : 'http://localhost:3001');

const nextConfig: NextConfig = {
  transpilePackages: ['mpegts.js'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_BASE}/api/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: `${API_BASE}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
