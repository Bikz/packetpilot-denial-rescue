import type { Metadata } from "next";

import "@packetpilot/ui/styles.css";
import "./globals.css";
import { DevSwReset } from "@/components/dev-sw-reset";

export const metadata: Metadata = {
  title: "PacketPilot",
  description: "Local-first prior authorization copilot.",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <DevSwReset />
        {children}
      </body>
    </html>
  );
}
