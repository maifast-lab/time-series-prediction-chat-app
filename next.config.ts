import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    qualities: [100, 75],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '200mb',
    },
    optimizePackageImports: ['react-markdown', 'date-fns', 'lucide-react'],
  },
};

export default nextConfig;
