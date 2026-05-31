import type { Metadata } from "next";
import { EB_Garamond, Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const display = EB_Garamond({
  subsets: ["cyrillic", "latin"],
  variable: "--font-display",
  weight: ["400", "600", "700"],
  display: "swap",
});

const body = Manrope({
  subsets: ["cyrillic", "latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["cyrillic", "latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ZOPEXPERT",
  description: "Обществени поръчки — асистент",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="bg"
      className={`${display.variable} ${body.variable} ${mono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
