import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import dynamic from "next/dynamic";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

const InteractiveBackground = dynamic(
  () => import("@/components/InteractiveBackground"),
  { ssr: false }
);

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "clearer.trade",
  description: "Stateless trade analytics, tilt simulation, and behavioral AI audits.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${plusJakarta.variable} ${jetbrainsMono.variable}`}>
      <body className="antialiased text-slate-200 font-sans bg-[#070a0f] min-h-screen relative">
        <InteractiveBackground />
        {children}
        <Analytics />
      </body>
    </html>
  );
}

