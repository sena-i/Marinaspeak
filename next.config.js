/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb'
    }
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = { ...config.resolve.fallback, fs: false };
    }
    return config;
  }
};

module.exports = nextConfig;
