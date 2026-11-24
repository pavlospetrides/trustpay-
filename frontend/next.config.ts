import type { NextConfig } from "next";
const origin = process.env.TRUSTPAY_API_ORIGIN || "http://127.0.0.1:8000";
const nextConfig: NextConfig = { async rewrites() { return [
  { source: "/api/:path*", destination: `${origin}/api/:path*` },
  // FastAPI Swagger UI and its schema, so /docs works on the Next.js port too
  { source: "/docs", destination: `${origin}/docs` },
  { source: "/openapi.json", destination: `${origin}/openapi.json` },
]; } };
export default nextConfig;
