// Root layout — wraps all pages
// Contains global nav: Products, Inventory, New Sale

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import Link from "next/link";
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
  title: "CSDL - Phone & Accessories Management",
  description: "Inventory and sales management for phone & accessories shop",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <nav className="flex items-center gap-6 border-b border-zinc-200 px-6 py-3 text-sm font-medium">
          <Link href="/" className="font-bold text-lg mr-4">CSDL</Link>
          <Link href="/products" className="hover:underline">Products</Link>
          <Link href="/inventory" className="hover:underline">Inventory</Link>
          <Link href="/sales/new" className="hover:underline">New Sale</Link>
        </nav>
        <AntdRegistry>
          <main className="flex-1 p-6">{children}</main>
        </AntdRegistry>
      </body>
    </html>
  );
}
