// ✅ src/app/page.tsx
// 메인페이지!!!!! 제일 배경임!!

'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'

interface WeatherData {
  current: { condition: { text: string; icon: string }; temp_c: number }
  location: { name: string }
}

// 🔹 외부/내부 링크 분리
const externalLinks = [
  { name: '금융투자협회', url: 'https://www.kofiabond.or.kr/' },
  { name: '금융통계정보시스템', url: 'https://fisis.fss.or.kr/' },
  { name: 'DART', url: 'http://dart.fss.or.kr/' },
  { name: '금융감독원', url: 'https://www.fss.or.kr/' },
  { name: '금융위원회', url: 'https://www.fsc.go.kr/' },
  { name: '한국은행', url: 'https://www.bok.or.kr/' },
  { name: '한국거래소', url: 'https://www.krx.co.kr/' },
  { name: '금융보안원', url: 'https://edu.fsec.or.kr/' },
  { name: '금융투자교육원', url: 'https://www.kifin.or.kr/' },
  { name: 'Chatgpt', url: 'https://chatgpt.com/' },
]

const internalLinks = [
  { name: 'Circle', url: 'https://hisc.circle.hanwha.com/' },
  { name: '외부메일', url: 'https://mail.hanwhawm.com/' },
  { name: '채널H', url: 'https://chhplus.hanwha.com/' },
]

