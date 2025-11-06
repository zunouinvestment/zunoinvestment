// src/app/result/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type ResultRow = {
  id: string;
  code: string;
  name: string;

  isSold: boolean;
  soldAt?: string | null;

  avgPrice: number;
  quantity: number;

  sellPrice: number;      // 매도가액
  realProfit: number;     // 실제 수익금 (입력)
  extraCost: number;      // 기타비용 (계산 또는 기존 값)
  buyDate?: string | null;

  currentPrice?: number;  // (옵션) 현재가 - KIS 시세
};

type StockItemFromDb = {
  id: string;
  user_id: string;
  code: string;
  name: string;
  is_sold: boolean;
  sold_at: string | null;
  avg_price: number | null;
  quantity: number | null;
  sell_price: number | null;
  extra_cost: number | null;
  real_profit: number | null;
  buy_date: string | null;
};

type KisPriceApiResponse = {
  code: string;
  currentPrice: number;
};

export default function ResultPage(): JSX.Element {
  const [userId, setUserId] = useState<string | null>(null);
  const [rows, setRows] = useState<ResultRow[]>([]);
  const rowsRef = useRef<ResultRow[]>([]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isAutoRefresh, setIsAutoRefresh] = useState(false); // 기본 OFF

  // ---------- 초기 로딩 ----------
  useEffect(() => {
    const load = async (): Promise<void> => {
      setIsInitialLoading(true);
      setErrorMsg(null);

      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (userError || !userData?.user) {
        setErrorMsg('로그인이 필요합니다.');
        setIsInitialLoading(false);
        return;
      }

      setUserId(userData.user.id);

      const { data, error } = await supabase
        .from('stock_items')
        .select(
          'id, user_id, code, name, is_sold, sold_at, avg_price, quantity, sell_price, extra_cost, real_profit, buy_date',
        )
        .eq('user_id', userData.user.id)
        .eq('is_sold', true)
        .order('sold_at', { ascending: false });

      if (error) {
        // eslint-disable-next-line no-console
        console.error('[Result] 초기 로딩 에러:', error);
        setErrorMsg(
          'Result 데이터를 불러오는 중 오류가 발생했습니다.',
        );
        setIsInitialLoading(false);
        return;
      }

      const mapped: ResultRow[] = (data as StockItemFromDb[]).map(
        (item) => ({
          id: item.id,
          code: item.code,
          name: item.name,
          isSold: item.is_sold,
          soldAt: item.sold_at,
          avgPrice: Number(item.avg_price ?? 0),
          quantity: Number(item.quantity ?? 0),
          sellPrice: Number(item.sell_price ?? 0),
          extraCost: Number(item.extra_cost ?? 0),
          realProfit: Number(item.real_profit ?? 0),
          buyDate: item.buy_date,
        }),
      );

      setRows(mapped);
      setIsInitialLoading(false);

      if (mapped.length > 0) {
        void refreshPricesOnce(mapped);
      }
    };

    void load();
  }, []);

  // ---------- 시세 갱신 ----------
  const refreshPricesOnce = async (
    targetRows?: ResultRow[],
  ): Promise<void> => {
    const latestRows = targetRows ?? rowsRef.current;
    if (latestRows.length === 0) return;

    try {
      const results = await Promise.allSettled(
        latestRows.map(async (row) => {
          const res = await fetch(
            `/api/kis/price?code=${encodeURIComponent(row.code)}`,
          );
          if (!res.ok) {
            throw new Error(
              `가격 조회 실패: ${row.code} (${res.status})`,
            );
          }
          const data =
            (await res.json()) as KisPriceApiResponse;
          return data;
        }),
      );

      const priceMap = new Map<string, KisPriceApiResponse>();
      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          const value = result.value;
          priceMap.set(value.code, value);
        } else {
          // eslint-disable-next-line no-console
          console.warn(
            '[Result] 시세 갱신 실패:',
            (result as any).reason,
          );
        }
      });

      setRows((prev) =>
        prev.map((row) => {
          const price = priceMap.get(row.code);
          if (!price) return row;
          return {
            ...row,
            currentPrice: price.currentPrice,
          };
        }),
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[Result] 시세 갱신 에러:', error);
      setErrorMsg('시세를 갱신하는 중 오류가 발생했습니다.');
    }
  };

  // ---------- 실시간 폴링 ----------
  useEffect(() => {
    if (!isAutoRefresh) return;

    let cancelled = false;

    const loop = async (): Promise<void> => {
      while (!cancelled) {
        const latest = rowsRef.current;
        if (latest.length > 0) {
          await refreshPricesOnce(latest);
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 2000);
        });
      }
    };

    void loop();
    return () => {
      cancelled = true;
    };
  }, [isAutoRefresh]);

  const handleRefreshOnceClick = async (): Promise<void> => {
    setErrorMsg(null);
    await refreshPricesOnce();
  };

  // ---------- 입력값 로컬 반영 ----------
  const handleNumberChange = (
    id: string,
    field: 'sellPrice' | 'realProfit',
    value: string,
  ): void => {
    const num = Number(value);
    setRows((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              [field]:
                Number.isNaN(num) || value === '' ? 0 : num,
            }
          : row,
      ),
    );
  };

  const handleDateChange = (
    id: string,
    field: 'buyDate',
    value: string,
  ): void => {
    setRows((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              [field]: value || null,
            }
          : row,
      ),
    );
  };

  // ---------- DB 저장 (blur 시) ----------
  const handleSaveRow = async (id: string): Promise<void> => {
    const row = rowsRef.current.find((r) => r.id === id);
    if (!row) return;

    setIsMutating(true);
    setErrorMsg(null);

    try {
      const avg = Number(row.avgPrice ?? 0);
      const qty = Number(row.quantity ?? 0);
      const sell = Number(row.sellPrice ?? 0);
      const real = Number(row.realProfit ?? 0);

      const buyBase = avg && qty ? avg * qty : 0;
      const totalSell = sell && qty ? sell * qty : 0;

      // 기타비용 = 총매도액 - 매수금액 - 실제수익
      const extraCost =
        buyBase > 0 || totalSell > 0 || real !== 0
          ? totalSell - buyBase - real
          : 0;

      const { error } = await supabase
        .from('stock_items')
        .update({
          sell_price: sell,
          real_profit: real,
          extra_cost: extraCost,
          buy_date: row.buyDate || null,
        })
        .eq('id', id);

      if (error) {
        // eslint-disable-next-line no-console
        console.error(
          '[Result] handleSaveRow Supabase error:',
          error,
        );
        throw error;
      }

      // 로컬에도 extraCost 반영
      setRows((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, extraCost } : r,
        ),
      );
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error(
        '[Result] handleSaveRow JS error:',
        error?.message ?? error,
      );
      setErrorMsg(
        'Result 데이터를 저장하는 중 오류가 발생했습니다.',
      );
    } finally {
      setIsMutating(false);
    }
  };

  // ---------- 매도완료 토글 (Result에서도 변경 가능) ----------
  const handleToggleSold = async (
    row: ResultRow,
  ): Promise<void> => {
    setIsMutating(true);
    setErrorMsg(null);

    const now = new Date().toISOString();
    const newIsSold = !row.isSold;

    try {
      const { data, error } = await supabase
        .from('stock_items')
        .update({
          is_sold: newIsSold,
          sold_at: newIsSold ? now : null,
        })
        .eq('id', row.id)
        .select('*')
        .single();

      if (error) {
        // eslint-disable-next-line no-console
        console.error(
          '[Result] handleToggleSold Supabase error:',
          error,
        );
        throw error;
      }

      const updated = data as StockItemFromDb;

      // is_sold=false로 변경되면 Result 화면에서 제거
      setRows((prev) =>
        prev
          .map((r) =>
            r.id === updated.id
              ? {
                  ...r,
                  isSold: updated.is_sold,
                  soldAt: updated.sold_at,
                }
              : r,
          )
          .filter((r) => r.isSold),
      );
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error(
        '[Result] handleToggleSold JS error:',
        error?.message ?? error,
      );
      setErrorMsg(
        '매도완료 상태를 변경하는 중 오류가 발생했습니다.',
      );
    } finally {
      setIsMutating(false);
    }
  };

  // ---------- 포맷터 ----------
  const formatNumber = (
    value: number | undefined,
    digits = 0,
  ): string => {
    if (value === null || value === undefined) return '-';
    if (Number.isNaN(value)) return '-';
    const n = Number(value);
    if (digits > 0) {
      return n.toLocaleString(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
    }
    return n.toLocaleString();
  };

  const formatProfitSigned = (
    value: number,
  ): { text: string; className: string } => {
    if (!value) {
      return { text: '0', className: 'text-gray-500' };
    }
    const sign = value > 0 ? '+' : '-';
    const absVal = Math.abs(value);
    const text = `${sign}${absVal.toLocaleString()}`;
    const className =
      value > 0 ? 'text-red-600' : 'text-blue-600';
    return { text, className };
  };

  const formatPercent = (
    value: number | undefined,
  ): { text: string; className: string } => {
    if (value === null || value === undefined) {
      return { text: '-', className: 'text-gray-500' };
    }
    if (Number.isNaN(value)) {
      return { text: '-', className: 'text-gray-500' };
    }

    let className = 'text-gray-500';
    if (value > 0) className = 'text-red-600';
    else if (value < 0) className = 'text-blue-600';

    const sign = value > 0 ? '+' : value < 0 ? '' : '';
    const text = `${sign}${value.toFixed(2)}%`;
    return { text, className };
  };

  const getProfitColorClass = (
    value: number | undefined,
  ): string => {
    if (value === null || value === undefined) {
      return 'text-gray-500';
    }
    if (value > 0) return 'text-red-600';
    if (value < 0) return 'text-blue-600';
    return 'text-gray-500';
  };

  // ---------- 계산 로직 ----------
  const computeMetrics = (row: ResultRow) => {
    const {
      avgPrice,
      quantity,
      sellPrice,
      extraCost,
      realProfit,
      buyDate,
      soldAt,
    } = row;

    const avg = Number(avgPrice ?? 0);
    const qty = Number(quantity ?? 0);
    const sell = Number(sellPrice ?? 0);
    const extra = Number(extraCost ?? 0);
    const real = Number(realProfit ?? 0);

    const buyBase = avg && qty ? avg * qty : 0;
    const totalSell = sell && qty ? sell * qty : 0;

    // 1순위: 입력된 실수익(real_profit)이 있으면 그걸 사용
    const hasRealProfit = real !== 0;
    const profitAmount = hasRealProfit
      ? real
      : totalSell - buyBase - extra;

    // 기타비용 표시값
    const extraToShow = hasRealProfit
      ? totalSell - buyBase - real
      : extra;

    const profitRate =
      buyBase > 0
        ? (profitAmount / buyBase) * 100
        : undefined;

    // 보유기간
    let holdingDays: number | undefined;
    if (buyDate && soldAt) {
      const buy = new Date(buyDate);
      const sellD = new Date(soldAt);
      const diffMs = sellD.getTime() - buy.getTime();
      const days = diffMs / (1000 * 60 * 60 * 24);
      if (!Number.isNaN(days) && days >= 0) {
        holdingDays = Math.max(1, Math.floor(days)); // 최소 1일
      }
    }

    const dailyProfit =
      holdingDays && holdingDays > 0
        ? profitAmount / holdingDays
        : undefined;

    return {
      buyBase,
      totalSell,
      profitAmount,
      profitRate,
      extraToShow,
      holdingDays,
      dailyProfit,
    };
  };

  // ---------- 렌더링 ----------
  return (
    <div className="flex flex-col gap-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-2xl font-bold">
            Result – 매도 결과 관리
          </h1>
          <p className="mt-1 text-sm sm:text-base text-gray-600">
            매도가, 실제 수익금(세금/수수료 반영된 값)을 입력하면
            총매도액·기타비용·수익률·수익금·보유기간·일수익이 계산됩니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm sm:text-base font-medium text-gray-700"
            onClick={() =>
              setIsAutoRefresh((prev) => !prev)
            }
          >
            시세 자동 갱신:{' '}
            <span
              className={
                isAutoRefresh
                  ? 'text-emerald-600'
                  : 'text-gray-500'
              }
            >
              {isAutoRefresh ? 'ON' : 'OFF'}
            </span>
          </button>

          <button
            type="button"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm sm:text-base font-medium text-gray-700"
            onClick={() => {
              void handleRefreshOnceClick();
            }}
          >
            시세 수동 갱신
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm sm:text-base text-red-700">
          {errorMsg}
        </div>
      )}

      {isInitialLoading ? (
        <div className="rounded-md border border-gray-200 bg-white px-3 py-4 text-center text-sm sm:text-base text-gray-500 shadow-sm">
          Result 데이터를 불러오는 중입니다...
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-gray-200 bg-white px-3 py-4 text-center text-sm sm:text-base text-gray-500 shadow-sm">
          아직 매도완료된 종목이 없습니다. Strategy 화면에서 매도완료로
          표시하면 여기에 나타납니다.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => {
            const {
              buyBase,
              totalSell,
              profitAmount,
              profitRate,
              extraToShow,
              holdingDays,
              dailyProfit,
            } = computeMetrics(row);

            const {
              text: profitSignedText,
              className: profitSignedClass,
            } = formatProfitSigned(profitAmount);

            const {
              text: profitRateText,
              className: profitRateClass,
            } = formatPercent(profitRate);

            const dailyProfitClass =
              getProfitColorClass(dailyProfit);

            return (
              <div
                key={row.id}
                className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-sm sm:text-base"
              >
                {/* 헤더: 종목 / 매도완료 / 매수·매도일 */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base sm:text-lg font-semibold">
                        {row.name}
                      </span>
                      <span className="text-xs sm:text-sm text-gray-500">
                        {row.code}
                      </span>
                    </div>

                    {/* 매수일 / 매도일 한 줄 */}
                    <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-gray-600">
                      {row.buyDate && (
                        <span className="rounded-full bg-gray-100 px-2 py-[2px] text-[11px] sm:text-xs text-gray-700">
                          매수일 {row.buyDate}
                        </span>
                      )}
                      {row.soldAt && (
                        <span className="rounded-full bg-gray-100 px-2 py-[2px] text-[11px] sm:text-xs text-gray-700">
                          매도일{' '}
                          {new Date(
                            row.soldAt,
                          ).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 text-xs sm:text-sm">
                    <label className="inline-flex items-center gap-1 text-gray-700">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={row.isSold}
                        disabled={isMutating}
                        onChange={() => {
                          void handleToggleSold(row);
                        }}
                      />
                      <span>매도완료</span>
                    </label>
                  </div>
                </div>

                {/* 시세 / 손익 핵심 숫자 (2열 그리드, 줄 맞추기) */}
                <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm">
                  {/* 현재가 / 매도가액 */}
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-gray-500">
                      현재가
                    </span>
                    <span>
                      {formatNumber(row.currentPrice)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-gray-500">
                      매도가액
                    </span>
                    <span>
                      {formatNumber(row.sellPrice)}
                    </span>
                  </div>

                  {/* 총매도액 / 매수금액(기준) */}
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-gray-500">
                      총매도액
                    </span>
                    <span>
                      {totalSell
                        ? formatNumber(totalSell)
                        : '-'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-gray-500">
                      매수금액(기준)
                    </span>
                    <span>
                      {buyBase
                        ? formatNumber(buyBase)
                        : '-'}
                    </span>
                  </div>

                  {/* 기타비용 / 보유기간(일) */}
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-gray-500">
                      기타비용
                    </span>
                    <span>
                      {extraToShow
                        ? formatNumber(extraToShow)
                        : '0'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-gray-500">
                      보유기간(일)
                    </span>
                    <span>
                      {holdingDays ?? '-'}
                    </span>
                  </div>

                  {/* 수익률 / 수익금액 → 같은 줄에 나란히 */}
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-gray-500">
                      수익률
                    </span>
                    <span className={profitRateClass}>
                      {profitRateText}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-gray-500">
                      수익금액
                    </span>
                    <span className={profitSignedClass}>
                      {profitSignedText}
                    </span>
                  </div>

                  {/* 일수익 / (비워두거나 여유 칸) */}
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-gray-500">
                      일수익
                    </span>
                    <span className={dailyProfitClass}>
                      {dailyProfit
                        ? formatNumber(dailyProfit)
                        : '-'}
                    </span>
                  </div>
                </div>

                {/* 입력 영역: 매도가액 / 실제 수익금 / 매수일 */}
                <div className="rounded-lg bg-gray-50 p-3 text-xs sm:text-sm">
                  <div className="mb-2 text-xs font-semibold text-gray-600">
                    입력 / 수정
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-0.5">
                      <span className="text-xs text-gray-500">
                        매도가액
                      </span>
                      <input
                        type="number"
                        className="w-full rounded border px-2 py-1 text-right text-xs sm:text-sm"
                        value={
                          Number.isNaN(row.sellPrice)
                            ? ''
                            : row.sellPrice
                        }
                        step="1"
                        onChange={(e) =>
                          handleNumberChange(
                            row.id,
                            'sellPrice',
                            e.target.value,
                          )
                        }
                        onBlur={() => {
                          void handleSaveRow(row.id);
                        }}
                      />
                    </label>

                    <label className="flex flex-col gap-0.5">
                      <span className="text-xs text-gray-500">
                        실제 수익금(세후)
                      </span>
                      <input
                        type="number"
                        className="w-full rounded border px-2 py-1 text-right text-xs sm:text-sm"
                        value={
                          Number.isNaN(row.realProfit)
                            ? ''
                            : row.realProfit
                        }
                        step="1"
                        onChange={(e) =>
                          handleNumberChange(
                            row.id,
                            'realProfit',
                            e.target.value,
                          )
                        }
                        onBlur={() => {
                          void handleSaveRow(row.id);
                        }}
                      />
                    </label>

                    <label className="flex flex-col gap-0.5">
                      <span className="text-xs text-gray-500">
                        매수일
                      </span>
                      <input
                        type="date"
                        className="w-full rounded border px-2 py-1 text-xs sm:text-sm"
                        value={row.buyDate ?? ''}
                        onChange={(e) =>
                          handleDateChange(
                            row.id,
                            'buyDate',
                            e.target.value,
                          )
                        }
                        onBlur={() => {
                          void handleSaveRow(row.id);
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
