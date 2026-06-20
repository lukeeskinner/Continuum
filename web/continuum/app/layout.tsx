import type { Metadata } from "next";
import { Fraunces, Hanken_Grotesk, Geist_Mono } from "next/font/google";
import "./globals.css";
import MeshField from "@/components/MeshField";

// Display: a warm editorial serif, used with restraint (brand + statements).
const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

// Body / UI: a clean grotesque with a little character.
const body = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

// Data / labels: mono for the "telemetry of thought" feel.
const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono-x",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Continuum — the mesh builds itself",
  description:
    "A shared knowledge graph that weaves itself from how your team works. Just work, and the connections surface.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <MeshField />
        {children}
      </body>
    </html>
  );
}
