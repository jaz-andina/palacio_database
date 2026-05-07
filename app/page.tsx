import Link from 'next/link'

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen">
      <h1 className="text-3xl font-bold mb-4">Palacio Database</h1>
      <Link
        href="/transactions"
        className="bg-blue-600 text-white px-6 py-3 rounded text-sm font-medium hover:bg-blue-700"
      >
        View Transactions
      </Link>
    </main>
  )
}
