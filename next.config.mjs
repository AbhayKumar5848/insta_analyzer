/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow large request bodies for file uploads
  experimental: {
    serverActions: { bodySizeLimit: '50mb' }
  }
};

export default nextConfig;
