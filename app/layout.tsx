import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import RegisterServiceWorker from "@/components/RegisterServiceWorker";
import "./globals.css";
import "leaflet/dist/leaflet.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Location Timeline",
  description: "Ask questions about your own location history",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Location Timeline",
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-paper font-sans text-ink antialiased">
        <RegisterServiceWorker />
        {children}
      </body>
    </html>
  );
}
