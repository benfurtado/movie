import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rudhra - Movies",
  description:
    "Rudhra is a collaborative movie and series streaming app that empowers users to upload and watch content together in real time. Designed for creators, fans, and communities, Rudhra transforms passive viewing into a shared experience.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full overflow-y-auto">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased h-full bg-black text-white overflow-y-auto`}
      >
        {children}
      </body>
    </html>
  );
}
