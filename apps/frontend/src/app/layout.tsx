import type { Metadata } from "next";
import { Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";
import "leaflet/dist/leaflet.css";

const sans = Hanken_Grotesk({ subsets: ["latin", "vietnamese"], variable: "--font-sans-loaded", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-loaded", display: "swap" });

export const metadata: Metadata = {
  title: "Ứng phó nhanh | Điều phối cứu hộ & hậu cần thông minh",
  description: "Giải pháp AI điều phối cứu hộ cứu nạn và hậu cần thông minh cho kho vật tư cấp xã",
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
