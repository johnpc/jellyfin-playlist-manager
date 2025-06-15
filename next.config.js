/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["node-id3", "musicbrainz-api"],
  
  // Disable telemetry for faster builds
  telemetry: false,
  
  // Disable source maps in production builds for faster builds
  productionBrowserSourceMaps: false,
  
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "jellyfin.jpc.io",
      },
    ],
    // Disable image optimization for Docker
    unoptimized: true,
  },
  
  // Webpack optimizations
  webpack: (config, { dev, isServer }) => {
    if (!dev && !isServer) {
      // Optimize for production builds
      config.optimization = {
        ...config.optimization,
        // Enable more aggressive optimizations
        usedExports: true,
        sideEffects: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
