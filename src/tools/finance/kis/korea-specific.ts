/**
 * 한국 시장 특화 도구
 * 공매도, 투자자별 매매동향, 신용잔고, 프로그램매매
 * @see https://apiportal.koreainvestment.com/apiservice/apiservice-domestic-stock-quotations
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { callKisApi, getToday, getDaysAgo } from './api.js';
import { TR_ID } from './constants.js';
import { formatToolResult } from '../../types.js';

/**
 * 투자자별 매매동향 응답 항목
 */
interface InvestorTrendItem {
  /** 일자 */
  stck_bsop_date: string;
  /** 개인 순매수 */
  prsn_ntby_qty: string;
  /** 외국인 순매수 */
  frgn_ntby_qty: string;
  /** 기관계 순매수 */
  orgn_ntby_qty: string;
  /** 개인 매수 */
  prsn_seln_vol: string;
  /** 개인 매도 */
  prsn_shnu_vol: string;
  /** 외국인 매수 */
  frgn_seln_vol: string;
  /** 외국인 매도 */
  frgn_shnu_vol: string;
  /** 기관 매수 */
  orgn_seln_vol: string;
  /** 기관 매도 */
  orgn_shnu_vol: string;
}

/**
 * 신용잔고 응답 항목
 */
interface CreditBalanceItem {
  /** 일자 */
  stck_bsop_date: string;
  /** 신용잔고 */
  crdt_blnc: string;
  /** 신용잔고율 */
  crdt_blnc_rate: string;
  /** 신용잔고 전일대비 */
  prdy_vrss_crdt_blnc: string;
  /** 대주잔고 */
  ssts_blnc: string;
  /** 대주잔고율 */
  ssts_blnc_rate: string;
}

/**
 * 공매도 응답 항목
 */
interface ShortSellingItem {
  /** 일자 */
  stck_bsop_date: string;
  /** 공매도량 */
  ssts_cntg_qty: string;
  /** 공매도금액 */
  ssts_cntg_amt: string;
  /** 공매도비중 */
  ssts_vol_rlim: string;
  /** 거래량 */
  acml_vol: string;
  /** 공매도잔고 */
  ssts_blnc_qty: string;
  /** 공매도잔고비율 */
  ssts_blnc_rate: string;
}

const StockInputSchema = z.object({
  ticker: z.string().describe('종목코드. 예: "005930", ETF는 "0048J0"'),
});

const StockDateRangeInputSchema = z.object({
  ticker: z.string().describe('종목코드. 예: "005930", ETF는 "0048J0"'),
  start_date: z
    .string()
    .optional()
    .describe('시작일 (YYYYMMDD). 생략시 30일 전'),
  end_date: z.string().optional().describe('종료일 (YYYYMMDD). 생략시 오늘'),
});

export const getInvestorTrends = new DynamicStructuredTool({
  name: 'get_investor_trends',
  description:
    '종목별 투자자 매매동향을 조회합니다. 외국인, 기관, 개인의 순매수/순매도 현황을 확인할 수 있습니다. 수급 분석에 유용합니다.',
  schema: StockDateRangeInputSchema,
  func: async (input) => {
    const endDate = input.end_date || getToday();
    const startDate = input.start_date || getDaysAgo(30);

    const { data, url } = await callKisApi<InvestorTrendItem[]>(
      '/uapi/domestic-stock/v1/quotations/inquire-investor',
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: input.ticker,
        FID_INPUT_DATE_1: startDate,
        FID_INPUT_DATE_2: endDate,
      },
      { trId: TR_ID.INVESTOR_DAILY }
    );

    const items = Array.isArray(data) ? data : [data];

    const trends = items
      .filter((item) => item.stck_bsop_date)
      .map((item) => ({
        일자: item.stck_bsop_date,
        외국인순매수: Number(item.frgn_ntby_qty).toLocaleString('ko-KR'),
        기관순매수: Number(item.orgn_ntby_qty).toLocaleString('ko-KR'),
        개인순매수: Number(item.prsn_ntby_qty).toLocaleString('ko-KR'),
        외국인매수: Number(item.frgn_seln_vol).toLocaleString('ko-KR'),
        외국인매도: Number(item.frgn_shnu_vol).toLocaleString('ko-KR'),
        기관매수: Number(item.orgn_seln_vol).toLocaleString('ko-KR'),
        기관매도: Number(item.orgn_shnu_vol).toLocaleString('ko-KR'),
      }));

    // 누적 계산
    let foreignTotal = 0;
    let institutionTotal = 0;
    let individualTotal = 0;

    for (const item of items) {
      foreignTotal += Number(item.frgn_ntby_qty) || 0;
      institutionTotal += Number(item.orgn_ntby_qty) || 0;
      individualTotal += Number(item.prsn_ntby_qty) || 0;
    }

    return formatToolResult(
      {
        종목코드: input.ticker,
        조회기간: `${startDate} ~ ${endDate}`,
        누적순매수: {
          외국인: foreignTotal.toLocaleString('ko-KR'),
          기관: institutionTotal.toLocaleString('ko-KR'),
          개인: individualTotal.toLocaleString('ko-KR'),
        },
        일별매매동향: trends,
      },
      [url]
    );
  },
});

