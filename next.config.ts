import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 이미지 설정은 유지
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.weatherapi.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // Yahoo 관련 설정들은 모두 삭제됨
};

export default nextConfig;