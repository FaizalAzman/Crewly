import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow phones/tablets on the same Wi-Fi to load dev assets (HMR, chunks) via the LAN IP.
  allowedDevOrigins: ["192.168.1.141", "192.168.*.*", "10.*.*.*", "172.16.*.*", "*.local"],
};

export default nextConfig;
