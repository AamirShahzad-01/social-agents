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
      // Check if it's a Render internal hostname (no dots, not localhost)
      if (!pythonBackendUrl.includes('.') && !pythonBackendUrl.includes('localhost') && !pythonBackendUrl.includes('127.0.0.1')) {
        // It's a Render service name, add .onrender.com and use https
        pythonBackendUrl = `https://${pythonBackendUrl}.onrender.com`;
      } else if (pythonBackendUrl.includes('localhost') || pythonBackendUrl.includes('127.0.0.1')) {
        pythonBackendUrl = `http://${pythonBackendUrl}`;
      } else {
        pythonBackendUrl = `https://${pythonBackendUrl}`;
      }
    }

    return [
      // Primary proxy path
      {
        source: '/py-api/:path*',
        destination: `${pythonBackendUrl}/api/v1/:path*`,
      },
      // OAuth Authentication routes (critical for platform connections)
      {
        source: '/api/auth/:path*',
        destination: `${pythonBackendUrl}/api/v1/auth/:path*`,
      },
      // NOTE: /api/credentials/* handled by Next.js API route at src/app/api/credentials/
      // which adds proper server-side authentication before forwarding to Python backend

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
      // Meta Ads API routes
      {
        source: '/api/meta-ads/:path*',
        destination: `${pythonBackendUrl}/api/v1/meta-ads/:path*`,
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
      // AI Media Generation routes (frontend uses /api/ai/media/*)
      {
        source: '/api/ai/media/imagen/:path*',
        destination: `${pythonBackendUrl}/api/v1/media/imagen/:path*`,
      },
      {
        source: '/api/ai/media/imagen',
        destination: `${pythonBackendUrl}/api/v1/media/imagen`,
      },
      {
        source: '/api/ai/media/image/:path*',
        destination: `${pythonBackendUrl}/api/v1/media/image/:path*`,
      },
      {
        source: '/api/ai/media/audio/:path*',
        destination: `${pythonBackendUrl}/api/v1/media/audio/:path*`,
      },
      {
        source: '/api/ai/media/video/:path*',
        destination: `${pythonBackendUrl}/api/v1/media/video/:path*`,
      },
      // Veo routes (veo uses same video backend)
      {
        source: '/api/ai/media/veo/:path*',
        destination: `${pythonBackendUrl}/api/v1/media/video/:path*`,
      },
      {
        source: '/api/ai/media/veo',
        destination: `${pythonBackendUrl}/api/v1/media/video/generate`,
      },
      // Sora routes (OpenAI Video Generation)
      {
        source: '/api/ai/media/sora/:path*',
        destination: `${pythonBackendUrl}/api/v1/media/sora/:path*`,
      },
      {
        source: '/api/ai/media/sora',
        destination: `${pythonBackendUrl}/api/v1/media/sora/generate`,
      },
      // Prompt improvement routes (maps to /improve/prompt)
      {
        source: '/api/ai/media/prompt/improve',
        destination: `${pythonBackendUrl}/api/v1/improve/prompt`,
      },
      // ===========================================
      // Social Platform API Routes (Publishing)
      // ===========================================
      // Twitter/X API routes
      {
        source: '/api/twitter/:path*',
        destination: `${pythonBackendUrl}/api/v1/social/twitter/:path*`,
      },
      // Instagram API routes
      {
        source: '/api/instagram/:path*',
        destination: `${pythonBackendUrl}/api/v1/social/instagram/:path*`,
      },
      // Facebook API routes
      {
        source: '/api/facebook/:path*',
        destination: `${pythonBackendUrl}/api/v1/social/facebook/:path*`,
      },
      // LinkedIn API routes
      {
        source: '/api/linkedin/:path*',
        destination: `${pythonBackendUrl}/api/v1/social/linkedin/:path*`,
      },
      // TikTok API routes
      {
        source: '/api/tiktok/:path*',
        destination: `${pythonBackendUrl}/api/v1/social/tiktok/:path*`,
      },
      // YouTube API routes
      {
        source: '/api/youtube/:path*',
        destination: `${pythonBackendUrl}/api/v1/social/youtube/:path*`,
      },
    ];
  },
};

export default nextConfig;
