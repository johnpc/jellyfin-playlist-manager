/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["node-id3", "musicbrainz-api"],
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
};

module.exports = nextConfig;
