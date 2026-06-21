export type Transaction = {
  id: number
  date: string
  type: string
  category: string
  description: string
  amount: number
  paid_by: string
  belongs_to: string
  notes: string | null
  // URL of the attached receipt/invoice document (stored in the `receipts` storage bucket)
  invoice_url: string | null
}
