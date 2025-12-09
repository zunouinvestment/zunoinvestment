// src/lib/sentiment.ts
export type Sentiment = 'positive' | 'negative' | 'neutral'

const positiveWords = [
  '상승',
  '급등',
  '호재',
  '강세',
  '사상 최고',
  '최고가',
  '수익',
  '호실적',
  '흑자',
  '개선',
  '확대',
]

const negativeWords = [
  '하락',
  '급락',
  '약세',
  '악재',
  '적자',
  '부진',
  '부정',
  '축소',
  '경고',
  '위기',
  '리스크',
]

// 뉴스 텍스트를 소문자/한글 기준으로 단순 스캔
export function simpleKoreanSentiment(text: string): Sentiment {
  const lower = text.toLowerCase()

  let posScore = 0
  let negScore = 0

  for (const w of positiveWords) {
    if (lower.includes(w)) posScore += 1
  }
  for (const w of negativeWords) {
    if (lower.includes(w)) negScore += 1
  }

  if (posScore === 0 && negScore === 0) return 'neutral'
  if (posScore > negScore) return 'positive'
  if (negScore > posScore) return 'negative'
  return 'neutral'
}
