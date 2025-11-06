// src/lib/kisClient.ts
import 'server-only';

const BASE_URL =
  process.env.KIS_BASE_URL ??
  'https://openapi.koreainvestment.com:9443';

const APP_KEY = process.env.HANKUK_API_KEY;
const APP_SECRET = process.env.HANKUK_SECRET_KEY;

if (!APP_KEY || !APP_SECRET) {
  // eslint-disable-next-line no-console
  console.error(
    '[KIS] HANKUK_API_KEY 또는 HANKUK_SECRET_KEY 환경변수가 설정되어 있지 않습니다.',
  );
}

interface KisTokenResponse {
  access_token: string;
  token_type: string;
  // KIS 문서에는 expires_in이 있을 수 있지만,
  // 여기서는 "하루 1회" 원칙에 맞춰 프로세스 생명주기 동안 재사용만 합니다.
  expires_in?: number;
}

interface KisPriceRawOutput {
  stck_shrn_iscd?: string; // 단축코드 (6자리)
  hts_kor_isnm?: string;   // 한글 종목명
  prdt_abrv_name?: string;
  stck_prpr?: string;      // 현재가
  stck_oprc?: string;      // 시가
  stck_hgpr?: string;      // 고가
  stck_lwpr?: string;      // 저가
  acml_vol?: string;       // 거래량
  prdy_ctrt?: string;      // 전일 대비율 (%)
  prdy_vrss?: string;      // 전일 대비 금액
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
  changeRate: number;    // 등락률 (%)
  changePrice?: number;  // 전일대비 금액
}

// ---- 토큰 캐시 (1일 1회 발급 원칙) ----
let cachedToken: string | null = null;
// 동시에 여러 요청이 들어왔을 때 tokenP를 여러 번 안 때리도록 막기용
let issuingPromise: Promise<string> | null = null;

/**
 * 실제로 KIS에 요청해서 새로운 access_token 발급
 * (내부에서만 사용)
 */
async function issueNewToken(): Promise<string> {
  if (!APP_KEY || !APP_SECRET) {
    throw new Error('[KIS] AppKey/AppSecret 환경변수가 없습니다.');
  }

  const res = await fetch(`${BASE_URL}/oauth2/tokenP`, {
    method: 'POST',
    headers: {
      // ✅ 이 포맷이 네가 쓰던 "잘 되던" 포맷 (JSON)
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
    // eslint-disable-next-line no-console
    console.error('[KIS] tokenP HTTP error:', res.status, text);
    throw new Error(
      `[KIS] 접근토큰 발급 실패: ${res.status} ${text}`,
    );
  }

  const data = (await res.json()) as KisTokenResponse;

  if (!data.access_token) {
    throw new Error('[KIS] access_token이 응답에 없습니다.');
  }

  // 여기서 딱 1번만 발급해서 캐시에 보관
  cachedToken = data.access_token;

  // eslint-disable-next-line no-console
  console.log('[KIS] 새로운 access_token 발급 완료');

  return cachedToken;
}

/**
 * KIS access_token 가져오기
 * - 이미 발급된 토큰이 있으면 그대로 재사용
 * - 없을 때만 tokenP 호출 → "1일 1회" 원칙에 최대한 맞춰 사용
 * - 동시에 여러 요청이 들어와도 tokenP는 딱 1번만 호출
 */
export async function getKisAccessToken(): Promise<string> {
  // 이미 토큰이 있다면 바로 리턴
  if (cachedToken) {
    return cachedToken;
  }

  // 누군가 이미 발급 중이면 그 Promise 기다렸다가 결과 공유
  if (issuingPromise) {
    return issuingPromise;
  }

  // 실제 발급 시작
  issuingPromise = issueNewToken()
    .catch((err) => {
      // 발급 실패하면 캐시를 남기면 안 되므로 초기화
      cachedToken = null;
      throw err;
    })
    .finally(() => {
      issuingPromise = null;
    });

  return issuingPromise;
}

/**
 * 종목코드를 KIS에서 요구하는 6자리 숫자형으로 정리
 * - "28050" -> "028050"
 * - "005930"은 그대로
 */
function normalizeStockCode(rawCode: string): string {
  const onlyDigits = rawCode.replace(/[^0-9]/g, '');
  if (!onlyDigits) {
    throw new Error('[KIS] 종목코드가 비어 있습니다.');
  }
  return onlyDigits.slice(-6).padStart(6, '0');
}

/**
 * 국내주식 현재가 시세 조회
 * - API: /uapi/domestic-stock/v1/quotations/inquire-price
 * - TR_ID: FHKST01010100
 */
export async function getDomesticStockPrice(
  rawCode: string,
): Promise<KisPriceResult> {
  if (!APP_KEY || !APP_SECRET) {
    throw new Error('[KIS] AppKey/AppSecret 환경변수가 없습니다.');
  }

  const code = normalizeStockCode(rawCode);
  const token = await getKisAccessToken();

  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'UN', // ✅ 통합 (KRX + NXT)
    FID_INPUT_ISCD: code,         // 6자리 종목코드
  });

  const url = `${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price?${params.toString()}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      authorization: `Bearer ${token}`,
      appkey: APP_KEY,
      appsecret: APP_SECRET,
      tr_id: 'FHKST01010100',
      custtype: 'P',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    // eslint-disable-next-line no-console
    console.error(
      '[KIS] inquire-price HTTP error:',
      res.status,
      text,
    );
    throw new Error(
      `[KIS] 현재가 조회 HTTP 에러: ${res.status} ${text}`,
    );
  }

  const data = (await res.json()) as KisPriceApiResponse;

  if (data.rt_cd !== '0') {
    // eslint-disable-next-line no-console
    console.error(
      '[KIS] inquire-price biz error:',
      data.msg_cd,
      data.msg1,
    );
    throw new Error(
      data.msg1 ||
        `[KIS] 현재가 조회 실패 (rt_cd=${data.rt_cd})`,
    );
  }

  const o = data.output ?? {};

  const currentPrice = Number(o.stck_prpr ?? 0);
  const openPrice = Number(o.stck_oprc ?? 0);
  const highPrice = Number(o.stck_hgpr ?? 0);
  const lowPrice = Number(o.stck_lwpr ?? 0);
  const volume = Number(o.acml_vol ?? 0);
  const changeRate = Number(o.prdy_ctrt ?? 0);
  const changePrice =
    o.prdy_vrss !== undefined
      ? Number(o.prdy_vrss)
      : undefined;

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
