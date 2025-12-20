/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  turbopack: {
    root: process.cwd(),
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', 'react-hot-toast'],
    serverActions: {
      bodySizeLimit: '500mb',
    },
  },

  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },

  env: {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  },

  // Proxy API requests to Python backend
  // Proxy API requests to Python backend
  async rewrites() {
    let pythonBackendUrl = process.env.NEXT_PUBLIC_PYTHON_BACKEND_URL || 'http://localhost:8000';

    // Ensure URL has a protocol
    if (!pythonBackendUrl.startsWith('http://') && !pythonBackendUrl.startsWith('https://')) {
      pythonBackendUrl = `http://${pythonBackendUrl}`;
    }

    return [
      {
        source: '/py-api/:path*',
        destination: `${pythonBackendUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
