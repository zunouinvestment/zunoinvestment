// src/lib/kisClient.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const BASE_URL =
  process.env.KIS_BASE_URL ??
  'https://openapi.koreainvestment.com:9443';

// ✅ 사용자의 환경변수 키 (HANKUK_...)만 사용하도록 고정
const APP_KEY = process.env.HANKUK_API_KEY;
const APP_SECRET = process.env.HANKUK_SECRET_KEY;

if (!APP_KEY || !APP_SECRET) {
  console.error(
    '[KIS] HANKUK_API_KEY 또는 HANKUK_SECRET_KEY 환경변수가 설정되어 있지 않습니다.',
  );
}

interface KisTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

interface KisTokenRow {
  id: number;
  provider: string;
  access_token: string;
  expires_at: string;
  created_at: string;
}

interface KisPriceRawOutput {
  stck_shrn_iscd?: string; // 단축코드 (6자리)
  hts_kor_isnm?: string; // 한글 종목명
  prdt_abrv_name?: string;
  stck_prpr?: string; // 현재가
  stck_oprc?: string; // 시가
  stck_hgpr?: string; // 고가
  stck_lwpr?: string; // 저가
  acml_vol?: string; // 거래량
  prdy_ctrt?: string; // 전일 대비율 (%)
  prdy_vrss?: string; // 전일 대비 금액
}

interface KisPriceApiResponse {
  rt_cd: string;
  msg_cd: string;
  msg1: string;
  output: KisPriceRawOutput;
}

export interface KisPriceResult {
  code: string;
  name?: string;
  currentPrice: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  changeRate: number; // 등락률 (%)
  changePrice?: number; // 전일대비 금액
}

// ---- 메모리 캐시 (프로세스 단위) ----
let memoryToken: { value: string; expiresAtMs: number } | null = null;

// DB 토큰 관리용 상수
const TOKEN_PROVIDER = 'KIS';
// KIS 최대 24시간 유효이지만, 안정적으로 12시간마다 재발급
const TOKEN_LIFETIME_MS = 12 * 60 * 60 * 1000;

// ---------- DB에서 토큰 불러오기 ----------
async function loadTokenFromDb(): Promise<{
  token: string;
  expiresAtMs: number;
} | null> {
  const { data, error } = await supabaseAdmin
    .from('kis_tokens')
    .select('*')
    .eq('provider', TOKEN_PROVIDER)
    .order('expires_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('[KIS] DB 토큰 조회 오류:', error);
    return null;
  }

  const rows = data as KisTokenRow[] | null;
  const row = rows?.[0];
  if (!row) return null;

  const expiresAtMs = new Date(row.expires_at).getTime();
  if (Number.isNaN(expiresAtMs)) return null;

  const now = Date.now();
  if (expiresAtMs <= now) {
    return null; // 이미 만료된 토큰이면 무시
  }

  return { token: row.access_token, expiresAtMs };
}

// ---------- DB에 새 토큰 저장 ----------
async function saveTokenToDb(
  token: string,
): Promise<{ token: string; expiresAtMs: number }> {
  const now = Date.now();
  const expiresAtMs = now + TOKEN_LIFETIME_MS;
  const expiresAtIso = new Date(expiresAtMs).toISOString();

  const { error } = await supabaseAdmin
    .from('kis_tokens')
    .insert({
      provider: TOKEN_PROVIDER,
      access_token: token,
      expires_at: expiresAtIso,
    });

  if (error) {
    console.error('[KIS] DB 토큰 저장 오류:', error);
  }

  return { token, expiresAtMs };
}

// ---------- 실제 KIS에 요청해서 새 토큰 발급 ----------
async function issueNewToken(): Promise<{
  token: string;
  expiresAtMs: number;
}> {
  if (!APP_KEY || !APP_SECRET) {
    throw new Error('[KIS] AppKey/AppSecret 환경변수가 없습니다.');
  }

  const res = await fetch(`${BASE_URL}/oauth2/tokenP`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: APP_KEY,
      appsecret: APP_SECRET,
    }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[KIS] tokenP HTTP error:', res.status, text);
    throw new Error(
      `[KIS] 접근토큰 발급 실패: ${res.status} ${text}`,
    );
  }

  const data = (await res.json()) as KisTokenResponse;

  if (!data.access_token) {
    throw new Error('[KIS] access_token이 응답에 없습니다.');
  }

  console.log('[KIS] 새로운 access_token 발급 완료');
  return saveTokenToDb(data.access_token);
}

