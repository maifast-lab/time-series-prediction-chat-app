import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '200mb',
    },
    optimizePackageImports: ['react-markdown', 'date-fns', 'lucide-react'],
  },
};

export default nextConfig;