export const getCreditBalance = new DynamicStructuredTool({
  name: 'get_credit_balance',
  description:
    '종목의 신용잔고 추이를 조회합니다. 신용융자 잔고와 대주잔고를 확인할 수 있습니다. 개인 투자자의 레버리지 현황을 파악하는데 유용합니다.',
  schema: StockDateRangeInputSchema,
  func: async (input) => {
    const endDate = input.end_date || getToday();
    const startDate = input.start_date || getDaysAgo(30);

    const { data, url } = await callKisApi<CreditBalanceItem[]>(
      '/uapi/domestic-stock/v1/quotations/inquire-daily-credit-balance',
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: input.ticker,
        FID_INPUT_DATE_1: startDate,
        FID_INPUT_DATE_2: endDate,
      },
      { trId: TR_ID.CREDIT_BALANCE }
    );

    const items = Array.isArray(data) ? data : [data];

    const balances = items
      .filter((item) => item.stck_bsop_date)
      .map((item) => ({
        일자: item.stck_bsop_date,
        신용잔고: Number(item.crdt_blnc).toLocaleString('ko-KR'),
        신용잔고율: `${item.crdt_blnc_rate}%`,
        전일대비: Number(item.prdy_vrss_crdt_blnc).toLocaleString('ko-KR'),
        대주잔고: Number(item.ssts_blnc).toLocaleString('ko-KR'),
        대주잔고율: `${item.ssts_blnc_rate}%`,
      }));

    return formatToolResult(
      {
        종목코드: input.ticker,
        조회기간: `${startDate} ~ ${endDate}`,
        신용잔고추이: balances,
      },
      [url]
    );
  },
});

export const getShortSelling = new DynamicStructuredTool({
  name: 'get_short_selling',
  description:
    '종목의 공매도 현황을 조회합니다. 공매도량, 공매도비중, 공매도잔고를 확인할 수 있습니다. 숏 포지션 동향을 파악하는데 유용합니다.',
  schema: StockDateRangeInputSchema,
  func: async (input) => {
    const endDate = input.end_date || getToday();
    const startDate = input.start_date || getDaysAgo(30);

    const { data, url } = await callKisApi<ShortSellingItem[]>(
      '/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice',
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: input.ticker,
        FID_INPUT_DATE_1: startDate,
        FID_INPUT_DATE_2: endDate,
        FID_PERIOD_DIV_CODE: 'D',
        FID_ORG_ADJ_PRC: '0',
      },
      { trId: TR_ID.SHORT_SELLING }
    );

    const items = Array.isArray(data) ? data : [data];

    const shortData = items
      .filter((item) => item.stck_bsop_date)
      .map((item) => ({
        일자: item.stck_bsop_date,
        공매도량: Number(item.ssts_cntg_qty || 0).toLocaleString('ko-KR'),
        공매도금액: `${(Number(item.ssts_cntg_amt || 0) / 100000000).toFixed(
          1
        )}억원`,
        공매도비중: `${item.ssts_vol_rlim || 0}%`,
        거래량: Number(item.acml_vol || 0).toLocaleString('ko-KR'),
        공매도잔고: Number(item.ssts_blnc_qty || 0).toLocaleString('ko-KR'),
        잔고비율: `${item.ssts_blnc_rate || 0}%`,
      }));

    return formatToolResult(
      {
        종목코드: input.ticker,
        조회기간: `${startDate} ~ ${endDate}`,
        공매도현황: shortData,
      },
      [url]
    );
  },
});

export const getProgramTrading = new DynamicStructuredTool({
  name: 'get_program_trading',
  description:
    '시장 전체의 프로그램 매매 현황을 조회합니다. 차익/비차익 프로그램 매매 동향을 확인할 수 있습니다.',
  schema: z.object({
    market: z.enum(['kospi', 'kosdaq']).default('kospi').describe('시장 구분'),
  }),
  func: async (input) => {
    const fid_cond_mrkt_div_code = input.market === 'kosdaq' ? 'Q' : 'J';

    const { data, url } = await callKisApi<Record<string, string>[]>(
      '/uapi/domestic-stock/v1/quotations/inquire-program-trade-daily',
      {
        FID_COND_MRKT_DIV_CODE: fid_cond_mrkt_div_code,
        FID_INPUT_DATE_1: getDaysAgo(30),
        FID_INPUT_DATE_2: getToday(),
      },
      { trId: TR_ID.PROGRAM_TRADING }
    );

    const items = Array.isArray(data) ? data : [data];

    return formatToolResult(
      {
        시장: input.market.toUpperCase(),
        프로그램매매: items,
      },
      [url]
    );
  },
});
