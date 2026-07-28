import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Emir Duman — Interactive Portfolio",
  description: "Interactive portfolio landing page of Emir Duman.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
