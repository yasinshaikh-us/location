/**
 * Shared mark used for the favicon, apple touch icon, and PWA manifest
 * icons — a white dot on the app's blue, echoing the pin-drop logo in
 * the page header (components: MapView's stop markers, page.tsx's
 * header badge).
 */
export function AppIconMark({
  size,
  cornerRadius,
  dotRatio = 0.34,
}: {
  size: number;
  /** 0 for maskable icons — the OS applies its own mask/shape. */
  cornerRadius: number;
  dotRatio?: number;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#2563eb",
        borderRadius: cornerRadius,
      }}
    >
      <div
        style={{
          width: size * dotRatio,
          height: size * dotRatio,
          borderRadius: "9999px",
          background: "white",
        }}
      />
    </div>
  );
}
