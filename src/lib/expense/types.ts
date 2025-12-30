// src/lib/expense/types.ts

export interface ExpenseCategory {
  id: number
  parent_name: string
  name: string
  keywords: string[]
  color: string
}

export interface CardSetting {
  id: number
  card_company: string
  payment_day: number
  usage_start_day: number
  // 'immediate' 타입 추가 (현금/체크카드용)
  calc_type: 'simple' | 'sliding' | 'immediate'
}

export interface ExpenseRecord {
  id: number
  transaction_date: string
  payment_date: string | null
  card_company: string
  description: string
  amount: number
  category_id: number | null
  category?: ExpenseCategory
  memo?: string
}