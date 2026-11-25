import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Classroom Compass · MoneyMind Games", template: "%s · Classroom Compass" },
  description: "See what your students are learning — and know what to teach next.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#fbfeeb", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
