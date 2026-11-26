import type { NextConfig } from "next";
const nextConfig: NextConfig = { serverExternalPackages: ["pdf-parse", "pdfjs-dist", "tesseract.js", "@tesseract.js-data/eng", "@tesseract.js-data/ell"] };
export default nextConfig;
