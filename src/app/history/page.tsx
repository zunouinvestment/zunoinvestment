'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type HistorySourceRow = {
  sold_at: string | null;
  avg_price: number | null;
  quantity: number | null;
  sell_price: number | null;
  extra_cost: number | null;
  real_profit: number | null;
  name: string;
  code: string;
};

type MonthlySummary = {
  year: number;
  month: number;
  profitSum: number;
};

type DetailRow = {
  year: number;
  month: number;
  day: number;
  name: string;
  code: string;
  profitSum: number;
};

export default function HistoryPage(): JSX.Element {
  const [userId, setUserId] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();
  const [startDate, setStartDate] = useState<string>(
    `${currentYear}-01-01`,
  );
  const [endDate, setEndDate] = useState<string>(
    `${currentYear}-12-31`,
  );

  const [isDetail, setIsDetail] = useState<boolean>(false);
  const [monthly, setMonthly] = useState<MonthlySummary[]>([]);
  const [details, setDetails] = useState<DetailRow[]>([]);
  const [totalProfit, setTotalProfit] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isQuerying, setIsQuerying] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const hasLoadedRef = useRef<boolean>(false);

  // ---------- 로그인 유저 확인 ----------
  useEffect(() => {
    const loadUser = async (): Promise<void> => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user) {
        setErrorMsg('로그인이 필요합니다.');
        setIsLoading(false);
        return;
      }
      setUserId(data.user.id);
    };

    void loadUser();
  }, []);

  // ---------- 수익 계산 유틸 ----------
  const calcProfitForRow = (row: HistorySourceRow): number => {
    // 1순위: real_profit (실제 수익금) 사용
    if (
      row.real_profit !== null &&
      row.real_profit !== undefined &&
      !Number.isNaN(Number(row.real_profit))
    ) {
      return Number(row.real_profit);
    }

    // 2순위: 과거 방식 역산
    const avg = Number(row.avg_price ?? 0);
    const qty = Number(row.quantity ?? 0);
    const sell = Number(row.sell_price ?? 0);
    const extra = Number(row.extra_cost ?? 0);

    if (!avg || !qty || !sell) return 0;

    const buyBase = avg * qty;
    const totalSell = sell * qty;
    return totalSell - buyBase - extra;
  };

  // ---------- 히스토리 조회 ----------
  const loadHistory = async (): Promise<void> => {
    if (!userId) return;
    if (!startDate || !endDate) return;

    setIsQuerying(true);
    setErrorMsg(null);

    try {
      const from = `${startDate}T00:00:00`;
      const to = `${endDate}T23:59:59`;

      const { data, error } = await supabase
        .from('stock_items')
        .select(
          'sold_at, avg_price, quantity, sell_price, extra_cost, real_profit, name, code',
        )
        .eq('user_id', userId)
        .eq('is_sold', true)
        .gte('sold_at', from)
        .lte('sold_at', to)
        .order('sold_at', { ascending: true });

      if (error) {
        console.error('[History] Supabase error:', error);
        throw error;
      }

      const rows = (data as HistorySourceRow[]) ?? [];

      const monthlyMap = new Map<string, MonthlySummary>();
      const detailMap = new Map<string, DetailRow>();
      let total = 0;

      rows.forEach((row) => {
        if (!row.sold_at) return;

        const soldDate = new Date(row.sold_at);
        if (Number.isNaN(soldDate.getTime())) return;

        const year = soldDate.getFullYear();
        const month = soldDate.getMonth() + 1;
        const day = soldDate.getDate();

        const profit = calcProfitForRow(row);
        if (!profit && profit !== 0) return;

        total += profit;

        // 월별 집계
        const monthKey = `${year}-${month}`;
        const monthPrev = monthlyMap.get(monthKey);
        if (monthPrev) {
          monthPrev.profitSum += profit;
        } else {
          monthlyMap.set(monthKey, {
            year,
            month,
            profitSum: profit,
          });
        }

        // 상세 집계 (연/월/일/종목)
        const detailKey = `${year}-${month}-${day}-${row.code}`;
        const detailPrev = detailMap.get(detailKey);
        if (detailPrev) {
          detailPrev.profitSum += profit;
        } else {
          detailMap.set(detailKey, {
            year,
            month,
            day,
            name: row.name,
            code: row.code,
            profitSum: profit,
          });
        }
      });

      const monthlyArr = Array.from(monthlyMap.values()).sort(
        (a, b) => {
          if (a.year !== b.year) return a.year - b.year;
          return a.month - b.month;
        },
      );

      const detailArr = Array.from(detailMap.values()).sort(
        (a, b) => {
          if (a.year !== b.year) return a.year - b.year;
          if (a.month !== b.month) return a.month - b.month;
          if (a.day !== b.day) return a.day - b.day;
          if (a.name !== b.name) return a.name.localeCompare(b.name);
          return a.code.localeCompare(b.code);
        },
      );

      setMonthly(monthlyArr);
      setDetails(detailArr);
      setTotalProfit(total);
    } catch (error: unknown) {
      console.error(
        '[History] JS error:',
        error instanceof Error ? error.message : error,
      );
      setErrorMsg(
        'History 데이터를 불러오는 중 오류가 발생했습니다.',
      );
    } finally {
      setIsQuerying(false);
      setIsLoading(false);
      hasLoadedRef.current = true;
    }
  };

  // 최초 로딩 시 한 번 조회
  useEffect(() => {
    if (!userId) return;
    if (hasLoadedRef.current) return;
    void loadHistory();
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- 포맷터 ----------
  const formatProfit = (
    value: number,
  ): { text: string; className: string } => {
    if (value === 0) {
      return { text: '0', className: 'text-gray-500' };
    }
    const sign = value > 0 ? '+' : '-';
    const absVal = Math.abs(value);
    const text = `${sign}${absVal.toLocaleString()}`;
    const className =
      value > 0 ? 'text-red-600' : 'text-blue-600';
    return { text, className };
  };

  const handleSubmit = async (
    e: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    e.preventDefault();
    await loadHistory();
  };

  // ---------- 렌더링 ----------
  return (
    <div className="flex flex-col gap-4 p-3 sm:p-4">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-2xl font-bold">
            History – 기간별 수익 현황
          </h1>
          <p className="mt-1 text-sm sm:text-base text-gray-600">
            매도완료된 종목의{' '}
            <span className="font-semibold">실제 수익금</span>
            을 기준으로, 기간별(월/일/종목) 수익 합계를 볼 수 있는 화면입니다.
          </p>
        </div>
      </div>

      {/* 필터 영역 */}
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-3 sm:p-4 shadow-sm"
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col">
            <label className="text-xs sm:text-sm text-gray-600">
              시작일
            </label>
            <input
              type="date"
              className="rounded border px-2 py-1 text-xs sm:text-sm"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs sm:text-sm text-gray-600">
              종료일
            </label>
            <input
              type="date"
              className="rounded border px-2 py-1 text-xs sm:text-sm"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <label className="mt-2 flex items-center gap-2 text-xs sm:text-sm text-gray-700">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={isDetail}
              onChange={(e) =>
                setIsDetail(e.target.checked)
              }
            />
            <span>상세검색 (연/월/일/종목별 보기)</span>
          </label>

          <button
            type="submit"
            className="ml-auto rounded-md bg-blue-600 px-3 py-1.5 text-xs sm:text-sm font-semibold text-white shadow-sm disabled:opacity-60"
            disabled={isQuerying}
          >
            {isQuerying ? '조회 중...' : '조회'}
          </button>
        </div>

        {/* 총 수익 */}
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm sm:text-base">
          <span className="text-xs sm:text-sm text-gray-600">
            조회 기간 총 수익
          </span>
          {(() => {
            const { text, className } = formatProfit(totalProfit);
            return (
              <span className={`text-base sm:text-lg font-semibold ${className}`}>
                {text}
              </span>
            );
          })()}
        </div>
      </form>

      {/* 에러 표시 */}
      {errorMsg && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm sm:text-base text-red-700">
          {errorMsg}
        </div>
      )}

      {/* 로딩 / 데이터 없음 / 결과 */}
      {isLoading ? (
        <div className="rounded-md border border-gray-200 bg-white px-3 py-4 text-center text-sm sm:text-base text-gray-500 shadow-sm">
          History 데이터를 불러오는 중입니다...
        </div>
      ) : monthly.length === 0 ? (
        <div className="rounded-md border border-gray-200 bg-white px-3 py-4 text-center text-sm sm:text-base text-gray-500 shadow-sm">
          조회된 매도 이력이 없습니다. 기간과 매도완료 상태를 확인해 보세요.
        </div>
      ) : (
        <>
          {/* 월별 요약 테이블 */}
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full text-left text-xs sm:text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-3 py-2">연도</th>
                  <th className="px-3 py-2">월</th>
                  <th className="px-3 py-2 text-right">
                    수익(합계)
                  </th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((m) => {
                  const { text, className } = formatProfit(
                    m.profitSum,
                  );
                  return (
                    <tr key={`${m.year}-${m.month}`} className="border-t">
                      <td className="px-3 py-2">
                        {m.year}
                      </td>
                      <td className="px-3 py-2">
                        {m.month}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className={className}>
                          {text}
                        </span>
                      </td>
                    </tr>
                  );
                })}

                {/* 합계 행 */}
                <tr className="border-t bg-gray-50 font-semibold">
                  <td className="px-3 py-2">합계</td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-right">
                    {(() => {
                      const { text, className } = formatProfit(
                        totalProfit,
                      );
                      return (
                        <span className={className}>
                          {text}
                        </span>
                      );
                    })()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 상세 테이블 (상세검색 ON일 때만) */}
          {isDetail && (
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
              <table className="min-w-full text-left text-xs sm:text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-3 py-2">연도</th>
                    <th className="px-3 py-2">월</th>
                    <th className="px-3 py-2">일</th>
                    <th className="px-3 py-2">종목</th>
                    <th className="px-3 py-2 text-right">
                      수익(합계)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {details.map((d, idx) => {
                    const { text, className } = formatProfit(
                      d.profitSum,
                    );
                    return (
                      <tr
                        key={`${d.year}-${d.month}-${d.day}-${d.code}-${idx}`}
                        className="border-t"
                      >
                        <td className="px-3 py-2">
                          {d.year}
                        </td>
                        <td className="px-3 py-2">
                          {d.month}
                        </td>
                        <td className="px-3 py-2">
                          {d.day}
                        </td>
                        <td className="px-3 py-2">
                          {d.name}{' '}
                          <span className="text-[11px] text-gray-500">
                            ({d.code})
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className={className}>
                            {text}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
