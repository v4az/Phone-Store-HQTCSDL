// Home page — /
// Simple landing with links to main sections

import Link from "next/link";

export default function Home() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-4">Phone &amp; Accessories Management</h1>
      <p className="text-zinc-600 dark:text-zinc-400 mb-6">Inventory and sales management system.</p>
      <div className="flex flex-col gap-3">
        <Link href="/products" className="text-blue-600 hover:underline">Products</Link>
        <Link href="/inventory" className="text-blue-600 hover:underline">Inventory</Link>
        <Link href="/sales/new" className="text-blue-600 hover:underline">New Sale</Link>
      </div>
    </div>
  );
}