// ---------- 공개 함수: KIS access_token 가져오기 ----------
export async function getKisAccessToken(): Promise<string> {
  const now = Date.now();

  if (memoryToken && memoryToken.expiresAtMs > now) {
    return memoryToken.value;
  }

  const dbToken = await loadTokenFromDb();
  if (dbToken && dbToken.expiresAtMs > now) {
    memoryToken = {
      value: dbToken.token,
      expiresAtMs: dbToken.expiresAtMs,
    };
    return dbToken.token;
  }

  const newToken = await issueNewToken();
  memoryToken = {
    value: newToken.token,
    expiresAtMs: newToken.expiresAtMs,
  };
  return newToken.token;
}

/** 종목코드를 KIS에서 요구하는 6자리 숫자형으로 정리 */
function normalizeStockCode(rawCode: string): string {
  const onlyDigits = rawCode.replace(/[^0-9]/g, '');
  if (!onlyDigits) {
    throw new Error('[KIS] 종목코드가 비어 있습니다.');
  }
  return onlyDigits.slice(-6).padStart(6, '0');
}

// ---------- 만료 감지 함수 ----------
function isTokenExpiredMessage(text: string): boolean {
  if (!text) return false;
  return (
    text.includes('기간이 만료된 token') ||
    text.includes('EGW00123')
  );
}

function isTokenExpiredBizError(data: KisPriceApiResponse): boolean {
  return (
    data.msg_cd === 'EGW00123' ||
    data.msg1?.includes('기간이 만료된 token') === true
  );
}

