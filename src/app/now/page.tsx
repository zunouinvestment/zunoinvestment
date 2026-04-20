'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type NowRow = {
  id: string;
  code: string;
  name: string;
  isRealBuy: boolean;
  isSold: boolean;
  buyDate?: string | null;

  currentPrice?: number | string;
  changeRate?: number | string;
};

type StockItemFromDb = {
  id: string;
  user_id: string;
  code: string;
  name: string;
  is_real_buy: boolean;
  is_sold: boolean;
  sold_at: string | null;
  avg_price: number | null;
  quantity: number | null;
  buy_date: string | null;
  created_at: string;
  updated_at: string;
};

type KisPriceApiResponse = {
  code: string;
  name?: string;
  currentPrice: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  changeRate: number;
  changePrice?: number;
};

type StockSearchItem = {
  code: string;
  name: string;
  market: string | null;
};

type StocksSearchApiResponse = {
  items?: StockSearchItem[];
  error?: string;
};

type DailyTrendRow = {
  date: string;
  close: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  foreignNet: number | null;
  institutionNet: number | null;
};

type KisHistoryApiResponse = {
  code: string;
  rows: DailyTrendRow[];
  error?: string;
};

export default function NowPage() {
  const [userId, setUserId] = useState<string | null>(null);

  const [rows, setRows] = useState<NowRow[]>([]);
  const rowsRef = useRef<NowRow[]>([]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const [isInitialLoading, setIsInitialLoading] =
    useState<boolean>(true);
  const [isMutating, setIsMutating] =
    useState<boolean>(false);
  const [errorMsg, setErrorMsg] =
    useState<string | null>(null);

  const [isAutoRefresh, setIsAutoRefresh] =
    useState<boolean>(false);
  const [selectedRowId, setSelectedRowId] =
    useState<string | null>(null);
  const [detailLoadingCode, setDetailLoadingCode] =
    useState<string | null>(null);
  const [detailMap, setDetailMap] = useState<
    Record<string, DailyTrendRow[]>
  >({});
  const [chartWindowSize, setChartWindowSize] =
    useState<number>(40);
  const [hoveredCandleIdx, setHoveredCandleIdx] =
    useState<number | null>(null);
  const [showCloseLine, setShowCloseLine] =
    useState<boolean>(true);

  // 검색 팝업 상태
  const [isSearchOpen, setIsSearchOpen] =
    useState<boolean>(false);
  const [searchKeyword, setSearchKeyword] =
    useState<string>('');
  const [searchResults, setSearchResults] = useState<
    StockSearchItem[]
  >([]);
  const [searchError, setSearchError] =
    useState<string | null>(null);
  const [isSearching, setIsSearching] =
    useState<boolean>(false);

  // ---------- 초기 사용자 / 종목 로딩 ----------
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
        .select('*')
        .eq('user_id', userData.user.id)
        .eq('is_sold', false)
        .order('created_at', { ascending: true });

      if (error) {
        console.error(error);
        setErrorMsg('종목 목록을 불러오는 중 오류가 발생했습니다.');
        setIsInitialLoading(false);
        return;
      }

      const mapped: NowRow[] = (data as StockItemFromDb[]).map(
        (item) => ({
          id: item.id,
          code: item.code,
          name: item.name,
          isRealBuy: item.is_real_buy,
          isSold: item.is_sold,
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

  // ---------- 한 번 가격 갱신 ----------
  const refreshPricesOnce = async (
    targetRows?: NowRow[],
  ): Promise<void> => {
    const latestRows = targetRows ?? rowsRef.current;
    if (latestRows.length === 0) return;

    try {
      const results = await Promise.allSettled(
        latestRows.map(async (row) => {
          const res = await fetch(
            `/api/kis/price?code=${encodeURIComponent(
              row.code,
            )}`,
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
        } else if (result.status === 'rejected') {
          console.error(
            '시세 갱신 실패:',
            result.reason,
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
            changeRate: price.changeRate,
          };
        }),
      );
    } catch (error: unknown) {
      console.error(error);
      setErrorMsg(
        '시세를 갱신하는 중 오류가 발생했습니다.',
      );
    }
  };

  // ---------- 실시간(폴링) 시세 조회 루프 ----------
  useEffect(() => {
    if (!isAutoRefresh) {
      return undefined;
    }

    let cancelled = false;

    const loop = async (): Promise<void> => {
      while (!cancelled) {
        const latestRows = rowsRef.current;

        if (latestRows.length > 0) {
          await refreshPricesOnce(latestRows);
        }

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

  // ---------- 실매수 여부 토글 (매수일 함께 처리) ----------
  const handleToggleRealBuy = async (
    row: NowRow,
  ): Promise<void> => {
    setErrorMsg(null);
    setIsMutating(true);

    const newIsRealBuy = !row.isRealBuy;

    let newBuyDate = row.buyDate ?? null;
    if (newIsRealBuy && !newBuyDate) {
      const today = new Date();
      newBuyDate = today.toISOString().slice(0, 10);
    }

    try {
      const { data, error } = await supabase
        .from('stock_items')
        .update({
          is_real_buy: newIsRealBuy,
          buy_date: newBuyDate,
        })
        .eq('id', row.id)
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      const updated = data as StockItemFromDb;

      setRows((prev) =>
        prev.map((r) =>
          r.id === updated.id
            ? {
                ...r,
                isRealBuy: updated.is_real_buy,
                buyDate: updated.buy_date,
              }
            : r,
        ),
      );
    } catch (error: unknown) {
      console.error(error);
      setErrorMsg(
        '실매수 여부 변경 중 오류가 발생했습니다.',
      );
    } finally {
      setIsMutating(false);
    }
  };

  // ---------- 매수일 직접 수정 ----------
  const handleBuyDateChange = async (
    row: NowRow,
    value: string,
  ): Promise<void> => {
    setErrorMsg(null);
    setIsMutating(true);

    const newDate = value || null;

    try {
      const { data, error } = await supabase
        .from('stock_items')
        .update({
          buy_date: newDate,
        })
        .eq('id', row.id)
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      const updated = data as StockItemFromDb;

      setRows((prev) =>
        prev.map((r) =>
          r.id === updated.id
            ? {
                ...r,
                buyDate: updated.buy_date,
              }
            : r,
        ),
      );
    } catch (error: unknown) {
      console.error(error);
      setErrorMsg(
        '매수일을 저장하는 중 오류가 발생했습니다.',
      );
    } finally {
      setIsMutating(false);
    }
  };

  // ---------- 종목 삭제 ----------
  const handleDeleteRow = async (
    row: NowRow,
  ): Promise<void> => {
    setErrorMsg(null);

    const ok = window.confirm(
      `${row.name} (${row.code}) 종목을 삭제하시겠습니까?`,
    );
    if (!ok) return;

    setIsMutating(true);

    try {
      const { error } = await supabase
        .from('stock_items')
        .delete()
        .eq('id', row.id);

      if (error) {
        throw error;
      }

      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (error: unknown) {
      console.error(error);
      setErrorMsg('종목 삭제 중 오류가 발생했습니다.');
    } finally {
      setIsMutating(false);
    }
  };

  // ---------- 이름 검색 팝업 관련 ----------
  const handleSearchSubmit = async (
    e: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    e.preventDefault();
    void handleNameSearch();
  };

  const handleNameSearch = async (): Promise<void> => {
    setSearchError(null);
    setSearchResults([]);

    const q = searchKeyword.trim();
    if (q.length < 2) {
      setSearchError('종목명은 2글자 이상 입력해 주세요.');
      return;
    }

    try {
      setIsSearching(true);
      const res = await fetch(
        `/api/stocks/search?q=${encodeURIComponent(q)}`,
      );
      const data =
        (await res.json()) as StocksSearchApiResponse;

      if (!res.ok) {
        setSearchError(
          data.error ?? '종목명 검색 중 오류가 발생했습니다.',
        );
        return;
      }

      setSearchResults(data.items ?? []);
    } catch (error: unknown) {
      console.error(error);
      setSearchError('종목명 검색 중 오류가 발생했습니다.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectStock = async (
    item: StockSearchItem,
  ): Promise<void> => {
    if (!userId) {
      setSearchError('로그인 정보가 없습니다.');
      return;
    }

    const exists = rowsRef.current.some(
      (r) => r.code === item.code,
    );
    if (exists) {
      setSearchError('이미 Now에 등록된 종목입니다.');
      return;
    }

    setIsMutating(true);
    setSearchError(null);

    try {
      const { data, error } = await supabase
        .from('stock_items')
        .insert({
          user_id: userId,
          code: item.code,
          name: item.name,
          is_real_buy: false,
          is_sold: false,
          sold_at: null,
          avg_price: null,
          quantity: null,
          buy_date: null,
        })
        .select('*')
        .single();

      if (error) {
        const pgError = error as { code?: string };
        if (pgError.code === '23505') {
          setSearchError(
            '이미 보유(또는 등록) 중인 종목입니다.',
          );
          return;
        }
        throw error;
      }

      const inserted = data as StockItemFromDb;

      const newRow: NowRow = {
        id: inserted.id,
        code: inserted.code,
        name: inserted.name,
        isRealBuy: inserted.is_real_buy,
        isSold: inserted.is_sold,
        buyDate: inserted.buy_date,
      };

      setRows((prev) => [...prev, newRow]);

      void refreshPricesOnce([...rowsRef.current, newRow]);

      setSearchKeyword('');
      setSearchResults([]);
      setIsSearchOpen(false);
    } catch (error: unknown) {
      console.error(error);
      if (!searchError) {
        setSearchError('종목을 추가하는 중 오류가 발생했습니다.');
      }
    } finally {
      setIsMutating(false);
    }
  };

  const renderSearchModal = () => {
    if (!isSearchOpen) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">
              종목 검색 (종목명 기준)
            </h2>
            <button
              type="button"
              className="text-xs text-gray-500"
              onClick={() => {
                setIsSearchOpen(false);
                setSearchKeyword('');
                setSearchResults([]);
                setSearchError(null);
              }}
            >
              닫기
            </button>
          </div>

          <form
            onSubmit={handleSearchSubmit}
            className="mb-2 flex flex-col gap-2"
          >
            <label className="text-xs text-gray-600">
              종목명 (예: 삼성전자)
            </label>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded border px-2 py-1 text-sm"
                value={searchKeyword}
                onChange={(e) =>
                  setSearchKeyword(e.target.value)
                }
                placeholder="2글자 이상 입력"
              />
              <button
                type="submit"
                className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
                disabled={isSearching}
              >
                {isSearching ? '검색 중...' : '검색'}
              </button>
            </div>
          </form>

          {searchError && (
            <p className="mb-2 text-xs text-red-500">
              {searchError}
            </p>
          )}

          <div className="mt-2 max-h-64 overflow-y-auto rounded border">
            {searchResults.length === 0 ? (
              <p className="px-3 py-2 text-[11px] text-gray-500">
                검색 결과가 없습니다. (예: &quot;삼성&quot;,
                &quot;현대&quot; 등으로 검색해 보세요.)
              </p>
            ) : (
              <ul className="divide-y text-sm">
                {searchResults.map((item) => (
                  <li
                    key={item.code}
                    className="flex cursor-pointer items-center justify-between px-3 py-2 hover:bg-gray-50"
                    onClick={() => {
                      void handleSelectStock(item);
                    }}
                  >
                    <div>
                      <div className="font-semibold">
                        {item.name}{' '}
                        <span className="text-xs text-gray-500">
                          ({item.code})
                        </span>
                      </div>
                      {item.market && (
                        <div className="text-[11px] text-gray-500">
                          {item.market}
                        </div>
                      )}
                    </div>
                    <span className="text-[11px] text-blue-600">
                      추가
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="mt-3 text-[11px] text-gray-400">
            * 현재는 Supabase의 종목마스터(stock_master)에서 종목명을
            검색합니다.
          </p>
        </div>
      </div>
    );
  };

  const getTrendForCode = (code: string): DailyTrendRow[] =>
    detailMap[code] ?? [];

  const handleSelectRow = async (row: NowRow): Promise<void> => {
    const nextId = selectedRowId === row.id ? null : row.id;
    setSelectedRowId(nextId);
    setHoveredCandleIdx(null);
    if (!nextId) return;

    if (detailMap[row.code]) return;

    try {
      setDetailLoadingCode(row.code);
      const res = await fetch(
        `/api/kis/history?code=${encodeURIComponent(row.code)}`
      );
      const data = (await res.json()) as KisHistoryApiResponse;
      if (!res.ok) {
        throw new Error(data.error ?? '일봉 데이터를 불러오지 못했습니다.');
      }
      setDetailMap((prev) => ({ ...prev, [row.code]: data.rows ?? [] }));
    } catch (error) {
      console.error(error);
      setErrorMsg('종목 상세 데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setDetailLoadingCode(null);
    }
  };

  // ---------- 숫자 포맷터 ----------
  const formatNumber = (
    value: number | string | undefined,
  ): string => {
    if (value === null || value === undefined) return '-';
    const num =
      typeof value === 'number' ? value : Number(value);
    if (Number.isNaN(num)) return '-';
    return num.toLocaleString();
  };

  const formatSigned = (value: number | null): string => {
    if (value === null || Number.isNaN(value)) return '-';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toLocaleString()}`;
  };

  const getSignedColorClass = (value: number | null): string => {
    if (value === null || Number.isNaN(value) || value === 0) {
      return 'text-gray-700';
    }
    return value > 0 ? 'text-red-600' : 'text-blue-600';
  };

  const calcEmaSeries = (values: number[], period: number): Array<number | null> => {
    const result: Array<number | null> = new Array(values.length).fill(null);
    if (values.length < period) return result;
    const k = 2 / (period + 1);
    let ema =
      values.slice(0, period).reduce((sum, v) => sum + v, 0) / period;
    result[period - 1] = ema;
    for (let i = period; i < values.length; i += 1) {
      ema = values[i] * k + ema * (1 - k);
      result[i] = ema;
    }
    return result;
  };

  const calcIndicators = (trend: DailyTrendRow[]) => {
    const closes = trend.map((t) => t.close);
    const lastClose = closes[closes.length - 1] ?? 0;

    const ma = (period: number): number | null => {
      const slice = closes.slice(-period);
      if (slice.length < period) return null;
      return slice.reduce((sum, v) => sum + v, 0) / period;
    };

    const ma5 = ma(5);
    const ma20 = ma(20);

    let rsi14: number | null = null;
    if (closes.length >= 15) {
      const diffs = closes.slice(1).map((v, i) => v - closes[i]);
      const recent = diffs.slice(-14);
      const avgGain =
        recent
          .filter((d) => d > 0)
          .reduce((sum, d) => sum + d, 0) / 14;
      const avgLoss =
        Math.abs(
          recent
            .filter((d) => d < 0)
            .reduce((sum, d) => sum + d, 0)
        ) / 14;
      if (avgLoss === 0) rsi14 = 100;
      else {
        const rs = avgGain / avgLoss;
        rsi14 = 100 - 100 / (1 + rs);
      }
    }

    const ema12 = calcEmaSeries(closes, 12);
    const ema26 = calcEmaSeries(closes, 26);
    const macdSeries = closes.map((_, idx) => {
      if (ema12[idx] === null || ema26[idx] === null) return null;
      return (ema12[idx] as number) - (ema26[idx] as number);
    });
    const macdValues = macdSeries.map((v) => v ?? 0);
    const signalSeries = calcEmaSeries(macdValues, 9);
    const lastMacd = macdSeries[macdSeries.length - 1];
    const lastSignal = signalSeries[signalSeries.length - 1];
    const lastHist =
      lastMacd !== null && lastSignal !== null ? lastMacd - lastSignal : null;

    let bbMiddle: number | null = null;
    let bbUpper: number | null = null;
    let bbLower: number | null = null;
    if (closes.length >= 20) {
      const recent = closes.slice(-20);
      bbMiddle = recent.reduce((sum, v) => sum + v, 0) / 20;
      const variance =
        recent.reduce((sum, v) => sum + (v - bbMiddle!) ** 2, 0) / 20;
      const stdDev = Math.sqrt(variance);
      bbUpper = bbMiddle + 2 * stdDev;
      bbLower = bbMiddle - 2 * stdDev;
    }

    const volumeAvg5 =
      trend.slice(-5).reduce((sum, row) => sum + row.volume, 0) /
      Math.min(5, trend.length);
    const volumeRatio =
      volumeAvg5 > 0 ? trend[trend.length - 1].volume / volumeAvg5 : null;

    return {
      lastClose,
      ma5,
      ma20,
      rsi14,
      macd: lastMacd,
      signal: lastSignal,
      histogram: lastHist,
      bbMiddle,
      bbUpper,
      bbLower,
      volumeRatio,
    };
  };

  const getVisibleTrend = (trend: DailyTrendRow[]): DailyTrendRow[] => {
    if (trend.length <= chartWindowSize) return trend;
    return trend.slice(-chartWindowSize);
  };

  const handleZoomIn = (trendLength: number) => {
    if (trendLength <= 10) return;
    setChartWindowSize((prev) => Math.max(10, Math.floor(prev * 0.75)));
  };

  const handleZoomOut = (trendLength: number) => {
    setChartWindowSize((prev) => Math.min(trendLength, Math.ceil(prev * 1.25)));
  };

  const renderCandlestickChart = (trend: DailyTrendRow[]) => {
    const visibleTrend = getVisibleTrend(trend);

    if (trend.length < 2) {
      return (
        <div className="rounded border border-dashed border-gray-200 px-3 py-4 text-xs text-gray-500">
          차트를 그릴 데이터가 부족합니다.
        </div>
      );
    }

    const lows = visibleTrend.map((d) => d.low);
    const highs = visibleTrend.map((d) => d.high);
    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const range = max - min || 1;
    const width = 640;
    const height = 260;
    const candleWidth = Math.max(4, width / (visibleTrend.length * 1.6));
    const step = width / visibleTrend.length;
    const y = (price: number) => height - ((price - min) / range) * height;
    const closeLinePoints = visibleTrend
      .map((item, idx) => {
        const xCenter = idx * step + step / 2;
        return `${xCenter},${y(item.close)}`;
      })
      .join(' ');
    const gridTicks = 5;
    const hovered =
      hoveredCandleIdx !== null ? visibleTrend[hoveredCandleIdx] : null;
    const hoveredPrev =
      hoveredCandleIdx !== null && hoveredCandleIdx > 0
        ? visibleTrend[hoveredCandleIdx - 1]
        : null;
    const hoveredChange =
      hovered && hoveredPrev ? hovered.close - hoveredPrev.close : null;
    const hoveredPct =
      hoveredChange !== null &&
      hoveredPrev &&
      hoveredPrev.close !== 0
        ? (hoveredChange / hoveredPrev.close) * 100
        : null;

    return (
      <div className="rounded border border-gray-200 bg-white p-2">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] text-gray-600 sm:text-xs">
            표시 구간: 최근 <strong>{visibleTrend.length}</strong>일
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] sm:text-xs">
            {[20, 40, 60].map((n) => (
              <button
                key={n}
                type="button"
                className={`rounded border px-2 py-0.5 ${
                  chartWindowSize === n
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-300 text-gray-700'
                }`}
                onClick={() => setChartWindowSize(n)}
              >
                {n}D
              </button>
            ))}
            <button
              type="button"
              className="rounded border border-gray-300 px-2 py-0.5 text-gray-700"
              onClick={() => setChartWindowSize(trend.length)}
            >
              ALL
            </button>
            <button
              type="button"
              className="rounded border border-gray-300 px-2 py-0.5 text-gray-700"
              onClick={() => handleZoomIn(trend.length)}
            >
              확대 +
            </button>
            <button
              type="button"
              className="rounded border border-gray-300 px-2 py-0.5 text-gray-700"
              onClick={() => handleZoomOut(trend.length)}
            >
              축소 -
            </button>
            <button
              type="button"
              className={`rounded border px-2 py-0.5 ${
                showCloseLine
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-gray-300 text-gray-700'
              }`}
              onClick={() => setShowCloseLine((prev) => !prev)}
            >
              라인 {showCloseLine ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
        <div className="mb-2 rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-[11px] sm:text-xs">
          {hovered ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold text-gray-800">{hovered.date}</span>
              <span>시가 {formatNumber(hovered.open)}</span>
              <span>고가 {formatNumber(hovered.high)}</span>
              <span>저가 {formatNumber(hovered.low)}</span>
              <span>종가 {formatNumber(hovered.close)}</span>
              <span>거래량 {formatNumber(hovered.volume)}</span>
              <span className={getSignedColorClass(hoveredChange)}>
                전일비 {hoveredChange === null ? '-' : formatSigned(hoveredChange)}
              </span>
              <span className={getSignedColorClass(hoveredPct)}>
                등락률{' '}
                {hoveredPct === null
                  ? '-'
                  : `${hoveredPct > 0 ? '+' : ''}${hoveredPct.toFixed(2)}%`}
              </span>
            </div>
          ) : (
            <span className="text-gray-600">
              캔들에 마우스를 올리면 시가/고가/저가/종가/거래량/전일비가 표시됩니다.
            </span>
          )}
        </div>
        <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full">
          {Array.from({ length: gridTicks }).map((_, i) => {
            const ratio = i / (gridTicks - 1);
            const yy = ratio * height;
            const price = max - ratio * range;
            return (
              <g key={`grid-${i}`}>
                <line
                  x1={0}
                  x2={width}
                  y1={yy}
                  y2={yy}
                  stroke="#e5e7eb"
                  strokeWidth={1}
                />
                <text
                  x={width - 4}
                  y={yy - 2}
                  textAnchor="end"
                  fontSize="10"
                  fill="#6b7280"
                >
                  {Math.round(price).toLocaleString()}
                </text>
              </g>
            );
          })}
          {visibleTrend.map((item, idx) => {
            const xCenter = idx * step + step / 2;
            const isUp = item.close >= item.open;
            const color = isUp ? '#dc2626' : '#2563eb';
            const bodyTop = y(Math.max(item.open, item.close));
            const bodyBottom = y(Math.min(item.open, item.close));
            const bodyHeight = Math.max(2, bodyBottom - bodyTop);
            return (
              <g
                key={item.date}
                onMouseEnter={() => setHoveredCandleIdx(idx)}
                onMouseLeave={() => setHoveredCandleIdx(null)}
              >
                <line
                  x1={xCenter}
                  x2={xCenter}
                  y1={y(item.high)}
                  y2={y(item.low)}
                  stroke={color}
                  strokeWidth={1.2}
                />
                <rect
                  x={xCenter - candleWidth / 2}
                  y={bodyTop}
                  width={candleWidth}
                  height={bodyHeight}
                  fill={isUp ? '#fee2e2' : '#dbeafe'}
                  stroke={color}
                  strokeWidth={1}
                />
              </g>
            );
          })}
          {showCloseLine && (
            <polyline
              points={closeLinePoints}
              fill="none"
              stroke="#7c3aed"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.95}
            />
          )}
          <line
            x1={0}
            x2={width}
            y1={height}
            y2={height}
            stroke="#9ca3af"
            strokeWidth={1}
          />
        </svg>
        <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500">
          <span>{visibleTrend[0].date}</span>
          <span>{visibleTrend[Math.floor(visibleTrend.length / 2)].date}</span>
          <span>{visibleTrend[visibleTrend.length - 1].date}</span>
        </div>
      </div>
    );
  };

  const buildInsights = (trend: DailyTrendRow[]) => {
    if (trend.length === 0) return [];
    const last = trend[trend.length - 1];
    const prev = trend.length > 1 ? trend[trend.length - 2] : null;
    const indicator = calcIndicators(trend);
    const pct =
      prev && prev.close > 0
        ? ((last.close - prev.close) / prev.close) * 100
        : null;

    return [
      `단기 추세: ${
        indicator.ma5 && last.close > indicator.ma5
          ? '5일선 위(단기 강세)'
          : '5일선 아래(단기 약세)'
      }`,
      `중기 추세: ${
        indicator.ma20 && last.close > indicator.ma20
          ? '20일선 위 유지'
          : '20일선 하회'
      }`,
      `RSI(14): ${
        indicator.rsi14 === null
          ? '계산 데이터 부족'
          : `${indicator.rsi14.toFixed(1)} (${indicator.rsi14 >= 70 ? '과열권' : indicator.rsi14 <= 30 ? '과매도권' : '중립'})`
      }`,
      `MACD: ${
        indicator.macd === null || indicator.signal === null
          ? '계산 데이터 부족'
          : `${indicator.macd.toFixed(2)} / Signal ${indicator.signal.toFixed(2)}`
      }`,
      `볼린저밴드: ${
        indicator.bbUpper === null || indicator.bbLower === null
          ? '계산 데이터 부족'
          : `상단 ${indicator.bbUpper.toFixed(0)} / 하단 ${indicator.bbLower.toFixed(0)}`
      }`,
      `전일 대비: ${
        pct === null ? '비교 데이터 부족' : `${pct.toFixed(2)}%`
      }`,
      `거래량: ${
        indicator.volumeRatio === null
          ? '비교 데이터 부족'
          : `최근 5일 평균 대비 ${indicator.volumeRatio.toFixed(2)}배`
      }`,
    ];
  };

  const insightHelpMap: Record<string, string> = {
    '단기 추세':
      '현재가가 5일 이동평균선 위/아래에 있는지로 단기 모멘텀을 봅니다. 위에 있으면 단기 강세, 아래면 단기 약세로 해석합니다.',
    '중기 추세':
      '현재가와 20일 이동평균선 관계입니다. 20일선 위는 중기 우상향 흐름 유지 가능성을, 아래는 추세 약화를 시사합니다.',
    'RSI(14)':
      '최근 14일 상승/하락 강도를 0~100으로 표현합니다. 일반적으로 70 이상 과열, 30 이하 과매도로 보지만 추세장에서는 오래 유지될 수 있습니다.',
    MACD:
      '12일 EMA와 26일 EMA 차이입니다. MACD가 Signal 위로 올라서면 모멘텀 개선 가능성, 아래로 내려가면 둔화 가능성이 있습니다.',
    '볼린저밴드':
      '20일 평균 대비 변동성 범위(상/하단 밴드)입니다. 상단 근접은 과열, 하단 근접은 과매도 가능성을 시사하지만 강한 추세에서는 밴드 워크가 발생할 수 있습니다.',
    '전일 대비':
      '직전 거래일 종가 대비 오늘 종가 변동률입니다. 당일 강도 확인용으로 쓰고, 단독 신호보다는 추세/거래량과 함께 보는 것이 좋습니다.',
    거래량:
      '오늘 거래량이 최근 5일 평균 대비 몇 배인지 표시합니다. 가격 돌파/이탈 신호의 신뢰도를 확인할 때 유용합니다.',
  };

  const parseInsightItem = (item: string) => {
    const idx = item.indexOf(':');
    if (idx === -1) {
      return { title: item, value: '', help: '설명 정보가 없습니다.' };
    }
    const title = item.slice(0, idx).trim();
    const value = item.slice(idx + 1).trim();
    const key =
      title === 'RSI(14)' ? 'RSI(14)' : title === '볼린저밴드' ? '볼린저밴드' : title;
    return {
      title,
      value,
      help: insightHelpMap[key] ?? '설명 정보가 없습니다.',
    };
  };

  const selectedRow = rows.find((r) => r.id === selectedRowId) ?? null;
  const selectedTrend = selectedRow
    ? getTrendForCode(selectedRow.code)
    : [];
  const insightItems = buildInsights(selectedTrend);

  // ---------- 등락률 포맷 & 색상 ----------
  const formatChangeRate = (
    value: number | string | undefined,
  ): { text: string; className: string } => {
    if (value === null || value === undefined) {
      return { text: '-', className: 'text-gray-500' };
    }

    const num =
      typeof value === 'number' ? value : Number(value);
    if (Number.isNaN(num)) {
      return { text: '-', className: 'text-gray-500' };
    }

    let className = 'text-gray-500';
    if (num > 0) className = 'text-red-600';
    else if (num < 0) className = 'text-blue-600';

    const sign = num > 0 ? '+' : num < 0 ? '' : '';
    const text = `${sign}${num.toFixed(2)}%`;

    return { text, className };
  };

  // ---------- 렌더링 ----------
  return (
    <div className="flex flex-col gap-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">
            Now – 실시간 종목 시세
          </h1>
          <p className="mt-1 text-xs text-gray-600 sm:text-sm">
            내가 관리하는 종목들의 등락률, 현재가, 매수일, 실매수 여부를
            간단하게 확인하는 화면입니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm sm:text-sm"
            onClick={() => setIsSearchOpen(true)}
          >
            종목 추가
          </button>

          <button
            type="button"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 sm:text-sm"
            onClick={() =>
              setIsAutoRefresh((prev) => !prev)
            }
          >
            자동 새로고침:{' '}
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
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 sm:text-sm"
            onClick={() => {
              void handleRefreshOnceClick();
            }}
          >
            수동 새로고침
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 sm:text-sm">
          {errorMsg}
        </div>
      )}

      {isInitialLoading ? (
        <div className="rounded-md border border-gray-200 bg-white px-3 py-4 text-center text-sm text-gray-500 shadow-sm">
          종목 목록을 불러오는 중입니다...
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-gray-200 bg-white px-3 py-4 text-center text-sm text-gray-500 shadow-sm">
          아직 등록된 종목이 없습니다. 오른쪽 상단의 &quot;종목 추가&quot;
          버튼을 눌러 종목을 등록해보세요.
        </div>
      ) : (
        <>
          {/* 데스크탑/태블릿: 테이블 뷰 */}
          <div className="hidden sm:block">
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
              <table className="min-w-full text-left text-xs md:text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-3 py-2">종목코드</th>
                    <th className="px-3 py-2">종목명</th>
                    <th className="px-3 py-2 text-right">
                      등락률
                    </th>
                    <th className="px-3 py-2 text-right">
                      현재가
                    </th>
                    <th className="px-3 py-2 text-center">
                      매수일
                    </th>
                    <th className="px-3 py-2 text-center">
                      실매수
                    </th>
                    <th className="px-3 py-2 text-center">
                      삭제
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const { text, className } =
                      formatChangeRate(row.changeRate);

                    return (
                      <tr
                        key={row.id}
                        className={`border-t text-xs md:text-sm cursor-pointer hover:bg-blue-50 ${
                          selectedRowId === row.id ? 'bg-blue-50/70' : ''
                        }`}
                        onClick={() => {
                          void handleSelectRow(row);
                        }}
                      >
                        <td className="px-3 py-2">
                          {row.code}
                        </td>
                        <td className="px-3 py-2">
                          {row.name}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span
                            className={`text-xs ${className}`}
                          >
                            {text}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className={className}>
                            {formatNumber(row.currentPrice)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="date"
                            className="w-full rounded border px-1 py-0.5 text-xs"
                            value={row.buyDate ?? ''}
                            disabled={!row.isRealBuy || isMutating}
                            onChange={(e) => {
                              e.stopPropagation();
                              void handleBuyDateChange(
                                row,
                                e.target.value,
                              );
                            }}
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={row.isRealBuy}
                            disabled={isMutating}
                            onChange={(e) => {
                              e.stopPropagation();
                              void handleToggleRealBuy(row);
                            }}
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            className="text-xs text-red-600 hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDeleteRow(row);
                            }}
                            disabled={isMutating}
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 모바일: 카드 리스트 뷰 */}
          <div className="space-y-2 sm:hidden">
            {rows.map((row) => {
              const { text, className } =
                formatChangeRate(row.changeRate);

              return (
                <div
                  key={row.id}
                  className={`rounded-lg border bg-white p-3 shadow-sm text-[12px] ${
                    selectedRowId === row.id
                      ? 'border-blue-300'
                      : 'border-gray-200'
                  }`}
                  onClick={() => {
                    void handleSelectRow(row);
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">
                          {row.name}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-gray-500">
                        {row.code}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="text-[11px] text-red-600 hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDeleteRow(row);
                      }}
                      disabled={isMutating}
                    >
                      삭제
                    </button>
                  </div>

                  <div className="mt-2 flex flex-wrap items-baseline gap-2">
                    <span className="text-[11px] text-gray-500">
                      현재가
                    </span>
                    <span className={className}>
                      {formatNumber(row.currentPrice)}
                    </span>
                    <span
                      className={`text-[11px] ${className}`}
                    >
                      ({text})
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] text-gray-500">
                        매수일
                      </span>
                      <input
                        type="date"
                        className="w-32 rounded border px-1 py-0.5 text-[11px]"
                        value={row.buyDate ?? ''}
                        disabled={!row.isRealBuy || isMutating}
                        onChange={(e) => {
                          e.stopPropagation();
                          void handleBuyDateChange(
                            row,
                            e.target.value,
                          );
                        }}
                      />
                    </div>
                    <label className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] text-gray-700">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={row.isRealBuy}
                        disabled={isMutating}
                        onChange={(e) => {
                          e.stopPropagation();
                          void handleToggleRealBuy(row);
                        }}
                      />
                      <span>실매수</span>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {selectedRow && (
        <section className="rounded-lg border border-blue-100 bg-blue-50/40 p-3 sm:p-4">
          <div className="mb-3 flex items-end justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-gray-900 sm:text-lg">
                {selectedRow.name} ({selectedRow.code}) 상세
              </h2>
              <p className="text-xs text-gray-600 sm:text-sm">
                최근 3개월 일별 데이터와 투자 참고 지표
              </p>
            </div>
            <button
              type="button"
              className="text-xs text-gray-500 hover:underline"
              onClick={() => setSelectedRowId(null)}
            >
              닫기
            </button>
          </div>

          {detailLoadingCode === selectedRow.code ? (
            <div className="rounded border border-gray-200 bg-white px-3 py-4 text-sm text-gray-500">
              상세 데이터를 불러오는 중입니다...
            </div>
          ) : selectedTrend.length === 0 ? (
            <div className="rounded border border-dashed border-gray-300 bg-white px-3 py-4 text-sm text-gray-500">
              일별 시세 데이터가 없습니다.
            </div>
          ) : (
            <div className="space-y-3">
              {renderCandlestickChart(selectedTrend)}

              <div className="grid gap-2 sm:grid-cols-2">
                {insightItems.map((item) => {
                  const parsed = parseInsightItem(item);
                  return (
                    <div
                      key={item}
                      className="rounded border border-blue-100 bg-white px-3 py-2 text-xs text-gray-700 sm:text-sm"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-gray-800">
                          {parsed.title}
                        </span>
                        <span className="group relative inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-gray-300 text-[10px] text-gray-500">
                          ?
                          <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-64 -translate-x-1/2 rounded bg-gray-900 px-2 py-1.5 text-[11px] font-normal leading-relaxed text-white group-hover:block">
                            {parsed.help}
                          </span>
                        </span>
                      </div>
                      <div className="mt-1">{parsed.value}</div>
                    </div>
                  );
                })}
              </div>

              <div className="overflow-x-auto rounded border border-gray-200 bg-white">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-2 py-2">일자</th>
                      <th className="px-2 py-2 text-right">시가</th>
                      <th className="px-2 py-2 text-right">고가</th>
                      <th className="px-2 py-2 text-right">저가</th>
                      <th className="px-2 py-2 text-right">종가</th>
                      <th className="px-2 py-2 text-right">거래량</th>
                      <th className="px-2 py-2 text-right">외국인</th>
                      <th className="px-2 py-2 text-right">기관</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...selectedTrend]
                      .reverse()
                      .slice(0, 20)
                      .map((row) => (
                        <tr key={row.date} className="border-t">
                          <td className="px-2 py-1.5">{row.date}</td>
                          <td className="px-2 py-1.5 text-right">
                            {formatNumber(row.open)}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            {formatNumber(row.high)}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            {formatNumber(row.low)}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            {formatNumber(row.close)}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            {formatNumber(row.volume)}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            {formatSigned(row.foreignNet)}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            {formatSigned(row.institutionNet)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {renderSearchModal()}
    </div>
  );
}
