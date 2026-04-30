import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disabilita il "dev indicator" (badge "N" in basso a sx con route/bundler).
  // È solo dev; in produzione non compare comunque. Inutile per noi.
  devIndicators: false,
  // React Strict Mode off in dev: con Next 16 + React 19 + framer-motion 12
  // (motion.div con layoutId in renderable .map) viene emesso un warning
  // "Each child in a list should have a unique key" spurio durante il
  // double-render di strict mode. Funzionalmente nulla rotto. In produzione
  // il flag è ignorato comunque.
  reactStrictMode: false,
};

export default nextConfig;
