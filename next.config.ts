import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: ["mathjs", "franc-min"],
  // @xenova/transformers removed — embeddings now via HF Inference API (no native binaries)
}

export default nextConfig
