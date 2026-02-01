/**
 * 한국투자증권 API 상수
 * @see https://apiportal.koreainvestment.com/apiservice
 */

/**
 * 거래 ID (TR_ID) 상수
 * 실전/모의 구분: 실전은 FHKST, 모의는 VHKST로 시작
 */
export const TR_ID = {
  // === 시세 조회 ===
  /** 주식현재가 시세 */
  PRICE_CURRENT: 'FHKST01010100',
  /** 주식현재가 일자별 */
  PRICE_DAILY: 'FHKST01010400',
  /** 주식현재가 체결 */
  PRICE_TICK: 'FHKST01010300',

  // === 시장 정보 ===
  /** 국내주식 업종기간별시세 */
  SECTOR_PRICE: 'FHKUP03500100',
  /** 등락률 순위 */
  RANKING_FLUCTUATION: 'FHPST01700000',
  /** 거래량 순위 */
  RANKING_VOLUME: 'FHPST01710000',

  // === 투자자별 ===
  /** 종목별 투자자 매매동향 (일별) */
  INVESTOR_DAILY: 'FHKST01010900',
  /** 종목별 외국인/기관 매매동향 (종합) */
  INVESTOR_TREND: 'FHKST01010800',

  // === 신용/대차 ===
  /** 종목별 신용잔고 추이 */
  CREDIT_BALANCE: 'FHKST03030100',
  /** 종목별 공매도 일별추이 */
  SHORT_SELLING: 'FHKST03060100',

  // === 프로그램매매 ===
  /** 프로그램 매매 일별 추이 */
  PROGRAM_TRADING: 'FHKUP03100500',
} as const;

/**
 * 시장 구분 코드
 */
export const MARKET_CODE = {
  /** 전체 */
  ALL: '0000',
  /** KOSPI */
  KOSPI: '0001',
  /** KOSDAQ */
  KOSDAQ: '1001',
  /** KOSPI200 */
  KOSPI200: '2001',
} as const;

/**
 * 기간 구분 코드
 */
export const PERIOD_CODE = {
  /** 일 */
  DAY: 'D',
  /** 주 */
  WEEK: 'W',
  /** 월 */
  MONTH: 'M',
  /** 년 */
  YEAR: 'Y',
} as const;

/**
 * 수정주가 구분
 */
export const ADJ_PRICE_CODE = {
  /** 수정주가 미반영 */
  UNADJUSTED: '0',
  /** 수정주가 반영 */
  ADJUSTED: '1',
} as const;
