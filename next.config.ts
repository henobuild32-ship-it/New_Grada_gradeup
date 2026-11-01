import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import { readFileSync } from "node:fs";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

// Version lisible du paquet (fallback : 0.3.1).
const packageVersion = (() => {
  try {
    const pkg = JSON.parse(readFileSync("./package.json", "utf8")) as { version?: string };
    return pkg.version || "0.3.1";
  } catch {
    return "0.3.1";
  }
})();

// Identifiant unique de ce build : rend chaque déploiement détectable côté
// client (compare de versions, notifications de mise à jour de la PWA).
const buildVersion = process.env.NEXT_PUBLIC_BUILD_VERSION || `build-${Date.now()}`;
const buildLabel =
  process.env.NEXT_PUBLIC_BUILD_VERSION_LABEL ||
  `v${packageVersion} · ${new Date().toISOString().slice(0, 10)}`;

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: false,
  allowedDevOrigins: ["*"],
  env: {
    NEXT_PUBLIC_BUILD_VERSION: buildVersion,
    NEXT_PUBLIC_BUILD_VERSION_LABEL: buildLabel,
  },
  images: {
    // Le logo de marque est un SVG local (1 Ko) : on l'autorise explicitement
    // pour le passer par l'optimiseur d'images Next.
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 192],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "date-fns", "sonner"],
  },
  turbopack: {},
};

export default withSerwist(nextConfig);
