// ✅ next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 1. 기존 이미지 설정
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

  // 2. Webpack 설정 (타입 오류 수정됨)
  // config 뒤에 ': any'를 추가했습니다.
  webpack: (config: any) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '../../tests/http/': false,
    };
    return config;
  },

  // 3. 서버 컴포넌트 패키지 설정
  serverExternalPackages: ['yahoo-finance2'],
};

export default nextConfig;