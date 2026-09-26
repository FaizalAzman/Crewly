import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow phones/tablets on the same Wi-Fi to load dev assets (HMR, chunks) via the LAN IP.
  allowedDevOrigins: ["192.168.1.141", "192.168.*.*", "10.*.*.*", "172.16.*.*", "*.local"],
  // pdfkit reads its font metrics from node_modules at runtime; keep it out of the bundle.
  serverExternalPackages: ["pdfkit"],
  // Don't advertise the framework version.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Clock-in uses GPS on our own pages only; nothing else needs camera, mic or location.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
  experimental: {
    // File uploads (receipts, MCs, documents, résumés) are capped at 5 MB in the upload service.
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
