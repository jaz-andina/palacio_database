export type Transaction = {
  id: number
  date: string
  month: string
  type: string
  category: string
  description: string
  amount: number
  paid_by: string
  belongs_to: string
  notes: string | null
}
