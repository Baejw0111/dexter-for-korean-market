/**
 * 한국투자증권 API 클라이언트
 * @see https://apiportal.koreainvestment.com/apiservice
 */

import { getAccessToken, getBaseUrl } from './auth';
import { fetchWithLogging } from '../../../utils/api-logger.js';

export interface KISApiResponse<T = Record<string, unknown>> {
  data: T;
  url: string;
  rt_cd: string;
  msg_cd: string;
  msg1: string;
}

export interface KISApiOptions {
  /** 거래 ID (tr_id) */
  trId: string;
  /** HTTP 메서드 (기본: GET) */
  method?: 'GET' | 'POST';
  /** 연속조회 키 */
  trCont?: string;
  /** 고객 타입 (기본: P - 개인) */
  custtype?: 'P' | 'B';
}

/**
 * KIS API 호출
 */
export async function callKisApi<T = Record<string, unknown>>(
  endpoint: string,
  params: Record<string, string | number | undefined>,
  options: KISApiOptions
): Promise<KISApiResponse<T>> {
  const baseUrl = getBaseUrl();
  const accessToken = await getAccessToken();
  const appKey = process.env.KIS_APP_KEY || '';
  const appSecret = process.env.KIS_APP_SECRET || '';

  const { trId, method = 'GET', trCont = '', custtype = 'P' } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    authorization: `Bearer ${accessToken}`,
    appkey: appKey,
    appsecret: appSecret,
    tr_id: trId,
    custtype,
  };

  if (trCont) {
    headers['tr_cont'] = trCont;
  }

  let url: URL;
  let body: string | undefined;

  if (method === 'GET') {
    url = new URL(`${baseUrl}${endpoint}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    }
  } else {
    url = new URL(`${baseUrl}${endpoint}`);
    body = JSON.stringify(params);
  }

  const response = await fetchWithLogging('KIS', url.toString(), {
    method,
    headers,
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`KIS API request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();

  // KIS API 응답 코드 확인
  if (data.rt_cd !== '0') {
    throw new Error(`KIS API error: [${data.msg_cd}] ${data.msg1}`);
  }

  return {
    data: data.output || data.output1 || data.output2 || data,
    url: url.toString(),
    rt_cd: data.rt_cd,
    msg_cd: data.msg_cd,
    msg1: data.msg1,
  };
}

/**
 * 날짜를 YYYYMMDD 형식으로 변환
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * 오늘 날짜를 YYYYMMDD 형식으로 반환
 */
export function getToday(): string {
  return formatDate(new Date());
}

/**
 * N일 전 날짜를 YYYYMMDD 형식으로 반환
 */
export function getDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return formatDate(date);
}
