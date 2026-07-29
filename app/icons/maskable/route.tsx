import { ImageResponse } from "next/og";
import { AppIconMark } from "@/lib/appIcon";

export const runtime = "edge";

// Maskable icons must fill edge-to-edge (the OS applies its own
// circle/squircle/rounded-square mask on top), so no corner radius here
// — and the dot stays well inside the ~80% "safe zone" so it survives
// whatever shape gets cropped over it.
export async function GET() {
  return new ImageResponse(
    <AppIconMark size={512} cornerRadius={0} dotRatio={0.3} />,
    { width: 512, height: 512 }
  );
}
