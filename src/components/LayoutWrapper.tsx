// src/components/LayoutWrapper.tsx
'use client'

import { ReactNode, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import LogoutButton from '@/components/LogoutButton'

// lucide-react 아이콘
import {
  Home,
  FileText,
  BarChart3,
  Newspaper,
  Calendar,
  FileSpreadsheet,
  Wallet,
  PieChart, // ✅ 차트 아이콘 추가
} from 'lucide-react'

type NavItem = { name: string; href: string; icon: React.ReactNode }
type NavCategory = { title?: string; items: NavItem[] }

// ✅ 메뉴 구조 업데이트
const navMenu: NavCategory[] = [
  {
    items: [
      { name: 'Home', href: '/', icon: <Home className="w-4 h-4" /> },
    ],
  },
  {
    title: 'Investment',
    items: [
      { name: 'Now', href: '/now', icon: <BarChart3 className="w-4 h-4" /> },
      { name: 'Strategy', href: '/strategy', icon: <FileSpreadsheet className="w-4 h-4" /> },
      { name: 'Result', href: '/result', icon: <FileText className="w-4 h-4" /> },
      { name: 'History', href: '/history', icon: <Calendar className="w-4 h-4" /> },
      { name: 'News', href: '/news', icon: <Newspaper className="w-4 h-4" /> },
    ],
  },
  {
    title: 'Asset Management',
    items: [
      { name: 'Expense Tracker', href: '/expense-tracker', icon: <Wallet className="w-4 h-4" /> },
      // ✅ 리포트 메뉴 추가
      { name: 'Expense Report', href: '/expense-report', icon: <PieChart className="w-4 h-4" /> },
    ],
  },
]

export default function LayoutWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isLoginPage = pathname.startsWith('/login')

  // ✅ 상태
  const [menuOpen, setMenuOpen] = useState(false)
  const [displayName, setDisplayName] = useState<string>('')
  const [email, setEmail] = useState<string>('')
  const [loadingProfile, setLoadingProfile] = useState<boolean>(true)

  // ✅ 프로필 로드
  const loadProfile = async () => {
    setLoadingProfile(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setDisplayName('')
      setEmail('')
      setLoadingProfile(false)
      return
    }

    setEmail(user.email ?? '')

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single()

    setDisplayName(profile?.display_name || '')
    setLoadingProfile(false)
  }

  useEffect(() => {
    loadProfile()
  }, [])

  // 프로필 변경 브로드캐스트 수신
  useEffect(() => {
    const handler = () => loadProfile()
    window.addEventListener('profile-updated', handler as EventListener)
    return () => window.removeEventListener('profile-updated', handler as EventListener)
  }, [])

  // ESC로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 라우트 변경 시 닫기
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  // 이니셜
  const initials = useMemo(() => {
    const base = displayName || email || ''
    if (!base) return ''
    const parts = base.trim().split(/\s+/)
    const first = parts[0]?.[0] || ''
    const second = parts.length > 1 ? parts[1]?.[0] || '' : ''
    return (first + second).toUpperCase()
  }, [displayName, email])

  // 환영 문구
  const welcomeText = useMemo(() => {
    if (loadingProfile) return ''
    if (displayName) return `${displayName}님 환영합니다!`
    if (email) return `${email}님 환영합니다!`
    return ''
  }, [displayName, email, loadingProfile])

  // ✅ 활성 경로 매핑
  const activeMap = useMemo(() => {
    const map: Record<string, boolean> = {}
    navMenu.forEach((category) => {
      category.items.forEach((it) => {
        map[it.href] =
          pathname === it.href ||
          (it.href !== '/' && pathname.startsWith(it.href + '/'))
      })
    })
    return map
  }, [pathname])

  if (isLoginPage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        {children}
      </div>
    )
  }

  // ✅ 메뉴 렌더링 헬퍼
  const renderNavItems = () => (
    <>
      {navMenu.map((category, idx) => (
        <div key={idx} className="mb-2">
          {idx > 0 && (
            <div className="pt-2 pb-2">
              <div className="h-px bg-gray-100 mx-1 mb-3" />
              {category.title && (
                <div className="px-3 mb-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  {category.title}
                </div>
              )}
            </div>
          )}
          
          <ul className="space-y-1">
            {category.items.map((it) => {
              const active = !!activeMap[it.href]
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    onClick={() => setMenuOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={[
                      'group flex items-center gap-2 rounded-lg px-3 py-2 text-sm border transition-all',
                      active
                        ? 'bg-gray-100 border-gray-300 text-black'
                        : 'bg-white border-transparent text-gray-700 hover:bg-gray-50 hover:border-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300',
                    ].join(' ')}
                  >
                    {it.icon}
                    <span className="font-medium">{it.name}</span>
                    <span
                      className={[
                        'ml-auto h-4 w-1 rounded-full',
                        active ? 'bg-black' : 'bg-transparent group-hover:bg-gray-300',
                      ].join(' ')}
                    />
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </>
  )

  return (
    <>
      {/* 🔒 고정 헤더 */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white shadow-md border-b z-50">
        <div className="h-full px-4 md:px-6 flex items-center justify-between gap-3">
          <h1 className="font-bold font-shouting truncate text-[clamp(21px,3.5vw,25px)]">
            Buy low Sell high
          </h1>
          <div className="flex items-center gap-2 md:gap-3">
            <div className="hidden md:flex items-center">
              {loadingProfile ? (
                <div aria-hidden="true" className="h-9 w-48 rounded-full bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-pulse" />
              ) : welcomeText ? (
                <div className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full border bg-white shadow-sm">
                  <div
                    aria-hidden="true"
                    className="flex h-7 w-7 items-center justify-center rounded-full border bg-gradient-to-br from-gray-50 to-gray-100 text-xs font-semibold text-gray-700"
                    title={displayName || email}
                  >
                    {initials || 'U'}
                  </div>
                  <span className="text-[13px] font-medium text-gray-700">
                    <Link
                      href="/account"
                      className="text-blue-600 font-semibold underline decoration-2 underline-offset-2 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 rounded-sm px-0.5"
                      title="프로필/비밀번호 변경"
                    >
                      {displayName || email}
                    </Link>
                    님 환영합니다!
                  </span>
                </div>
              ) : null}
            </div>
            <LogoutButton />
            <button
              type="button"
              aria-label="메뉴 열기"
              className="md:hidden p-2 border rounded hover:bg-gray-50 active:scale-95 transition whitespace-nowrap text-[clamp(12px,3.5vw,14px)]"
              onClick={() => setMenuOpen(true)}
            >
              <span className="block w-5 h-0.5 bg-black mb-1" />
              <span className="block w-5 h-0.5 bg-black mb-1" />
              <span className="block w-5 h-0.5 bg-black" />
            </button>
          </div>
        </div>
      </header>

      {/* 헤더 높이만큼 여백 */}
      <div className="pt-16 flex min-h-screen">
        <aside className="hidden md:flex w-64 border-r bg-white flex-col">
          <nav className="px-3 py-4 flex-1 overflow-y-auto">
            {renderNavItems()}
          </nav>
          <div className="border-t px-4 py-3 text-[11px] text-gray-400">
            2025 by zuno
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>

      {menuOpen && (
        <button
          aria-label="메뉴 닫기"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 bg-black/30 backdrop-blur-[1px] md:hidden z-40"
        />
      )}

      <aside
        className={[
          'fixed top-16 right-0 h-[calc(100vh-64px)] w-64 bg-white border-l shadow-xl md:hidden z-50 overflow-y-auto',
          'transition-transform duration-300',
          menuOpen ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        <nav className="flex flex-col p-4 flex-1">
          {renderNavItems()}
        </nav>
        <div className="border-t px-4 py-3 text-[11px] text-gray-400">
          2025 by zuno
        </div>
      </aside>
    </>
  )
}