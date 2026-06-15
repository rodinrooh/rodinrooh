import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: ["mathjs", "franc-min"],
  serverExternalPackages: ["@xenova/transformers", "onnxruntime-node"],
}

export default nextConfig
