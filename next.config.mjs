/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-parse and pdfjs-dist resolve worker/canvas files relative to their own
  // package on disk at runtime, and @napi-rs/canvas (pdf-parse's DOMMatrix/
  // ImageData polyfill dependency) is a native .node binary addon — bundling
  // any of these through Turbopack breaks that resolution, so keep them
  // external and let Node require() them straight from node_modules.
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist', '@napi-rs/canvas'],
};

export default nextConfig;
