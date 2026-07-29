import { ImageResponse } from "next/og";
import { AppIconMark } from "@/lib/appIcon";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(<AppIconMark size={512} cornerRadius={108} />, {
    width: 512,
    height: 512,
  });
}
