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

  // ✅ 2. [추가됨] Next.js 16 빌드 오류 해결용 (Turbopack 충돌 방지)
  turbopack: {},

  // 3. Yahoo Finance 빌드 오류 해결을 위한 Webpack 설정
  webpack: (config: any) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '../../tests/http/': false, // 개발용 파일 무시
    };
    return config;
  },

  // 4. 서버 컴포넌트 패키지 설정
  serverExternalPackages: ['yahoo-finance2'],
};

export default nextConfig;