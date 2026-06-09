import { ImageResponse } from "next/og"

export const size = { width: 32, height: 32 }
export const contentType = "image/png"

export default async function Icon() {
  // 📡 satellite antenna — the "looking at something you're not supposed to see" vibe.
  const img = await fetch(
    "https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f4e1.png"
  ).then((r) => r.arrayBuffer())

  return new ImageResponse(
    <img
      src={`data:image/png;base64,${Buffer.from(img).toString("base64")}`}
      width="32"
      height="32"
    />,
    { ...size }
  )
}
