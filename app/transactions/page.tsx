'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Transaction } from '@/types/transaction'
import { logout } from '@/app/actions/auth'

const OPENING_BALANCE = 14226.82
const OPENING_DATE = '2026-05-07'

const CATEGORIES = [
  'Electricidad',
  'Internet',
  'Celular Jaz',
  'Agua',
  'Gas',
  'Social Security',
  'Contabilidad',
  'Bank Fees',

  'Jardin',
  'Admin',
  'Seguro',
  'Limpieza',
  'Impuestos',
  'Mantenimiento',
  'Alquiler',
]

const emptyForm = {
  date: '',
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
  const [receipt, setReceipt] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  async function handleDelete(id: number) {
    await supabase.from('transactions').delete().eq('id', id)
    setTransactions((prev) => prev.filter((t) => t.id !== id))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError(null)

    if (receipt) {
      const ext = receipt.name.split('.').pop()
      const path = `${Date.now()}-${form.description || 'receipt'}.${ext}`
      await supabase.storage.from('receipts').upload(path, receipt)
    }

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
      setReceipt(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      await fetchTransactions()
    }
    setSubmitting(false)
  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target
    const updates: Partial<typeof emptyForm> = { [name]: value }
    if (name === 'category') {
      updates.belongs_to = value === 'Celular Jaz' ? 'jaz' : 'meruprop'
      updates.paid_by = value === 'Agua' ? 'jaz' : 'Meruprop'
      updates.type = value === 'Alquiler' ? 'Income' : 'Expense'
      if (value === 'Admin') {
        const ym = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
        const income = transactions
          .filter((t) => t.date.startsWith(ym) && t.type === 'Income')
          .reduce((sum, t) => sum + t.amount, 0)
        updates.amount = (income * 0.1 + 110).toFixed(2)
      }
    }
    setForm({ ...form, ...updates })
  }

  const inputClass =
    'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

  const now = new Date()
  const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const newTransactions = transactions.filter((t) => t.date > OPENING_DATE)
  const allIncome = newTransactions.filter((t) => t.type === 'Income').reduce((sum, t) => sum + t.amount, 0)
  const allExpenses = newTransactions.filter((t) => t.type === 'Expense').reduce((sum, t) => sum + t.amount, 0)
  const currentBalance = OPENING_BALANCE + allIncome - allExpenses

  const monthlyTransactions = transactions.filter((t) => t.date.startsWith(currentYearMonth))
  const monthlyIncome = monthlyTransactions.filter((t) => t.type === 'Income').reduce((sum, t) => sum + t.amount, 0)
  const monthlyExpenses = monthlyTransactions.filter((t) => t.type === 'Expense').reduce((sum, t) => sum + t.amount, 0)

  const UTILITY_CATEGORIES = ['electricidad', 'gas', 'agua', 'internet', 'jardin']
  const monthlyUtilities = Math.abs(
    monthlyTransactions
      .filter((t) => UTILITY_CATEGORIES.includes(t.category?.toLowerCase()))
      .reduce((sum, t) => sum + t.amount, 0)
  )

  const ADMIN_TAX_FIXED_CATEGORIES = ['social security', 'contabilidad', 'bank fees', 'impuestos']
  const monthlyAdminFixed = monthlyTransactions
    .filter((t) => ADMIN_TAX_FIXED_CATEGORIES.includes(t.category?.toLowerCase()))
    .reduce((sum, t) => sum + t.amount, 0)
  const calculatedAdmin = monthlyIncome * 0.1 + 110
  const monthlyAdminTax = Math.abs(monthlyAdminFixed + calculatedAdmin)

  const monthlyMantenimiento = Math.abs(
    monthlyTransactions
      .filter((t) => t.category?.toLowerCase() === 'mantenimiento')
      .reduce((sum, t) => sum + t.amount, 0)
  )

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Property Management</h1>
        <form action={logout}>
          <button
            type="submit"
            className="text-sm text-gray-500 hover:text-gray-800 border border-gray-300 rounded px-3 py-1"
          >
            Sign out
          </button>
        </form>
      </div>

      {/* Balance Summary */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Current Balance</p>
          <p className={`text-2xl font-bold ${currentBalance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
            €{currentBalance.toFixed(2)}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Monthly Income</p>
          <p className="text-2xl font-bold text-green-600">€{monthlyIncome.toFixed(2)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Monthly Expenses</p>
          <p className="text-2xl font-bold text-red-600">€{monthlyExpenses.toFixed(2)}</p>
        </div>
      </div>

      {/* Monthly Subtotals */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Monthly Utilities</p>
          <p className="text-2xl font-bold text-orange-600">€{monthlyUtilities.toFixed(2)}</p>
          <p className="text-xs text-gray-400 mt-1">Electricidad · Gas · Agua · Internet · Jardin</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Monthly Admin & Taxes</p>
          <p className="text-2xl font-bold text-purple-600">€{monthlyAdminTax.toFixed(2)}</p>
          <p className="text-xs text-gray-400 mt-1">Social Security · Contabilidad · Bank Fees · Admin · Impuestos</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Monthly Mantenimiento</p>
          <p className="text-2xl font-bold text-blue-600">€{monthlyMantenimiento.toFixed(2)}</p>
          <p className="text-xs text-gray-400 mt-1">Mantenimiento</p>
        </div>
      </div>

      {/* Add Transaction Form */}
      <section className="mb-10 bg-gray-50 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Add Transaction</h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4 sm:grid-cols-3">

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input name="date" type="date" value={form.date} onChange={handleChange} className={inputClass} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select name="category" value={form.category} onChange={handleChange} className={inputClass}>
              <option value="">Select a category</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select name="type" value={form.type} onChange={handleChange} className={inputClass}>
              <option value="">Select a type</option>
              <option value="Expense">Expense</option>
              <option value="Income">Income</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input name="description" type="text" value={form.description} onChange={handleChange} className={inputClass} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
            <input name="amount" type="number" placeholder="0.00" value={form.amount} onChange={handleChange} className={inputClass} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Paid By</label>
            <input name="paid_by" type="text" value={form.paid_by} onChange={handleChange} className={inputClass} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Belongs To</label>
            <input name="belongs_to" type="text" value={form.belongs_to} onChange={handleChange} className={inputClass} />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea name="notes" value={form.notes} onChange={handleChange} rows={1} className={`${inputClass} resize-none`} />
          </div>

          {submitError && (
            <p className="col-span-2 sm:col-span-3 text-sm text-red-600">{submitError}</p>
          )}

          <div className="col-span-2 sm:col-span-3 flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,image/*"
              className="hidden"
              onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="bg-emerald-600 text-white px-5 py-2 rounded text-sm font-medium hover:bg-emerald-700"
            >
              Receipt
            </button>
            {receipt && (
              <span className="text-sm text-gray-600 truncate max-w-xs">{receipt.name}</span>
            )}
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
                  {['Date', 'Category', 'Type', 'Description', 'Amount', 'Paid By', 'Belongs To', 'Notes', ''].map(
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
                    <td className="px-3 py-2 whitespace-nowrap">{t.category}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{t.type}</td>
                    <td className="px-3 py-2">{t.description}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-medium">
                      {typeof t.amount === 'number' ? t.amount.toFixed(2) : t.amount}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{t.paid_by}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{t.belongs_to}</td>
                    <td className="px-3 py-2 text-gray-500">{t.notes}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => handleDelete(t.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors leading-none"
                        title="Delete transaction"
                      >
                        ×
                      </button>
                    </td>
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
