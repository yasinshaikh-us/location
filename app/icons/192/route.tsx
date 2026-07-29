import { ImageResponse } from "next/og";
import { AppIconMark } from "@/lib/appIcon";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(<AppIconMark size={192} cornerRadius={40} />, {
    width: 192,
    height: 192,
  });
}
