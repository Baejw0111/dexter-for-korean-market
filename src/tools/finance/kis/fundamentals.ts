/**
 * 한국 주식 재무/기업정보 API 도구
 * @see https://apiportal.koreainvestment.com/apiservice/apiservice-domestic-stock-quotations
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { callKisApi } from './api.js';
import { TR_ID } from './constants.js';
import { formatToolResult } from '../../types.js';

// ============================================================
// 응답 타입 정의
// ============================================================

/** 재무상태표 응답 항목 */
interface BalanceSheetItem {
  stac_yymm: string; // 결산년월
  cras: string; // 유동자산
  fxas: string; // 비유동자산
  total_aset: string; // 자산총계
  flow_lblt: string; // 유동부채
  fix_lblt: string; // 비유동부채
  total_lblt: string; // 부채총계
  cpfn: string; // 자본금
  cfp_surp: string; // 자본잉여금
  prfi_surp: string; // 이익잉여금
  total_cptl: string; // 자본총계
}

/** 손익계산서 응답 항목 */
interface IncomeStatementItem {
  stac_yymm: string; // 결산년월
  sale_account: string; // 매출액
  sale_cost: string; // 매출원가
  sale_totl_prfi: string; // 매출총이익
  bsop_prti: string; // 영업이익
  op_prfi: string; // 경상이익
  thtr_ntin: string; // 당기순이익
}

/** 재무비율 응답 항목 */
interface FinancialRatioItem {
  stac_yymm: string; // 결산년월
  grs: string; // 매출액증가율
  bsop_prfi_inrt: string; // 영업이익증가율
  ntin_inrt: string; // 순이익증가율
  roe_val: string; // ROE
  eps: string; // EPS
  bps: string; // BPS
  pbr: string; // PBR
  per: string; // PER
  sps: string; // 주당매출액
  lblt_rate: string; // 부채비율
  crnt_rate: string; // 유동비율
}

/** 수익성비율 응답 항목 */
interface ProfitRatioItem {
  stac_yymm: string; // 결산년월
  bsop_prfi_rate: string; // 영업이익률
  ntin_rate: string; // 순이익률
  roe_val: string; // ROE
  roa_val: string; // ROA
  grs: string; // 매출총이익률
}

/** 안정성비율 응답 항목 */
interface StabilityRatioItem {
  stac_yymm: string; // 결산년월
  lblt_rate: string; // 부채비율
  crnt_rate: string; // 유동비율
  quck_rate: string; // 당좌비율
  bram_depn: string; // 차입금의존도
  itc_rate: string; // 이자보상배율
}

/** 성장성비율 응답 항목 */
interface GrowthRatioItem {
  stac_yymm: string; // 결산년월
  sale_grs: string; // 매출액증가율
  bsop_prfi_inrt: string; // 영업이익증가율
  ntin_inrt: string; // 순이익증가율
  total_aset_inrt: string; // 총자산증가율
  cptl_inrt: string; // 자기자본증가율
}

/** 종목정보 응답 */
interface StockInfoResponse {
  iscd_stat_cls_code: string; // 종목상태구분코드
  marg_rate: string; // 증거금률
  rprs_mrkt_kor_name: string; // 대표시장한글명
  new_hgpr_lwpr_cls_code: string; // 신고/저가구분코드
  bstp_kor_isnm: string; // 업종한글명
  temp_stop_yn: string; // 임시정지여부
  oprc_rang_cont_yn: string; // 시가범위연장여부
  clpr_rang_cont_yn: string; // 종가범위연장여부
  crdt_able_yn: string; // 신용가능여부
  elw_pblc_yn: string; // ELW발행여부
  stck_prpr: string; // 현재가
  prdy_vrss: string; // 전일대비
  prdy_ctrt: string; // 전일대비율
  acml_vol: string; // 누적거래량
  acml_tr_pbmn: string; // 누적거래대금
  hts_avls: string; // 시가총액
  per: string; // PER
  pbr: string; // PBR
  lstn_stcn: string; // 상장주수
  cpfn: string; // 자본금
  hts_frgn_ehrt: string; // 외국인소진율
  frgn_ntby_qty: string; // 외국인순매수
}

/** 종목검색 응답 항목 */
interface StockSearchItem {
  pdno: string; // 종목코드
  prdt_name: string; // 종목명
  prdt_eng_name: string; // 종목영문명
  mrkt_cls_code: string; // 시장구분
  scty_grp_id: string; // 증권그룹ID
  std_idst_cls_code: string; // 표준산업분류코드
  bstp_kor_isnm: string; // 업종명
}

