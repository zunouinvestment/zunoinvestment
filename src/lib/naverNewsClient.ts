// src/lib/naverNewsClient.ts
const NAVER_CLIENT_ID = process.env.NAVER_NEWS_CLIENT_ID
const NAVER_CLIENT_SECRET = process.env.NAVER_NEWS_CLIENT_SECRET

if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
  // 서버 시작 시 바로 터뜨려서 설정 누락을 빨리 알 수 있게
  throw new Error(
    '[naverNewsClient] NAVER_NEWS_CLIENT_ID 또는 NAVER_NEWS_CLIENT_SECRET 이 설정되어 있지 않습니다.'
  )
}

export type NaverNewsItem = {
  title: string
  originallink: string
  link: string
  description: string
  pubDate: string
}

type NaverNewsResponse = {
  lastBuildDate: string
  total: number
  start: number
  display: number
  items: NaverNewsItem[]
}

export async function fetchNaverNewsByKeyword(
  keyword: string,
  options?: { display?: number; start?: number; sort?: 'sim' | 'date' }
): Promise<NaverNewsItem[]> {
  const display = options?.display ?? 20 // 기사 수 최대 20개 정도
  const start = options?.start ?? 1
  const sort = options?.sort ?? 'date' // 최신순

  const query = encodeURIComponent(keyword)
  const url = `https://openapi.naver.com/v1/search/news.json?query=${query}&display=${display}&start=${start}&sort=${sort}`

  // 🔧 HeadersInit에 맞게 타입을 확실히 string으로 지정
  const headers: HeadersInit = {
    'X-Naver-Client-Id': NAVER_CLIENT_ID as string,
    'X-Naver-Client-Secret': NAVER_CLIENT_SECRET as string,
  }

  const res = await fetch(url, {
    method: 'GET',
    headers,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    // eslint-disable-next-line no-console
    console.error(
      `[naverNewsClient] 네이버 뉴스 조회 실패: ${res.status} ${res.statusText} ${text}`
    )
    throw new Error(
      `네이버 뉴스 API 호출 실패 (status: ${res.status}, statusText: ${res.statusText})`
    )
  }

  const data = (await res.json()) as NaverNewsResponse
  return data.items ?? []
}
