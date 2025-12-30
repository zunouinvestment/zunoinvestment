// src/lib/expense/parser.ts
import * as XLSX from 'xlsx'
import { ExpenseCategory, CardSetting } from './types'

function normalizeDate(raw: unknown): string | null {
  if (!raw) return null
  let str = String(raw).trim()
  const digits = str.replace(/[^0-9]/g, '')
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
  }
  return str.replace(/\./g, '-').replace(/\//g, '-')
}

// ✅ 날짜 밀림 방지용 포맷터 (YYYY-MM-DD 문자열 직접 생성)
function formatYMD(year: number, month: number, day: number): string {
  // 월은 0부터 시작하므로 처리 필요 없음 (호출하는 쪽에서 0~11로 관리하거나 Date 로직 따름)
  // 다만 여기서는 month가 0(1월) ~ 11(12월)로 들어온다고 가정하고 계산
  const date = new Date(year, month, day)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function calculatePaymentDate(txDate: string, setting?: CardSetting): string {
  if (setting?.calc_type === 'immediate') {
    return txDate
  }

  const date = new Date(txDate)
  const day = date.getDate()
  
  if (!setting) {
    // 설정 없으면 다음달 13일
    const nextMonth = new Date(date)
    nextMonth.setMonth(nextMonth.getMonth() + 1)
    nextMonth.setDate(13)
    return formatYMD(nextMonth.getFullYear(), nextMonth.getMonth(), 13)
  }

  let targetYear = date.getFullYear()
  let targetMonth = date.getMonth() // 0~11

  // 이용 시작일 체크
  if (day >= setting.usage_start_day) {
    targetMonth += 1
  }

  // ✅ 수정: toISOString() 대신 로컬 시간 기준 문자열 생성
  return formatYMD(targetYear, targetMonth, setting.payment_day)
}

export async function parseExpenseExcel(
  fileBuffer: ArrayBuffer,
  categories: ExpenseCategory[],
  settings: CardSetting[]
) {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet)

  const etcCategory = categories.find(c => c.name === '기타' && c.parent_name === '기타') 
                   || categories.find(c => c.name === '기타')

  return jsonData
    .map((row) => {
      const cardCompany = row['카드사'] || row['카드']
      const rawDate = row['이용일'] || row['날짜'] || row['이용일자'] || row['승인일자']
      const description = row['적요'] || row['가맹점명'] || row['가맹점'] || row['내용']
      let rawAmount = row['금액'] || row['이용금액'] || row['승인금액']

      if (!cardCompany || !rawDate || !description) return null

      if (typeof rawAmount === 'string') rawAmount = Number(rawAmount.replace(/,/g, ''))
      const transaction_date = normalizeDate(rawDate)
      if (!transaction_date) return null

      const companyName = String(cardCompany).trim()
      
      const setting = settings.find(s => 
        companyName.includes(s.card_company) || s.card_company.includes(companyName)
      )

      const payment_date = calculatePaymentDate(transaction_date, setting)

      let category_id: number | null = null
      for (const cat of categories) {
        if (cat.name === '기타') continue
        if (cat.keywords && cat.keywords.length > 0) {
            const isMatch = cat.keywords.some((k) => description.includes(k))
            if (isMatch) {
                category_id = cat.id
                break
            }
        }
      }
      if (!category_id) category_id = etcCategory?.id || null

      return {
        transaction_date,
        payment_date,
        card_company: companyName,
        description: String(description).trim(),
        amount: Number(rawAmount) || 0,
        category_id,
        status: 'confirmed',
      }
    })
    .filter((item) => item !== null)
}