// ============================================================
// 스키마 정의
// ============================================================

const TickerInputSchema = z.object({
  ticker: z.string().describe('종목코드 (6자리). 예: "005930"'),
});

const FinancialInputSchema = z.object({
  ticker: z.string().describe('종목코드 (6자리). 예: "005930"'),
  count: z.number().default(4).describe('조회 기간 수 (분기 수)'),
});

const StockSearchInputSchema = z.object({
  keyword: z.string().describe('검색 키워드 (종목명 또는 종목코드)'),
});

// ============================================================
// 유틸리티 함수
// ============================================================

function formatAmount(amount: string | undefined): string {
  if (!amount) {
    return '-';
  }
  const num = Number(amount.replace(/,/g, ''));
  if (isNaN(num)) {
    return '-';
  }
  if (Math.abs(num) >= 100000000) {
    return `${(num / 100000000).toFixed(0)}억원`;
  }
  if (Math.abs(num) >= 10000) {
    return `${(num / 10000).toFixed(0)}만원`;
  }
  return `${num.toLocaleString('ko-KR')}원`;
}

// ============================================================
// 도구 정의
// ============================================================

/**
 * KIS 재무상태표 조회
 */
export const getKisBalanceSheet = new DynamicStructuredTool({
  name: 'get_kis_balance_sheet',
  description: `KIS 기준 재무상태표(대차대조표)를 조회합니다. 자산, 부채, 자본 현황.
사용 시점: KIS 기준 재무상태표, 자산/부채/자본 구조가 필요할 때
키워드: 재무상태표, 대차대조표, 자산, 부채, 자본, 유동자산, 비유동자산`,
  schema: FinancialInputSchema,
  func: async (input) => {
    const { data, url } = await callKisApi<BalanceSheetItem[]>(
      '/uapi/domestic-stock/v1/finance/balance-sheet',
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: input.ticker,
      },
      { trId: TR_ID.BALANCE_SHEET }
    );

    const items = Array.isArray(data) ? data.slice(0, input.count) : [];

    const balanceSheet = items.map((item) => ({
      결산년월: item.stac_yymm,
      유동자산: formatAmount(item.cras),
      비유동자산: formatAmount(item.fxas),
      자산총계: formatAmount(item.total_aset),
      유동부채: formatAmount(item.flow_lblt),
      비유동부채: formatAmount(item.fix_lblt),
      부채총계: formatAmount(item.total_lblt),
      자본금: formatAmount(item.cpfn),
      자본잉여금: formatAmount(item.cfp_surp),
      이익잉여금: formatAmount(item.prfi_surp),
      자본총계: formatAmount(item.total_cptl),
    }));

    return formatToolResult(
      {
        종목코드: input.ticker,
        재무상태표: balanceSheet,
      },
      [url]
    );
  },
});

/**
 * KIS 손익계산서 조회
 */
export const getKisIncomeStatement = new DynamicStructuredTool({
  name: 'get_kis_income_statement',
  description: `KIS 기준 손익계산서를 조회합니다. 매출, 영업이익, 순이익 등.
사용 시점: KIS 기준 손익계산서, 수익성 정보가 필요할 때
키워드: 손익계산서, 매출액, 영업이익, 당기순이익, 매출원가, 매출총이익`,
  schema: FinancialInputSchema,
  func: async (input) => {
    const { data, url } = await callKisApi<IncomeStatementItem[]>(
      '/uapi/domestic-stock/v1/finance/income-statement',
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: input.ticker,
      },
      { trId: TR_ID.INCOME_STATEMENT }
    );

    const items = Array.isArray(data) ? data.slice(0, input.count) : [];

    const incomeStatement = items.map((item) => ({
      결산년월: item.stac_yymm,
      매출액: formatAmount(item.sale_account),
      매출원가: formatAmount(item.sale_cost),
      매출총이익: formatAmount(item.sale_totl_prfi),
      영업이익: formatAmount(item.bsop_prti),
      경상이익: formatAmount(item.op_prfi),
      당기순이익: formatAmount(item.thtr_ntin),
    }));

    return formatToolResult(
      {
        종목코드: input.ticker,
        손익계산서: incomeStatement,
      },
      [url]
    );
  },
});

/**
 * 재무비율 조회
 */
