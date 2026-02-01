/**
 * DART Open API 클라이언트
 * @see https://opendart.fss.or.kr/guide/main.do
 */

const BASE_URL = 'https://opendart.fss.or.kr/api';

export interface DartApiResponse<T = Record<string, unknown>> {
  data: T;
  url: string;
  status: string;
  message: string;
}

export interface DartListResponse<T> {
  status: string;
  message: string;
  page_no: number;
  page_count: number;
  total_count: number;
  total_page: number;
  list: T[];
}

/**
 * DART API 호출
 */
export async function callDartApi<T = Record<string, unknown>>(
  endpoint: string,
  params: Record<string, string | number | undefined>
): Promise<DartApiResponse<T>> {
  const apiKey = process.env.DART_API_KEY;

  if (!apiKey) {
    throw new Error('DART_API_KEY must be set');
  }

  const url = new URL(`${BASE_URL}${endpoint}`);

  // API 키 추가
  url.searchParams.append('crtfc_key', apiKey);

  // 파라미터 추가
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, String(value));
    }
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`DART API request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // DART API 상태 코드 확인
  // 000: 정상, 010: 등록되지 않은 키, 011: 사용할 수 없는 키, 등
  if (data.status && data.status !== '000') {
    throw new Error(`DART API error: [${data.status}] ${data.message}`);
  }

  return {
    data,
    url: url.toString(),
    status: data.status || '000',
    message: data.message || '정상',
  };
}

/**
 * DART 날짜 포맷 (YYYYMMDD)
 */
export function formatDartDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * 사업연도 계산 (YYYY)
 */
export function getBusinessYear(yearsAgo: number = 0): string {
  const year = new Date().getFullYear() - yearsAgo;
  return String(year);
}

/**
 * 보고서 코드
 */
export const REPORT_CODE = {
  /** 1분기보고서 */
  Q1: '11013',
  /** 반기보고서 */
  Q2: '11012',
  /** 3분기보고서 */
  Q3: '11014',
  /** 사업보고서 */
  ANNUAL: '11011',
} as const;

/**
 * 재무제표 구분
 */
export const FS_DIV = {
  /** 연결재무제표 */
  CONSOLIDATED: 'CFS',
  /** 별도재무제표 */
  SEPARATE: 'OFS',
} as const;

/**
 * 공시 유형
 */
export const DISCLOSURE_TYPE = {
  /** 정기공시 */
  REGULAR: 'A',
  /** 주요사항보고 */
  MAJOR: 'B',
  /** 발행공시 */
  ISSUE: 'C',
  /** 지분공시 */
  SHARE: 'D',
  /** 기타공시 */
  OTHER: 'E',
  /** 외부감사관련 */
  AUDIT: 'F',
  /** 펀드공시 */
  FUND: 'G',
  /** 자산유동화 */
  ABS: 'H',
  /** 거래소공시 */
  EXCHANGE: 'I',
  /** 공정위공시 */
  FTC: 'J',
} as const;
