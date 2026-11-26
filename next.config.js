/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Load pdf-parse (and pdf.js) from node_modules at runtime instead of
  // bundling them into the API routes.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
  turbopack: { root: __dirname },
};

module.exports = nextConfig;
