'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Transaction } from '@/types/transaction'

const emptyForm = {
  date: '',
  month: '',
  type: '',
  category: '',
  description: '',
  amount: '',
  paid_by: '',
  belongs_to: '',
  notes: '',
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  async function fetchTransactions() {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: false })
    if (error) {
      setError(error.message)
    } else {
      setTransactions(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchTransactions()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError(null)

    const { error } = await supabase.from('transactions').insert([
      {
        ...form,
        amount: parseFloat(form.amount),
      },
    ])

    if (error) {
      setSubmitError(error.message)
    } else {
      setForm(emptyForm)
      await fetchTransactions()
    }
    setSubmitting(false)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-8">Transactions</h1>

      {/* Add Transaction Form */}
      <section className="mb-10 bg-gray-50 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Add Transaction</h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {[
            { name: 'date', label: 'Date', type: 'date' },
            { name: 'month', label: 'Month', type: 'text', placeholder: 'e.g. January' },
            { name: 'type', label: 'Type', type: 'text', placeholder: 'e.g. Expense' },
            { name: 'category', label: 'Category', type: 'text' },
            { name: 'description', label: 'Description', type: 'text' },
            { name: 'amount', label: 'Amount', type: 'number', placeholder: '0.00' },
            { name: 'paid_by', label: 'Paid By', type: 'text' },
            { name: 'belongs_to', label: 'Belongs To', type: 'text' },
          ].map(({ name, label, type, placeholder }) => (
            <div key={name}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input
                name={name}
                type={type}
                placeholder={placeholder}
                value={form[name as keyof typeof form]}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}

          <div className="col-span-2 sm:col-span-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              rows={2}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {submitError && (
            <p className="col-span-2 sm:col-span-3 text-sm text-red-600">{submitError}</p>
          )}

          <div className="col-span-2 sm:col-span-3">
            <button
              type="submit"
              disabled={submitting}
              className="bg-blue-600 text-white px-5 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Adding...' : 'Add Transaction'}
            </button>
          </div>
        </form>
      </section>

      {/* Transactions Table */}
      <section>
        <h2 className="text-lg font-semibold mb-4">All Transactions</h2>

        {loading && <p className="text-gray-500 text-sm">Loading transactions...</p>}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded p-4 text-sm">
            Error: {error}
          </div>
        )}

        {!loading && !error && transactions.length === 0 && (
          <p className="text-gray-500 text-sm">No transactions yet.</p>
        )}

        {!loading && !error && transactions.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border border-gray-200 rounded">
              <thead className="bg-gray-100 text-gray-700">
                <tr>
                  {['Date', 'Month', 'Type', 'Category', 'Description', 'Amount', 'Paid By', 'Belongs To', 'Notes'].map(
                    (h) => (
                      <th key={h} className="text-left px-3 py-2 whitespace-nowrap font-medium">
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-t border-gray-200 hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap">{t.date}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{t.month}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{t.type}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{t.category}</td>
                    <td className="px-3 py-2">{t.description}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-medium">
                      {typeof t.amount === 'number' ? t.amount.toFixed(2) : t.amount}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{t.paid_by}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{t.belongs_to}</td>
                    <td className="px-3 py-2 text-gray-500">{t.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