// ---------- API 요청 ----------
async function requestDomesticPriceWithToken(
  code: string,
  token: string,
  allowRetryOnExpire: boolean,
): Promise<KisPriceResult> {
  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'UN',
    FID_INPUT_ISCD: code,
  });

  const url = `${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price?${params.toString()}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      authorization: `Bearer ${token}`,
      appkey: APP_KEY ?? '',
      appsecret: APP_SECRET ?? '',
      tr_id: 'FHKST01010100',
      custtype: 'P',
    },
    cache: 'no-store',
  });

  const rawText = await res.text();

  if (!res.ok) {
    if (allowRetryOnExpire && isTokenExpiredMessage(rawText)) {
      console.warn(
        '[KIS] access_token 만료 감지(HTTP). 재발급 후 재시도.',
      );
      const newToken = await issueNewToken();
      memoryToken = {
        value: newToken.token,
        expiresAtMs: newToken.expiresAtMs,
      };
      return requestDomesticPriceWithToken(code, newToken.token, false);
    }

    console.error('[KIS] inquire-price HTTP error:', res.status, rawText);
    throw new Error(
      `[KIS] 현재가 조회 HTTP 에러: ${res.status} ${rawText}`,
    );
  }

  let data: KisPriceApiResponse;
  try {
    data = JSON.parse(rawText) as KisPriceApiResponse;
  } catch (error) {
    console.error('[KIS] inquire-price JSON parse error:', error, rawText);
    throw new Error('[KIS] 현재가 조회 응답 파싱 실패');
  }

  if (data.rt_cd !== '0') {
    if (allowRetryOnExpire && isTokenExpiredBizError(data)) {
      console.warn(
        '[KIS] access_token 만료 감지(BIZ). 재발급 후 재시도.',
      );
      const newToken = await issueNewToken();
      memoryToken = {
        value: newToken.token,
        expiresAtMs: newToken.expiresAtMs,
      };
      return requestDomesticPriceWithToken(code, newToken.token, false);
    }

    console.error('[KIS] inquire-price biz error:', data.msg_cd, data.msg1);
    throw new Error(data.msg1 || `[KIS] 현재가 조회 실패 (rt_cd=${data.rt_cd})`);
  }

  const o = data.output ?? {};

  const currentPrice = Number(o.stck_prpr ?? 0);
  const openPrice = Number(o.stck_oprc ?? 0);
  const highPrice = Number(o.stck_hgpr ?? 0);
  const lowPrice = Number(o.stck_lwpr ?? 0);
  const volume = Number(o.acml_vol ?? 0);
  const changeRate = Number(o.prdy_ctrt ?? 0);
  const changePrice =
    o.prdy_vrss !== undefined ? Number(o.prdy_vrss) : undefined;

  return {
    code: o.stck_shrn_iscd ?? code,
    name: o.hts_kor_isnm ?? o.prdt_abrv_name,
    currentPrice,
    openPrice,
    highPrice,
    lowPrice,
    volume,
    changeRate,
    changePrice,
  };
}

// ---------- 공개 함수: 현재가 조회 ----------
export async function getDomesticStockPrice(
  rawCode: string,
): Promise<KisPriceResult> {
  if (!APP_KEY || !APP_SECRET) {
    throw new Error('[KIS] AppKey/AppSecret 환경변수가 없습니다.');
  }

  const code = normalizeStockCode(rawCode);
  const token = await getKisAccessToken();

  // 만료 시 한 번만 자동 재시도
  return requestDomesticPriceWithToken(code, token, true);
}


// ==================================================================
// ✅ [신규 기능] AI 추천용 일봉 데이터 조회 (기존 로직 및 DB 토큰 사용)
// ==================================================================

interface KisDailyPriceItem {
  stck_bsop_date: string; // 영업일자
  stck_clpr: string;      // 종가
  stck_oprc: string;      // 시가
  stck_hgpr: string;      // 고가
  stck_lwpr: string;      // 저가
  acml_vol: string;       // 거래량
}

interface KisDailyApiResponse {
  rt_cd: string;
  msg_cd: string;
  msg1: string;
  output1: any;
  output2: KisDailyPriceItem[]; // 일봉 데이터 배열
}

// 내부 함수: 토큰을 받아 일봉 데이터 요청 (상단의 APP_KEY/APP_SECRET 사용)
async function requestDailyHistoryWithToken(
  code: string,
  token: string,
  startDate: string,
  endDate: string
): Promise<number[]> {
  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'J',
    FID_INPUT_ISCD: code,
    FID_INPUT_DATE_1: startDate, // 시작일 (YYYYMMDD)
    FID_INPUT_DATE_2: endDate,   // 종료일 (YYYYMMDD)
    FID_PERIOD_DIV_CODE: 'D',    // D: 일봉
    FID_ORG_ADJ_PRC: '0',        // 0: 수정주가 미반영
  });

  const url = `${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${params.toString()}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      authorization: `Bearer ${token}`,
      appkey: APP_KEY ?? '',       // ✅ 상단에 정의된 HANKUK 키 사용
      appsecret: APP_SECRET ?? '', // ✅ 상단에 정의된 HANKUK 키 사용
      tr_id: 'FHKST03010100',      // ✅ 주식 일봉 차트 조회 TR ID
      custtype: 'P',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`[KIS] 일봉 조회 HTTP 에러: ${res.status}`);
  }

  const data = (await res.json()) as KisDailyApiResponse;

  if (data.rt_cd !== '0') {
    throw new Error(data.msg1 || `[KIS] 일봉 조회 실패 (rt_cd=${data.rt_cd})`);
  }

  const output = data.output2;
  if (!output || output.length === 0) return [];

  // 과거 -> 현재 순서로 종가만 추출하여 반환 (KIS는 최신순으로 줌 -> reverse 필요)
  return output
    .slice(0, 40) // 최대 40일치
    .map((item) => Number(item.stck_clpr))
    .reverse(); // [과거, ..., 오늘] 순서
}

// 🟢 [공개 함수] AI 분석용 일봉 데이터 가져오기 (DB 토큰 재사용)
export async function getDailyStockHistory(rawCode: string): Promise<number[]> {
  const code = normalizeStockCode(rawCode);
  const token = await getKisAccessToken(); // ✅ 기존 DB 토큰 관리 로직 그대로 활용

  // 날짜 계산 (오늘 ~ 3달 전)
  const today = new Date();
  const past = new Date();
  past.setMonth(today.getMonth() - 3);

  const formatDate = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
  
  return requestDailyHistoryWithToken(code, token, formatDate(past), formatDate(today));
}