export const getFinancialRatio = new DynamicStructuredTool({
  name: 'get_financial_ratio',
  description: `종목의 주요 재무비율을 조회합니다. ROE, PER, PBR, EPS, BPS 등.
사용 시점: 종목의 투자지표, 재무비율 분석이 필요할 때
키워드: 재무비율, ROE, PER, PBR, EPS, BPS, 부채비율, 유동비율`,
  schema: FinancialInputSchema,
  func: async (input) => {
    const { data, url } = await callKisApi<FinancialRatioItem[]>(
      '/uapi/domestic-stock/v1/finance/financial-ratio',
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: input.ticker,
      },
      { trId: TR_ID.FINANCIAL_RATIO }
    );

    const items = Array.isArray(data) ? data.slice(0, input.count) : [];

    const ratios = items.map((item) => ({
      결산년월: item.stac_yymm,
      매출액증가율: `${item.grs}%`,
      영업이익증가율: `${item.bsop_prfi_inrt}%`,
      순이익증가율: `${item.ntin_inrt}%`,
      ROE: `${item.roe_val}%`,
      EPS: item.eps,
      BPS: item.bps,
      PER: item.per,
      PBR: item.pbr,
      주당매출액: item.sps,
      부채비율: `${item.lblt_rate}%`,
      유동비율: `${item.crnt_rate}%`,
    }));

    return formatToolResult(
      {
        종목코드: input.ticker,
        재무비율: ratios,
      },
      [url]
    );
  },
});

/**
 * 수익성비율 조회
 */
export const getProfitRatio = new DynamicStructuredTool({
  name: 'get_profit_ratio',
  description: `종목의 수익성비율을 조회합니다. 영업이익률, 순이익률, ROE, ROA 등.
사용 시점: 기업의 수익성 분석이 필요할 때
키워드: 수익성, 영업이익률, 순이익률, ROE, ROA, 매출총이익률`,
  schema: FinancialInputSchema,
  func: async (input) => {
    const { data, url } = await callKisApi<ProfitRatioItem[]>(
      '/uapi/domestic-stock/v1/finance/profit-ratio',
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: input.ticker,
      },
      { trId: TR_ID.PROFIT_RATIO }
    );

    const items = Array.isArray(data) ? data.slice(0, input.count) : [];

    const ratios = items.map((item) => ({
      결산년월: item.stac_yymm,
      매출총이익률: `${item.grs}%`,
      영업이익률: `${item.bsop_prfi_rate}%`,
      순이익률: `${item.ntin_rate}%`,
      ROE: `${item.roe_val}%`,
      ROA: `${item.roa_val}%`,
    }));

    return formatToolResult(
      {
        종목코드: input.ticker,
        수익성비율: ratios,
      },
      [url]
    );
  },
});

/**
 * 안정성비율 조회
 */
export const getStabilityRatio = new DynamicStructuredTool({
  name: 'get_stability_ratio',
  description: `종목의 안정성비율을 조회합니다. 부채비율, 유동비율, 당좌비율 등.
사용 시점: 기업의 재무 안정성 분석이 필요할 때
키워드: 안정성, 부채비율, 유동비율, 당좌비율, 차입금의존도, 이자보상배율`,
  schema: FinancialInputSchema,
  func: async (input) => {
    const { data, url } = await callKisApi<StabilityRatioItem[]>(
      '/uapi/domestic-stock/v1/finance/stability-ratio',
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: input.ticker,
      },
      { trId: TR_ID.STABILITY_RATIO }
    );

    const items = Array.isArray(data) ? data.slice(0, input.count) : [];

    const ratios = items.map((item) => ({
      결산년월: item.stac_yymm,
      부채비율: `${item.lblt_rate}%`,
      유동비율: `${item.crnt_rate}%`,
      당좌비율: `${item.quck_rate}%`,
      차입금의존도: `${item.bram_depn}%`,
      이자보상배율: item.itc_rate,
    }));

    return formatToolResult(
      {
        종목코드: input.ticker,
        안정성비율: ratios,
      },
      [url]
    );
  },
});

/**
 * 성장성비율 조회
 */
