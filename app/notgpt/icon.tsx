import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#10a37f",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "6px",
        }}
      >
        <span
          style={{
            color: "white",
            fontSize: 20,
            fontWeight: 700,
            textDecoration: "line-through",
            textDecorationColor: "#ef4444",
            fontFamily: "sans-serif",
          }}
        >
          G
        </span>
      </div>
    ),
    { ...size }
  );
}
