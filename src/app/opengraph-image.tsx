import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = {
  width: 1200,
  height: 630
};

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px",
          background:
            "linear-gradient(135deg, #0F1F3D 0%, #0B63C5 55%, #2ECC71 100%)",
          color: "white"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "18px"
          }}
        >
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "22px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255,255,255,0.16)",
              fontSize: 32,
              fontWeight: 800
            }}
          >
            H
          </div>
          <div style={{ fontSize: 26, letterSpacing: 4, textTransform: "uppercase" }}>
            Heita CRM
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.05, maxWidth: "920px" }}>
            Loyalty, messaging, and AI workspaces for South African retail.
          </div>
          <div style={{ fontSize: 28, opacity: 0.9, maxWidth: "820px" }}>
            QR joins, WhatsApp-native conversations, loyalty wallets, and business AI in one mobile-first platform.
          </div>
        </div>
      </div>
    ),
    size
  );
}
