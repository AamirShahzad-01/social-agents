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
  async rewrites() {
    let pythonBackendUrl = process.env.NEXT_PUBLIC_PYTHON_BACKEND_URL || 'http://localhost:8000';

    // Ensure URL has a protocol
    if (!pythonBackendUrl.startsWith('http://') && !pythonBackendUrl.startsWith('https://')) {
      pythonBackendUrl = `http://${pythonBackendUrl}`;
    }

    return [
      // Primary proxy path
      {
        source: '/py-api/:path*',
        destination: `${pythonBackendUrl}/api/v1/:path*`,
      },
      // Media Studio API routes
      {
        source: '/api/media-studio/:path*',
        destination: `${pythonBackendUrl}/api/v1/media-studio/:path*`,
      },
      // Cloudinary API routes
      {
        source: '/api/cloudinary/:path*',
        destination: `${pythonBackendUrl}/api/v1/cloudinary/:path*`,
      },
      // Storage API routes
      {
        source: '/api/storage/:path*',
        destination: `${pythonBackendUrl}/api/v1/storage/:path*`,
      },
      // Canva API routes
      {
        source: '/api/canva/:path*',
        destination: `${pythonBackendUrl}/api/v1/canva/:path*`,
      },
      // Posts API routes (base path)
      {
        source: '/api/posts',
        destination: `${pythonBackendUrl}/api/v1/posts`,
      },
      // Posts API routes (with path segments)
      {
        source: '/api/posts/:path*',
        destination: `${pythonBackendUrl}/api/v1/posts/:path*`,
      },
      // Media Generation API routes
      {
        source: '/api/media/:path*',
        destination: `${pythonBackendUrl}/api/v1/media/:path*`,
      },
    ];
  },
};

export default nextConfig;
