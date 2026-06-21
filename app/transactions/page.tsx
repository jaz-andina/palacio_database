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

// Tenants who can be selected as "Paid By" for Alquiler (rental income) transactions
const ALQUILER_PAYERS = ['Brenda', 'Ida', 'Mili']

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

// Sube una copia del receipt a Google Drive (vía /api/receipts → Apps Script),
// organizándolo en <año>/<mes> según la fecha de la transacción. Lanza error si falla.
async function uploadReceiptToDrive(file: File, dateStr: string, description: string) {
  const d = dateStr || new Date().toISOString().slice(0, 10) // 'YYYY-MM-DD'
  const year = d.slice(0, 4)
  const monthNum = d.slice(5, 7)
  const monthName = MONTHS_ES[parseInt(monthNum, 10) - 1] ?? monthNum
  const ext = file.name.split('.').pop()
  const safe = (description || 'receipt').replace(/[^a-zA-Z0-9.-]/g, '_')

  const fd = new FormData()
  fd.append('file', file)
  fd.append('year', year)
  fd.append('month', `${monthNum} ${monthName}`) // ej: "06 Junio" (ordena cronológicamente)
  fd.append('filename', `${d}-${safe}.${ext}`)

  const res = await fetch('/api/receipts', { method: 'POST', body: fd })
  if (!res.ok) {
    const out = await res.json().catch(() => ({}))
    throw new Error(out.error || 'Drive upload failed')
  }
}

// Fecha local de hoy en formato 'YYYY-MM-DD' (sin desfase de zona horaria)
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

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

const UTILITY_CATEGORIES = ['electricidad', 'gas', 'agua', 'internet', 'jardin']
const SEGURO_CATEGORIES = ['seguro', 'insurance']
const ADMIN_TAX_FIXED_CATEGORIES = ['social security', 'contabilidad', 'bank fees', 'impuestos']

// Única fuente de verdad de los totales de las cajas del mes actual.
// La usan tanto el dashboard como la sincronización al Google Sheet.
function monthlyBoxes(transactions: Transaction[]) {
  const now = new Date()
  const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const isSeguro = (t: Transaction) => SEGURO_CATEGORIES.includes(t.category?.toLowerCase())
  // El seguro se prorratea: última transacción de seguro (mayor id) / 12.
  const lastSeguro = transactions
    .filter(isSeguro)
    .reduce<Transaction | null>((latest, t) => (!latest || t.id > latest.id ? t : latest), null)
  const monthlySeguro = lastSeguro ? Math.abs(lastSeguro.amount) / 12 : 0

  const monthlyTransactions = transactions.filter((t) => t.date.startsWith(currentYearMonth))
  const monthlyIncome = monthlyTransactions
    .filter((t) => t.type === 'Income')
    .reduce((s, t) => s + t.amount, 0)

  // Gastos del mes: excluye seguro puntual y suma el seguro prorrateado.
  const monthlyExpenses =
    monthlyTransactions
      .filter((t) => t.type === 'Expense' && !isSeguro(t))
      .reduce((s, t) => s + t.amount, 0) + monthlySeguro

  const monthlyUtilities =
    Math.abs(
      monthlyTransactions
        .filter((t) => UTILITY_CATEGORIES.includes(t.category?.toLowerCase()))
        .reduce((s, t) => s + t.amount, 0)
    ) + monthlySeguro

  const monthlyAdminFixed = monthlyTransactions
    .filter((t) => ADMIN_TAX_FIXED_CATEGORIES.includes(t.category?.toLowerCase()))
    .reduce((s, t) => s + t.amount, 0)
  const monthlyAdminTax = Math.abs(monthlyAdminFixed + (monthlyIncome * 0.1 + 110))

  const monthlyMantenimiento = Math.abs(
    monthlyTransactions
      .filter((t) => t.category?.toLowerCase() === 'mantenimiento')
      .reduce((s, t) => s + t.amount, 0)
  )

  // Total de agua del mes (va a la fila 42 del Sheet, columna del mes).
  const monthlyAgua = Math.abs(
    monthlyTransactions
      .filter((t) => t.category?.toLowerCase() === 'agua')
      .reduce((s, t) => s + t.amount, 0)
  )

  return {
    monthName: MONTHS_ES[now.getMonth()],
    monthlyIncome,
    monthlyExpenses,
    monthlyUtilities,
    monthlyAdminTax,
    monthlyMantenimiento,
    monthlyAgua,
  }
}

