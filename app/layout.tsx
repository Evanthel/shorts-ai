import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShortsAI",
  description: "Personalized weather-to-clothing recommendations for runners.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
