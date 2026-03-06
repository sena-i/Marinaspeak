/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@ffmpeg/ffmpeg', '@ffmpeg/core'],
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb'
    }
  }
};

module.exports = nextConfig;