function formatKoreanDate(d: Date) {
  const days = ['일', '월', '화', '수', '목', '금', '토']
  const dayName = days[d.getDay()]
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${dayName})`
}
const pad = (n: number) => n.toString().padStart(2, '0')

export default function Home() {
  const dueDate = new Date(2026, 11, 7) // 2026-12-07
  const totalPregnancyDays = 280

  // ✅ 초기값을 null로 두고, 클라이언트 마운트 이후에만 시간 계산
  const [now, setNow] = useState<Date | null>(null)
  const [weather, setWeather] = useState<WeatherData | null>(null)

  // 마운트 후 now 세팅 + 1초 갱신
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const { dateText, timeText, remainingText } = useMemo(() => {
    if (!now) {
      return { dateText: '', timeText: '', remainingText: '' }
    }
    const dateText = formatKoreanDate(now)
    const timeText = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`

    const endTime = new Date(now)
    endTime.setHours(17, 30, 0, 0)
    const diffMs = endTime.getTime() - now.getTime()
    let remainingText = ''
    if (diffMs <= 0) {
      remainingText = '퇴근 시간이 지났어요! 🎉'
    } else {
      const s = Math.floor(diffMs / 1000)
      const h = Math.floor(s / 3600)
      const m = Math.floor((s % 3600) / 60)
      const sec = s % 60
      remainingText = `${h}시간 ${m}분 ${sec}초 남음`
    }
    return { dateText, timeText, remainingText }
  }, [now])

  const { pregnancyWeekText, daysToMeetText } = useMemo(() => {
    if (!now) {
      return { pregnancyWeekText: '', daysToMeetText: '' }
    }

    const startOfToday = new Date(now)
    startOfToday.setHours(0, 0, 0, 0)

    const dueStart = new Date(dueDate)
    dueStart.setHours(0, 0, 0, 0)

    const diffMs = dueStart.getTime() - startOfToday.getTime()
    const daysUntilDue = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    const elapsedDays = totalPregnancyDays - daysUntilDue

    if (daysUntilDue < 0) {
      const overdueDays = Math.abs(daysUntilDue)
      return {
        pregnancyWeekText: `예정일이 ${overdueDays}일 지났어요`,
        daysToMeetText: '아기를 만나러 가는 중이에요 👶',
      }
    }

    const safeElapsedDays = Math.max(0, elapsedDays)
    const week = Math.floor(safeElapsedDays / 7)
    const day = safeElapsedDays % 7

    return {
      pregnancyWeekText: `현재 ${week}주 ${day}일`,
      daysToMeetText: `아기 만나기까지 ${daysUntilDue}일 남음`,
    }
  }, [now, dueDate])

  // 날씨는 클라이언트에서만 호출
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const res = await fetch('/api/weather')
        if (!res.ok) throw new Error('weather api error')
        const data = (await res.json()) as WeatherData
        setWeather(data)
      } catch (err) {
        console.error('날씨 정보를 불러오는 데 실패했습니다:', err)
      }
    }
    fetchWeather()
  }, [])

  return (
    <div className="min-h-[calc(100vh-4rem)] p-4 sm:p-6 xl:p-8 bg-white text-black">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mb-6"
      >
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          💸 Invest in something!
        </h1>
        <p className="mt-1 text-sm text-gray-500">Money is coined liberty.</p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
        {/* 날짜/시간 카드 */}
        <Card enterDelay={0.05}>
          <div className="flex items-start justify-between gap-2">
            <CardTitle>오늘</CardTitle>
            <Badge>Now</Badge>
          </div>

          <div className="mt-4">
            {/* SSR과의 불일치 경고 억제 */}
            <div className="text-lg text-gray-700" suppressHydrationWarning>
              {dateText || ' '}
            </div>
            <div
              className="mt-1 text-4xl md:text-5xl font-bold tracking-tight"
              suppressHydrationWarning
            >
              {timeText || '--:--:--'}
            </div>
          </div>
        </Card>

        {/* 임신 주수 카드 */}
        <Card
          enterDelay={0.12}
          className="bg-gradient-to-br from-rose-50 via-pink-50 to-indigo-50 border-rose-100"
        >
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <CardTitle>👶 뽀니 카운트다운</CardTitle>
            <Badge>✨ D-Day</Badge>
          </div>
          <div className="mt-4">
            <div className="flex items-center gap-2">
              <motion.span
                aria-hidden
                animate={{ y: [0, -4, 0], rotate: [0, -6, 0, 6, 0] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                className="text-xl"
              >
                🐴
              </motion.span>
              <motion.p
                className="text-xl sm:text-2xl font-bold tracking-tight text-rose-600 leading-tight break-words"
                suppressHydrationWarning
                animate={{ scale: [1, 1.03, 1] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              >
                {pregnancyWeekText || ' '}
              </motion.p>
            </div>
            <p className="mt-2 text-base sm:text-lg text-gray-700 break-words" suppressHydrationWarning>
              {daysToMeetText || ' '}
            </p>
            <div className="mt-3 inline-flex max-w-full w-fit flex-wrap items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs sm:text-sm text-gray-700 border border-rose-100 leading-relaxed">
              <span>🍼</span>
              <span>출산 예정일: 2026년 12월 7일</span>
            </div>
            <p className="mt-3 text-sm text-pink-500">💗 하루하루 소중한 기다림, 곧 만나요!</p>
          </div>
        </Card>

        {/* 퇴근 카운트다운 카드 */}
        <Card enterDelay={0.18}>
          <CardTitle>퇴근까지</CardTitle>
          <div className="mt-4 text-lg" suppressHydrationWarning>
            {remainingText || ' '}
          </div>
          <p className="mt-2 text-sm text-gray-500">오늘도 파이팅입니다 💪</p>
        </Card>

        {/* 날씨 카드 */}
        <Card enterDelay={0.22} className="xl:col-span-1 lg:col-span-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle>오늘의 날씨</CardTitle>
            <Badge>Live</Badge>
          </div>
          {weather ? (
            <div className="mt-4 flex items-center gap-4">
              <Image
                src={`https:${weather.current.condition.icon}`}
                alt="날씨"
                width={56}
                height={56}
                className="shrink-0"
              />
              <div>
                <p className="text-lg font-semibold">{weather.current.condition.text}</p>
                <p className="text-sm text-gray-600 break-words">
                  {weather.current.temp_c}℃ · {weather.location.name}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-500">날씨 정보를 불러오는 중이에요…</p>
          )}
        </Card>

      </div>
    </div>
  )
}

/* ---------------- UI 프리미티브 ---------------- */

function Card({
  children,
  className = '',
  enterDelay = 0,
}: {
  children: React.ReactNode
  className?: string
  enterDelay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, delay: enterDelay }}
      className={[
        'rounded-2xl bg-white',
        'shadow-[0_2px_30px_rgba(0,0,0,0.06)]',
        'border border-gray-200',
        'p-4 sm:p-5 md:p-6',
        className,
      ].join(' ')}
    >
      {children}
    </motion.div>
  )
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base sm:text-lg font-semibold tracking-tight">{children}</h2>
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-gray-200 px-2.5 py-0.5 text-xs text-gray-500">
      {children}
    </span>
  )
}
