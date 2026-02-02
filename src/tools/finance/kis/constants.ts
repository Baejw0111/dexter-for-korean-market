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
  /** 주식현재가 상세 */
  PRICE_DETAIL: 'FHKST01010200',
  /** 주식현재가 일자별 */
  PRICE_DAILY: 'FHKST01010400',
  /** 주식현재가 체결 */
  PRICE_TICK: 'FHKST01010300',
  /** 주식현재가 호가 */
  ASKING_PRICE: 'FHKST01010200',
  /** 주식현재가 시간외 시세 */
  OVERTIME_PRICE: 'FHKST01010700',
  /** 주식현재가 시간외 호가 */
  OVERTIME_ASKING_PRICE: 'FHKST01010800',
  /** 종목별 일별 거래량 */
  DAILY_TRADE_VOLUME: 'FHKST01010200',
  /** 종목 종합 정보 */
  STOCK_INFO: 'FHKST01010600',

  // === 차트 ===
  /** 일별 차트 */
  DAILY_CHART: 'FHKST03010100',
  /** 분별 차트 */
  TIME_CHART: 'FHKST03010200',
  /** 지수 일별 차트 */
  INDEX_DAILY_CHART: 'FHKUP03500100',
  /** 지수 분별 차트 */
  INDEX_TIME_CHART: 'FHKUP03500200',

  // === 순위 (Ranking) ===
  /** 등락률 순위 */
  RANKING_FLUCTUATION: 'FHPST01700000',
  /** 거래량 순위 */
  RANKING_VOLUME: 'FHPST01710000',
  /** 시가총액 순위 */
  RANKING_MARKET_CAP: 'FHPST01740000',
  /** 거래대금 순위 */
  RANKING_TRADING_VALUE: 'FHPST01720000',
  /** 신고가/신저가 */
  RANKING_NEW_HIGH_LOW: 'FHPST01760000',
  /** 이격도 순위 */
  RANKING_DISPARITY: 'FHPST01750000',
  /** 체결강도 순위 */
  RANKING_VOLUME_POWER: 'FHPST01790000',
  /** 호가잔량 순위 */
  RANKING_QUOTE_BALANCE: 'FHPST01780000',
  /** 시간외 등락률 순위 */
  RANKING_OVERTIME_FLUCT: 'FHPST01800000',
  /** 시간외 거래량 순위 */
  RANKING_OVERTIME_VOLUME: 'FHPST01810000',
  /** 관심종목 순위 */
  RANKING_INTEREST: 'FHPST01770000',
  /** 예상체결가 순위 */
  RANKING_EXPECTED_PRICE: 'FHPST01730000',

  // === 투자자별 ===
  /** 종목별 투자자 매매동향 (일별) */
  INVESTOR_DAILY: 'FHKST01010900',
  /** 종목별 외국인/기관 매매동향 (종합) */
  INVESTOR_TREND: 'FHKST01010800',
  /** 시장별 투자자 일별 동향 */
  INVESTOR_DAILY_BY_MARKET: 'FHPTJ04400000',
  /** 시장별 투자자 시간별 동향 */
  INVESTOR_TIME_BY_MARKET: 'FHPTJ04410000',
  /** 외국인/기관 종합 */
  FOREIGN_INSTITUTION_TOTAL: 'FHKST01010700',
  /** 외국인 매매추이 */
  FOREIGN_TRADING_TREND: 'FHPTJ04380000',
  /** 회원사별 매매 */
  MEMBER_TRADING: 'FHKST01010500',
  /** 회원사별 일별 */
  MEMBER_DAILY: 'FHPTJ04170000',

  // === 신용/대차 ===
  /** 종목별 신용잔고 추이 */
  CREDIT_BALANCE: 'FHKST03030100',
  /** 종목별 공매도 일별추이 */
  SHORT_SELLING: 'FHKST03060100',
  /** 일별 공매도 종합 */
  DAILY_SHORT_SELLING: 'FHPTJ04330000',
  /** 대차가능 종목 */
  LENDABLE_STOCKS: 'FHPTJ04390000',
  /** 신용융자 회사별 */
  CREDIT_BY_COMPANY: 'FHPTJ04320000',

  // === 프로그램매매 ===
  /** 프로그램 매매 일별 추이 */
  PROGRAM_TRADING: 'FHKUP03100500',
  /** 프로그램매매 종목별 */
  PROGRAM_BY_STOCK: 'FHKST03080100',
  /** 프로그램매매 일별 추이(종목) */
  PROGRAM_DAILY_BY_STOCK: 'FHKST03080200',
  /** 투자자별 프로그램매매 */
  INVESTOR_PROGRAM: 'FHKUP03100600',

  // === 시장 정보 ===
  /** 국내주식 업종기간별시세 */
  SECTOR_PRICE: 'FHKUP03500100',
  /** 휴장일 조회 */
  HOLIDAY: 'CTCA0903R',
  /** 장운영시간 */
  MARKET_TIME: 'FHKST03030000',

  // === 지수 ===
  /** 지수 현재가 */
  INDEX_PRICE: 'FHPUP02100000',
  /** 지수 일별시세 */
  INDEX_DAILY_PRICE: 'FHPUP02100100',
  /** 지수 분별시세 */
  INDEX_TIME_PRICE: 'FHPUP02100200',
  /** 지수 체결 */
  INDEX_CONCLUSION: 'FHPUP02100300',
  /** 지수 프로그램매매 */
  INDEX_PROGRAM: 'FHKUP03100700',
  /** 업종별 시세 */
  SECTOR_PRICE_LIST: 'FHKUP03500000',

  // === 재무 ===
  /** 재무상태표 */
  BALANCE_SHEET: 'FHKST66430100',
  /** 손익계산서 */
  INCOME_STATEMENT: 'FHKST66430200',
  /** 재무비율 */
  FINANCIAL_RATIO: 'FHKST66430300',
  /** 수익성비율 */
  PROFIT_RATIO: 'FHKST66430400',
  /** 안정성비율 */
  STABILITY_RATIO: 'FHKST66430500',
  /** 성장성비율 */
  GROWTH_RATIO: 'FHKST66430600',
  /** 기타주요비율 */
  OTHER_RATIO: 'FHKST66430700',
  /** 수익자산지표 */
  PROFIT_ASSET_INDEX: 'FHKST66430800',

  // === 기업이벤트(KSD) ===
  /** 배당정보 */
  KSD_DIVIDEND: 'HHKDB669102C0',
  /** 무상증자 */
  KSD_BONUS_ISSUE: 'HHKDB669103C0',
  /** 유상증자 */
  KSD_RIGHTS_ISSUE: 'HHKDB669104C0',
  /** 감자 */
  KSD_CAPITAL_DECREASE: 'HHKDB669105C0',
  /** 합병/분할 */
  KSD_MERGER_SPLIT: 'HHKDB669106C0',
  /** 주식병합 */
  KSD_REVERSE_SPLIT: 'HHKDB669107C0',
  /** 공모 */
  KSD_PUBLIC_OFFERING: 'HHKDB669108C0',
  /** 주주총회 */
  KSD_SHAREHOLDER_MEETING: 'HHKDB669109C0',
  /** 상장정보 */
  KSD_LISTING_INFO: 'HHKDB669101C0',
  /** 의무보유 */
  KSD_MANDATORY_DEPOSIT: 'HHKDB669110C0',
  /** 실권주 */
  KSD_FORFEIT: 'HHKDB669111C0',
  /** 배당수익률 */
  DIVIDEND_YIELD: 'FHKST01010800',
  /** 권리일정 */
  PERIOD_RIGHTS: 'FHPTJ04350000',

  // === 뉴스/검색 ===
  /** 뉴스 제목 */
  NEWS_TITLE: 'FHKST01010800',
  /** 종목 검색 */
  STOCK_SEARCH: 'CTPF1604R',
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