// Envía los 4 totales del mes actual al Google Sheet (vía /api/sheet → Apps Script).
// No lanza: si falla, devuelve el error como string para mostrarlo sin romper el flujo.
async function syncTotalsToSheet(transactions: Transaction[]): Promise<string | null> {
  const b = monthlyBoxes(transactions)
  try {
    const res = await fetch('/api/sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        month: b.monthName,
        utilities: Number(b.monthlyUtilities.toFixed(2)),
        mantenimiento: Number(b.monthlyMantenimiento.toFixed(2)),
        adminImpuestos: Number(b.monthlyAdminTax.toFixed(2)),
        realesTotales: Number(b.monthlyExpenses.toFixed(2)),
        agua: Number(b.monthlyAgua.toFixed(2)),
      }),
    })
    const out = await res.json().catch(() => ({}))
    if (!res.ok || !out.ok) return out.error || `Sheet sync failed (HTTP ${res.status})`
    return null
  } catch (err) {
    return String(err)
  }
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
  const [rowUploadingId, setRowUploadingId] = useState<number | null>(null)
  const rowFileInputRef = useRef<HTMLInputElement>(null)
  const pendingRowRef = useRef<Transaction | null>(null)
  const [csvFrom, setCsvFrom] = useState('')
  const [csvTo, setCsvTo] = useState('')

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
    return data || []
  }

  useEffect(() => {
    fetchTransactions()
    // Default de la fecha = hoy (editable por el usuario). Se setea en el cliente
    // para evitar mismatch de hidratación.
    setForm((f) => ({ ...f, date: todayStr() }))
  }, [])

  async function handleDelete(id: number) {
    await supabase.from('transactions').delete().eq('id', id)
    const next = transactions.filter((t) => t.id !== id)
    setTransactions(next)
    // Borrar también cambia los totales del mes → re-sincronizamos el Sheet.
    const sheetErr = await syncTotalsToSheet(next)
    if (sheetErr) setError(`Transacción borrada, pero no se pudo actualizar el Sheet: ${sheetErr}`)
  }

  // Exporta todas las transacciones visibles a un archivo CSV descargable
  function handleDownloadCSV() {
    const headers = ['Date', 'Category', 'Type', 'Description', 'Amount', 'Paid By', 'Belongs To', 'Notes', 'Receipt']
    const escape = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    // Filtramos por el rango de fechas elegido (las fechas son ISO 'YYYY-MM-DD',
    // así que la comparación de strings funciona). Cualquier campo vacío = sin límite.
    const filtered = transactions.filter((t) => {
      if (csvFrom && t.date < csvFrom) return false
      if (csvTo && t.date > csvTo) return false
      return true
    })
    if (filtered.length === 0) {
      alert('No hay transacciones en el rango de fechas seleccionado.')
      return
    }
    const rows = filtered.map((t) =>
      [t.date, t.category, t.type, t.description, t.amount, t.paid_by, t.belongs_to, t.notes, t.invoice_url]
        .map(escape)
        .join(',')
    )
    // BOM para que Excel respete los acentos (€, ñ, etc.)
    const csv = '﻿' + [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Opens the hidden file picker for a specific row (attach or replace its receipt)
  function openRowReceiptPicker(t: Transaction) {
    pendingRowRef.current = t
    if (rowFileInputRef.current) {
      rowFileInputRef.current.value = ''
      rowFileInputRef.current.click()
    }
  }

  // Uploads the chosen file to the `receipts` bucket and saves its public URL on the row
  async function handleRowReceipt(t: Transaction, file: File) {
    setRowUploadingId(t.id)
    setError(null)
    const ext = file.name.split('.').pop()
    const safeName = (t.description || 'receipt').replace(/[^a-zA-Z0-9.-]/g, '_')
    const path = `${Date.now()}-${safeName}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(path, file)
    if (uploadError) {
      setError(`Receipt upload failed: ${uploadError.message}`)
      setRowUploadingId(null)
      return
    }

    const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(path)
    const newUrl = urlData.publicUrl

    const { error: updateError } = await supabase
      .from('transactions')
      .update({ invoice_url: newUrl })
      .eq('id', t.id)
    if (updateError) {
      setError(`Could not save receipt: ${updateError.message}`)
      setRowUploadingId(null)
      return
    }

    setTransactions((prev) =>
      prev.map((x) => (x.id === t.id ? { ...x, invoice_url: newUrl } : x))
    )

    // Copia adicional a Google Drive. No revertimos el receipt si Drive falla.
    try {
      await uploadReceiptToDrive(file, t.date, t.description)
    } catch (err) {
      setError(`Receipt guardado, pero no se pudo subir a Drive: ${String(err)}`)
    }

    setRowUploadingId(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError(null)

    let invoiceUrl: string | null = null
    let driveFailed: string | null = null
    if (receipt) {
      const ext = receipt.name.split('.').pop()
      const safeName = (form.description || 'receipt').replace(/[^a-zA-Z0-9.-]/g, '_')
      const path = `${Date.now()}-${safeName}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(path, receipt)
      if (uploadError) {
        setSubmitError(`Receipt upload failed: ${uploadError.message}`)
        setSubmitting(false)
        return
      }
      const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(path)
      invoiceUrl = urlData.publicUrl

      // Copia adicional a Google Drive. No bloqueamos la transacción si Drive falla.
      try {
        await uploadReceiptToDrive(receipt, form.date, form.description)
      } catch (err) {
        driveFailed = String(err)
      }
    }

    const { error } = await supabase.from('transactions').insert([
      {
        ...form,
        amount: parseFloat(form.amount),
        invoice_url: invoiceUrl,
      },
    ])

    if (error) {
      setSubmitError(error.message)
    } else {
      setForm({ ...emptyForm, date: todayStr() })
      setReceipt(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      const fresh = await fetchTransactions()
      const sheetErr = await syncTotalsToSheet(fresh)
      const warnings = [
        driveFailed && `no se pudo subir a Drive: ${driveFailed}`,
        sheetErr && `no se pudo actualizar el Sheet: ${sheetErr}`,
      ].filter(Boolean)
      setSubmitError(
        warnings.length ? `Transacción guardada, pero ${warnings.join(' y ')}.` : null
      )
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
      updates.paid_by =
        value === 'Agua' || value === 'Celular Jaz'
          ? 'jaz'
          : value === 'Social Security' || value === 'Impuestos'
            ? 'Meruprop to Jaz'
            : value === 'Alquiler'
              ? '' // tenant is chosen from the Brenda/Ida/Mili dropdown
              : 'Meruprop'
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

  const newTransactions = transactions.filter((t) => t.date > OPENING_DATE)
  const allIncome = newTransactions.filter((t) => t.type === 'Income').reduce((sum, t) => sum + t.amount, 0)
  const allExpenses = newTransactions.filter((t) => t.type === 'Expense').reduce((sum, t) => sum + t.amount, 0)
  const currentBalance = OPENING_BALANCE + allIncome - allExpenses

  const {
    monthlyIncome,
    monthlyExpenses,
    monthlyUtilities,
    monthlyAdminTax,
    monthlyMantenimiento,
  } = monthlyBoxes(transactions)
  const monthlyProfit = monthlyIncome - monthlyExpenses

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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
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
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Monthly Profit</p>
          <p className={`text-2xl font-bold ${monthlyProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            €{monthlyProfit.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Monthly Subtotals */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Monthly Utilities</p>
          <p className="text-2xl font-bold text-orange-600">€{monthlyUtilities.toFixed(2)}</p>
          <p className="text-xs text-gray-400 mt-1">Electricidad · Gas · Agua · Internet · Jardin · Seguro/12</p>
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
            {form.category === 'Alquiler' ? (
              <select name="paid_by" value={form.paid_by} onChange={handleChange} className={inputClass}>
                <option value="">Select tenant</option>
                {ALQUILER_PAYERS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            ) : (
              <input name="paid_by" type="text" value={form.paid_by} onChange={handleChange} className={inputClass} />
            )}
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
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h2 className="text-lg font-semibold">All Transactions</h2>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Desde</label>
            <input
              type="date"
              value={csvFrom}
              max={csvTo || undefined}
              onChange={(e) => setCsvFrom(e.target.value)}
              className="text-sm border border-gray-300 rounded px-2 py-1"
            />
            <label className="text-xs text-gray-500">Hasta</label>
            <input
              type="date"
              value={csvTo}
              min={csvFrom || undefined}
              onChange={(e) => setCsvTo(e.target.value)}
              className="text-sm border border-gray-300 rounded px-2 py-1"
            />
            {(csvFrom || csvTo) && (
              <button
                type="button"
                onClick={() => {
                  setCsvFrom('')
                  setCsvTo('')
                }}
                className="text-xs text-gray-400 hover:text-gray-700"
                title="Limpiar filtro de fechas"
              >
                Limpiar
              </button>
            )}
            <button
              type="button"
              onClick={handleDownloadCSV}
              disabled={transactions.length === 0}
              className="text-sm bg-gray-800 text-white rounded px-3 py-1.5 hover:bg-gray-900 disabled:opacity-50"
            >
              Descargar CSV
            </button>
          </div>
        </div>

        {/* Shared hidden picker used by every row's Attach/Replace Receipt button */}
        <input
          ref={rowFileInputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            const t = pendingRowRef.current
            if (file && t) handleRowReceipt(t, file)
          }}
        />

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
                  {['Date', 'Category', 'Type', 'Description', 'Amount', 'Paid By', 'Belongs To', 'Notes', 'Receipt', ''].map(
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
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {t.invoice_url && (
                          <a
                            href={t.invoice_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                            title="Open receipt"
                          >
                            View Receipt
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => openRowReceiptPicker(t)}
                          disabled={rowUploadingId === t.id}
                          className="text-xs text-gray-500 hover:text-gray-800 border border-gray-300 rounded px-2 py-1 disabled:opacity-50"
                        >
                          {rowUploadingId === t.id
                            ? 'Uploading…'
                            : t.invoice_url
                              ? 'Replace Receipt'
                              : 'Attach Receipt'}
                        </button>
                      </div>
                    </td>
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
