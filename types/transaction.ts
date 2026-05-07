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
}
