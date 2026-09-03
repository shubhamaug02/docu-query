/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-parse and pdfjs-dist resolve worker/canvas files relative to their own
  // package on disk at runtime, and @napi-rs/canvas (pdf-parse's DOMMatrix/
  // ImageData polyfill dependency) is a native .node binary addon — bundling
  // any of these through Turbopack breaks that resolution, so keep them
  // external and let Node require() them straight from node_modules.
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist', '@napi-rs/canvas'],

  // @napi-rs/canvas resolves its actual native .node binary via a dynamic,
  // platform-computed require() at runtime (picks the right one for
  // process.platform/arch). Vercel's static file tracer can't follow that, so
  // without this the binary silently doesn't make it into the deployed
  // function even though `serverExternalPackages` is set — hence "Cannot find
  // module '@napi-rs/canvas'" in production despite it working locally.
  // Vercel's Node.js functions run on glibc/Linux x64, hence -gnu, not -musl.
  // Both are required: the meta-package (@napi-rs/canvas) holds the JS entry
  // point pdfjs-dist actually calls require() on — that entry point is what
  // internally does the dynamic platform-specific require() for the binary.
  // Tracing only the binary (as an earlier version of this fix did) still
  // leaves require("@napi-rs/canvas") itself unresolvable.
  //
  // pdfjs-dist itself also resolves several of its own files dynamically at
  // runtime, relative to its own location on disk — its worker script
  // (legacy/build/pdf.worker.mjs, needed for its Node "fake worker" fallback)
  // being the one that actually bit us, but cmaps/ and standard_fonts/ can be
  // loaded the same dynamic way depending on a given PDF's fonts. Rather than
  // keep discovering these one deploy at a time, include the whole package —
  // ~36MB, comfortably inside Vercel's function size limit.
  outputFileTracingIncludes: {
    '/api/extract': [
      './node_modules/@napi-rs/canvas/**',
      './node_modules/@napi-rs/canvas-linux-x64-gnu/**',
      './node_modules/pdfjs-dist/**',
    ],
  },
};

export default nextConfig;
