import type { Metadata } from "next";
import { Be_Vietnam_Pro, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";
import "leaflet/dist/leaflet.css";

const sans = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans-loaded",
  display: "swap",
});
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-loaded", display: "swap" });

export const metadata: Metadata = {
  title: "Ứng phó nhanh",
  description: "Hệ thống quản lý vật tư và điều phối cứu hộ cấp xã",
  icons: {
    icon: [{ url: "/brand/ung-pho-nhanh-mark.png", type: "image/png" }],
    shortcut: "/brand/ung-pho-nhanh-mark.png",
    apple: "/brand/ung-pho-nhanh-mark.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${sans.variable} ${mono.variable}`}>
      <head>
        {/* Material Symbols — icon font (ngoại lệ hợp lý cho icon, giữ đúng design mockup) */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
