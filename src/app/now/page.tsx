// src/app/now/page.tsx
'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type NowRow = {
  id: string;
  code: string;
  name: string;
  isRealBuy: boolean;
  isSold: boolean;
  buyDate?: string | null; // 매수일

  currentPrice?: number | string;
  changeRate?: number | string; // 등락률 (%)
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

export default function NowPage(): JSX.Element {
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

  // 검색 팝업 상태 (종목명 검색)
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
        .eq('is_sold', false) // 현재 활성 포지션만 Now에 표시
        .order('created_at', { ascending: true });

      if (error) {
        // eslint-disable-next-line no-console
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

      // 처음 로딩 후 한 번 강제 갱신
      if (mapped.length > 0) {
        void refreshPricesOnce(mapped);
      }
    };

    void load();
  }, []);

  // ---------- 공통: 한 번 가격 갱신하는 함수 ----------
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
        } else {
          // eslint-disable-next-line no-console
          console.error(
            '시세 갱신 실패:',
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
            changeRate: price.changeRate,
          };
        }),
      );
    } catch (error) {
      // eslint-disable-next-line no-console
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

        // 2초 간격
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

  // ---------- 실매수 여부 토글 (매수일 함께 처리) ----------
  const handleToggleRealBuy = async (
    row: NowRow,
  ): Promise<void> => {
    setErrorMsg(null);
    setIsMutating(true);

    const newIsRealBuy = !row.isRealBuy;

    // 새로 실매수로 체크되고 기존 매수일이 없으면 → 오늘 날짜 기본값
    let newBuyDate = row.buyDate ?? null;
    if (newIsRealBuy && !newBuyDate) {
      const today = new Date();
      newBuyDate = today.toISOString().slice(0, 10); // YYYY-MM-DD
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
    } catch (error) {
      // eslint-disable-next-line no-console
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
    } catch (error) {
      // eslint-disable-next-line no-console
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

    // eslint-disable-next-line no-alert
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
    } catch (error) {
      // eslint-disable-next-line no-console
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
    } catch (error) {
      // eslint-disable-next-line no-console
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

    // 현재 Now에 표시 중인(= is_sold=false) 종목 중에서만 중복 체크
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
        const err: any = error;
        if (err.code === '23505') {
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

      // 새로 추가된 종목까지 포함해 바로 한 번 시세 조회
      void refreshPricesOnce([...rowsRef.current, newRow]);

      setSearchKeyword('');
      setSearchResults([]);
      setIsSearchOpen(false);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      if (!searchError) {
        setSearchError('종목을 추가하는 중 오류가 발생했습니다.');
      }
    } finally {
      setIsMutating(false);
    }
  };

  const renderSearchModal = (): JSX.Element | null => {
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
          {/* ✅ 데스크탑/태블릿: 테이블 뷰 */}
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
                        className="border-t text-xs md:text-sm"
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
                            onChange={() => {
                              void handleToggleRealBuy(row);
                            }}
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            className="text-xs text-red-600 hover:underline"
                            onClick={() => {
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

          {/* ✅ 모바일: 카드 리스트 뷰 */}
          <div className="space-y-2 sm:hidden">
            {rows.map((row) => {
              const { text, className } =
                formatChangeRate(row.changeRate);

              return (
                <div
                  key={row.id}
                  className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm text-[12px]"
                >
                  {/* 상단: 종목명 + 코드 */}
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
                      onClick={() => {
                        void handleDeleteRow(row);
                      }}
                      disabled={isMutating}
                    >
                      삭제
                    </button>
                  </div>

                  {/* 현재가 / 등락률 */}
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

                  {/* 매수일 / 실매수 */}
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
                          void handleBuyDateChange(
                            row,
                            e.target.value,
                          );
                        }}
                      />
                    </div>
                    <label className="inline-flex items-center gap-1 text-[12px] text-gray-700 whitespace-nowrap">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={row.isRealBuy}
                        disabled={isMutating}
                        onChange={() => {
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

      {renderSearchModal()}
    </div>
  );
}
