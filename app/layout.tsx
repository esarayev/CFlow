import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zabota GO - система управления карго-точкой",
  description:
    "Современная web-система для приема, хранения, отправки, выдачи и финансового учета каждой коробки.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
