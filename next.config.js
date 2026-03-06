/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['ffmpeg-static'],
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb'
    },
    outputFileTracingIncludes: {
      '/api/transcribe': ['./node_modules/ffmpeg-static/**/*']
    }
  },
  turbopack: {}
};

module.exports = nextConfig;