export const getGrowthRatio = new DynamicStructuredTool({
  name: 'get_growth_ratio',
  description: `종목의 성장성비율을 조회합니다. 매출액/영업이익/순이익 증가율 등.
사용 시점: 기업의 성장성 분석이 필요할 때
키워드: 성장성, 매출성장, 이익성장, 자산성장, 자본성장, 증가율`,
  schema: FinancialInputSchema,
  func: async (input) => {
    const { data, url } = await callKisApi<GrowthRatioItem[]>(
      '/uapi/domestic-stock/v1/finance/growth-ratio',
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: input.ticker,
      },
      { trId: TR_ID.GROWTH_RATIO }
    );

    const items = Array.isArray(data) ? data.slice(0, input.count) : [];

    const ratios = items.map((item) => ({
      결산년월: item.stac_yymm,
      매출액증가율: `${item.sale_grs}%`,
      영업이익증가율: `${item.bsop_prfi_inrt}%`,
      순이익증가율: `${item.ntin_inrt}%`,
      총자산증가율: `${item.total_aset_inrt}%`,
      자기자본증가율: `${item.cptl_inrt}%`,
    }));

    return formatToolResult(
      {
        종목코드: input.ticker,
        성장성비율: ratios,
      },
      [url]
    );
  },
});

/**
 * 종목정보 조회
 */
export const getStockInfo = new DynamicStructuredTool({
  name: 'get_stock_info',
  description: `종목의 기본 정보를 조회합니다. 업종, 시장구분, 신용가능여부 등.
사용 시점: 종목의 기본 정보, 업종, 거래 관련 정보가 필요할 때
키워드: 종목정보, 업종, 시장구분, 신용가능, 증거금률, 외국인소진율`,
  schema: TickerInputSchema,
  func: async (input) => {
    const { data, url } = await callKisApi<StockInfoResponse>(
      '/uapi/domestic-stock/v1/quotations/search-stock-info',
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: input.ticker,
      },
      { trId: TR_ID.STOCK_INFO }
    );

    return formatToolResult(
      {
        종목코드: input.ticker,
        시장구분: data.rprs_mrkt_kor_name,
        업종: data.bstp_kor_isnm,
        종목상태: data.iscd_stat_cls_code,
        현재가: Number(data.stck_prpr).toLocaleString('ko-KR'),
        전일대비: Number(data.prdy_vrss).toLocaleString('ko-KR'),
        등락률: `${data.prdy_ctrt}%`,
        거래량: Number(data.acml_vol).toLocaleString('ko-KR'),
        시가총액: `${(Number(data.hts_avls) / 10000).toFixed(1)}조원`,
        PER: data.per,
        PBR: data.pbr,
        상장주수: Number(data.lstn_stcn).toLocaleString('ko-KR'),
        자본금: formatAmount(data.cpfn),
        증거금률: `${data.marg_rate}%`,
        신용가능여부: data.crdt_able_yn === 'Y' ? '가능' : '불가',
        외국인소진율: `${data.hts_frgn_ehrt}%`,
        외국인순매수: Number(data.frgn_ntby_qty).toLocaleString('ko-KR'),
        임시정지여부: data.temp_stop_yn === 'Y' ? '정지' : '정상',
      },
      [url]
    );
  },
});

/**
 * 종목 검색
 */
export const searchStocks = new DynamicStructuredTool({
  name: 'search_stocks',
  description: `종목명 또는 종목코드로 종목을 검색합니다.
사용 시점: 종목명으로 종목코드를 찾거나, 종목을 검색할 때
키워드: 종목검색, 종목찾기, 종목코드검색, 종목명검색`,
  schema: StockSearchInputSchema,
  func: async (input) => {
    const { data, url } = await callKisApi<StockSearchItem[]>(
      '/uapi/domestic-stock/v1/quotations/search-stock-info',
      {
        PDNO: '',
        PRDT_TYPE_CD: '300',
      },
      { trId: TR_ID.STOCK_SEARCH }
    );

    const items = Array.isArray(data) ? data : [];

    // 키워드로 필터링
    const keyword = input.keyword.toLowerCase();
    const filtered = items
      .filter(
        (item) =>
          item.prdt_name?.toLowerCase().includes(keyword) ||
          item.prdt_eng_name?.toLowerCase().includes(keyword) ||
          item.pdno?.includes(keyword)
      )
      .slice(0, 20);

    const results = filtered.map((item) => ({
      종목코드: item.pdno,
      종목명: item.prdt_name,
      종목영문명: item.prdt_eng_name,
      시장구분: item.mrkt_cls_code === 'J' ? 'KOSPI' : 'KOSDAQ',
      업종: item.bstp_kor_isnm,
    }));

    return formatToolResult(
      {
        검색어: input.keyword,
        검색결과수: results.length,
        종목목록: results,
      },
      [url]
    );
  },
});
