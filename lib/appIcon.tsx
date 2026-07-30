/**
 * Shared mark used for the favicon, apple touch icon, and PWA manifest
 * icons — a white dot on the app's accent teal, echoing the pin-drop logo
 * in the page header (components: MapView's stop markers, page.tsx's
 * header badge). Same accent gradient as the scorecard app's PIN-page
 * badge — these are static image assets, generated once and cached by
 * the OS/browser, so they use a fixed color rather than following the
 * light/dark toggle.
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
        background: "linear-gradient(135deg, #3FA796, #2C8577)",
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
