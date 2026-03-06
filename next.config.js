/** @type {import('next').NextConfig} */
const nextConfig = {
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
