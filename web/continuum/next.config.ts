import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this app to avoid Turbopack inferring a parent
  // directory when multiple lockfiles exist higher up the tree.
  turbopack: {
    root: path.join(__dirname),
  },
  // Keep the headless-browser driver external to the server bundle.
  serverExternalPackages: ["playwright-core"],
};

export default nextConfig;
