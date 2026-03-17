import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ThelKo",
  description: "Crowdsourced Fuel Tracking for Sri Lanka",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`antialiased`}>
        {children}
      </body>
    </html>
  );
}
