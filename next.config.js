/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["node-id3", "musicbrainz-api"],

  // Disable source maps in production builds for faster builds
  productionBrowserSourceMaps: false,
  env: {
    JELLYFIN_SERVER_URL: process.env.JELLYFIN_SERVER_URL,
    JELLYFIN_ADMIN_USER: process.env.JELLYFIN_ADMIN_USER,
    JELLYFIN_ADMIN_PASSWORD: process.env.JELLYFIN_ADMIN_PASSWORD,
    DOWNLOAD_CONCURRENCY: process.env.DOWNLOAD_CONCURRENCY,
    COOKIES_PATH: process.env.COOKIES_PATH,
    YT_DLP_PATH: process.env.YT_DLP_PATH,
    MUSIC_DOWNLOAD_DIR: process.env.MUSIC_DOWNLOAD_DIR,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    AWS_SESSION_TOKEN: process.env.AWS_SESSION_TOKEN,
    AWS_REGION: process.env.AWS_REGION,
  },
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
