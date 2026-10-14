import type { NextConfig } from 'next';

const apiOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').origin;
  } catch {
    return 'http://localhost:3001';
  }
})();

/**
 * CSP estricta: scripts solo propios (+ Turnstile si se usa CAPTCHA), conexiones
 * solo a la API configurada. Las imágenes externas son escudos de proveedores.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin}`,
  'frame-src https://challenges.cloudflare.com',
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig: NextConfig = {
  transpilePackages: ['@oracle-odds/probability-engine'],
  poweredByHeader: false,
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
  async headers() {
    return [
      { source: '/((?!embed).*)', headers: [...securityHeaders, { key: 'X-Frame-Options', value: 'SAMEORIGIN' }] },
      // Los widgets embebibles pueden mostrarse en sitios de terceros.
      { source: '/embed/:path*', headers: securityHeaders.map((h) => (h.key === 'Content-Security-Policy' ? { ...h, value: h.value.replace("frame-ancestors 'self'", 'frame-ancestors *') } : h)) },
    ];
  },
};

export default nextConfig;
