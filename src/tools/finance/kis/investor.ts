/**
 * 한국 주식 투자자동향/수급 API 도구
 * @see https://apiportal.koreainvestment.com/apiservice/apiservice-domestic-stock-quotations
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { callKisApi, getToday, getDaysAgo } from './api.js';
import { TR_ID } from './constants.js';
import { formatToolResult } from '../../types.js';

// ============================================================
// 응답 타입 정의
// ============================================================

/** 시장별 투자자 일별 동향 응답 항목 */
interface InvestorDailyByMarketItem {
  stck_bsop_date: string; // 영업일자
  invr_cd: string; // 투자자코드
  invr_nm: string; // 투자자명
  seln_qty: string; // 매도수량
  shnu_qty: string; // 매수수량
  ntby_qty: string; // 순매수수량
  seln_amt: string; // 매도금액
  shnu_amt: string; // 매수금액
  ntby_amt: string; // 순매수금액
}

/** 외국인/기관 종합 응답 항목 */
interface ForeignInstitutionItem {
  stck_bsop_date: string; // 영업일자
  stck_prpr: string; // 현재가
  prdy_vrss: string; // 전일대비
  prdy_ctrt: string; // 전일대비율
  frgn_ntby_qty: string; // 외국인순매수
  orgn_ntby_qty: string; // 기관순매수
  frgn_seln_qty: string; // 외국인매도
  frgn_shnu_qty: string; // 외국인매수
  orgn_seln_qty: string; // 기관매도
  orgn_shnu_qty: string; // 기관매수
}

/** 외국인 매매추이 응답 항목 */
interface ForeignTradingTrendItem {
  stck_bsop_date: string; // 영업일자
  stck_clpr: string; // 종가
  prdy_vrss: string; // 전일대비
  prdy_ctrt: string; // 전일대비율
  frgn_ntby_qty: string; // 외국인순매수
  frgn_hold_qty: string; // 외국인보유수량
  frgn_hold_rate: string; // 외국인보유율
  frgn_lmit_rate: string; // 외국인한도율
}

/** 회원사별 매매 응답 항목 */
interface MemberTradingItem {
  seln_mbcr_no: string; // 매도회원사번호
  seln_mbcr_name: string; // 매도회원사명
  seln_qty: string; // 매도수량
  seln_amt: string; // 매도금액
  shnu_mbcr_no: string; // 매수회원사번호
  shnu_mbcr_name: string; // 매수회원사명
  shnu_qty: string; // 매수수량
  shnu_amt: string; // 매수금액
}

/** 회원사별 일별 매매 응답 항목 */
interface MemberDailyItem {
  stck_bsop_date: string; // 영업일자
  mbcr_no: string; // 회원사번호
  mbcr_name: string; // 회원사명
  seln_qty: string; // 매도수량
  shnu_qty: string; // 매수수량
  ntby_qty: string; // 순매수수량
}

/** 시장별 투자자 시간별 동향 응답 항목 */
interface InvestorTimeItem {
  bsop_hour: string; // 영업시간
  invr_cd: string; // 투자자코드
  invr_nm: string; // 투자자명
  seln_qty: string; // 매도수량
  shnu_qty: string; // 매수수량
  ntby_qty: string; // 순매수수량
}

// ============================================================
// 스키마 정의
// ============================================================

const TickerDateRangeInputSchema = z.object({
  ticker: z.string().describe('종목코드 (6자리). 예: "005930"'),
  start_date: z
    .string()
    .optional()
    .describe('시작일 (YYYYMMDD). 생략시 30일 전'),
  end_date: z.string().optional().describe('종료일 (YYYYMMDD). 생략시 오늘'),
});

const MarketInputSchema = z.object({
  market: z.enum(['kospi', 'kosdaq']).default('kospi').describe('시장 구분'),
  start_date: z
    .string()
    .optional()
    .describe('시작일 (YYYYMMDD). 생략시 30일 전'),
  end_date: z.string().optional().describe('종료일 (YYYYMMDD). 생략시 오늘'),
});

const MemberInputSchema = z.object({
  ticker: z.string().describe('종목코드 (6자리). 예: "005930"'),
  count: z.number().default(20).describe('조회 회원사 수'),
});

// ============================================================
// 도구 정의
// ============================================================

/**
 * 시장별 투자자 일별 동향
 */
export const getInvestorDailyByMarket = new DynamicStructuredTool({
  name: 'get_investor_daily_by_market',
  description: `시장 전체의 투자자별 일별 매매동향을 조회합니다.
사용 시점: 시장 전체의 외국인/기관/개인 매매동향이 필요할 때
키워드: 시장수급, 시장투자자동향, 코스피수급, 코스닥수급, 투자자매매`,
  schema: MarketInputSchema,
  func: async (input) => {
    const endDate = input.end_date || getToday();
    const startDate = input.start_date || getDaysAgo(30);
    const fid_cond_mrkt_div_code = input.market === 'kosdaq' ? 'Q' : 'J';

    const { data, url } = await callKisApi<InvestorDailyByMarketItem[]>(
      '/uapi/domestic-stock/v1/quotations/inquire-investor-daily-by-market',
      {
        FID_COND_MRKT_DIV_CODE: fid_cond_mrkt_div_code,
        FID_INPUT_DATE_1: startDate,
        FID_INPUT_DATE_2: endDate,
      },
      { trId: TR_ID.INVESTOR_DAILY_BY_MARKET }
    );

    const items = Array.isArray(data) ? data : [];

    // 투자자별로 그룹화
    const grouped: Record<
      string,
      { 순매수합계: number; 매수합계: number; 매도합계: number }
    > = {};
    for (const item of items) {
      if (!grouped[item.invr_nm]) {
        grouped[item.invr_nm] = { 순매수합계: 0, 매수합계: 0, 매도합계: 0 };
      }
      grouped[item.invr_nm].순매수합계 += Number(item.ntby_qty) || 0;
      grouped[item.invr_nm].매수합계 += Number(item.shnu_qty) || 0;
      grouped[item.invr_nm].매도합계 += Number(item.seln_qty) || 0;
    }

    const summary = Object.entries(grouped).map(([name, data]) => ({
      투자자: name,
      순매수: data.순매수합계.toLocaleString('ko-KR'),
      매수: data.매수합계.toLocaleString('ko-KR'),
      매도: data.매도합계.toLocaleString('ko-KR'),
    }));

    return formatToolResult(
      {
        시장: input.market.toUpperCase(),
        조회기간: `${startDate} ~ ${endDate}`,
        투자자별동향: summary,
      },
      [url]
    );
  },
});

/**
 * 시장별 투자자 시간별 동향
 */
export const getInvestorTimeByMarket = new DynamicStructuredTool({
  name: 'get_investor_time_by_market',
  description: `시장 전체의 투자자별 시간대별 매매동향을 조회합니다.
사용 시점: 장중 시간대별 외국인/기관 매매 패턴이 필요할 때
키워드: 시간별수급, 장중매매, 시간대별동향, 장중투자자`,
  schema: z.object({
    market: z.enum(['kospi', 'kosdaq']).default('kospi').describe('시장 구분'),
  }),
  func: async (input) => {
    const fid_cond_mrkt_div_code = input.market === 'kosdaq' ? 'Q' : 'J';

    const { data, url } = await callKisApi<InvestorTimeItem[]>(
      '/uapi/domestic-stock/v1/quotations/inquire-investor-time-by-market',
      {
        FID_COND_MRKT_DIV_CODE: fid_cond_mrkt_div_code,
      },
      { trId: TR_ID.INVESTOR_TIME_BY_MARKET }
    );

    const items = Array.isArray(data) ? data : [];

    const timeData = items.map((item) => ({
      시간: item.bsop_hour,
      투자자: item.invr_nm,
      순매수: Number(item.ntby_qty).toLocaleString('ko-KR'),
      매수: Number(item.shnu_qty).toLocaleString('ko-KR'),
      매도: Number(item.seln_qty).toLocaleString('ko-KR'),
    }));

    return formatToolResult(
      {
        시장: input.market.toUpperCase(),
        시간별동향: timeData,
      },
      [url]
    );
  },
});

/**
 * 종목별 외국인/기관 종합
 */
export const getForeignInstitutionTotal = new DynamicStructuredTool({
  name: 'get_foreign_institution_total',
  description: `종목의 외국인/기관 매매동향을 종합 조회합니다.
사용 시점: 특정 종목의 외국인/기관 수급을 자세히 분석할 때
키워드: 외국인기관, 외국인매매, 기관매매, 수급분석, 외기수급`,
  schema: TickerDateRangeInputSchema,
  func: async (input) => {
    const endDate = input.end_date || getToday();
    const startDate = input.start_date || getDaysAgo(30);

    const { data, url } = await callKisApi<ForeignInstitutionItem[]>(
      '/uapi/domestic-stock/v1/quotations/inquire-foreign-institution-total',
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: input.ticker,
        FID_INPUT_DATE_1: startDate,
        FID_INPUT_DATE_2: endDate,
      },
      { trId: TR_ID.FOREIGN_INSTITUTION_TOTAL }
    );

    const items = Array.isArray(data) ? data : [];

    // 누적 계산
    let foreignTotal = 0;
    let institutionTotal = 0;

    const trends = items
      .filter((item) => item.stck_bsop_date)
      .map((item) => {
        foreignTotal += Number(item.frgn_ntby_qty) || 0;
        institutionTotal += Number(item.orgn_ntby_qty) || 0;

        return {
          일자: item.stck_bsop_date,
          종가: Number(item.stck_prpr).toLocaleString('ko-KR'),
          등락률: `${item.prdy_ctrt}%`,
          외국인순매수: Number(item.frgn_ntby_qty).toLocaleString('ko-KR'),
          기관순매수: Number(item.orgn_ntby_qty).toLocaleString('ko-KR'),
          외국인매수: Number(item.frgn_shnu_qty).toLocaleString('ko-KR'),
          외국인매도: Number(item.frgn_seln_qty).toLocaleString('ko-KR'),
          기관매수: Number(item.orgn_shnu_qty).toLocaleString('ko-KR'),
          기관매도: Number(item.orgn_seln_qty).toLocaleString('ko-KR'),
        };
      });

    return formatToolResult(
      {
        종목코드: input.ticker,
        조회기간: `${startDate} ~ ${endDate}`,
        누적순매수: {
          외국인: foreignTotal.toLocaleString('ko-KR'),
          기관: institutionTotal.toLocaleString('ko-KR'),
        },
        일별동향: trends,
      },
      [url]
    );
  },
});

/**
 * 외국인 매매추이
 */
export const getForeignTradingTrend = new DynamicStructuredTool({
  name: 'get_foreign_trading_trend',
  description: `종목의 외국인 매매추이와 보유현황을 조회합니다.
사용 시점: 외국인 보유율 변화, 외국인 순매수 추이가 필요할 때
키워드: 외국인보유, 외국인보유율, 외국인추이, 외국인한도, 외국인지분`,
  schema: TickerDateRangeInputSchema,
  func: async (input) => {
    const endDate = input.end_date || getToday();
    const startDate = input.start_date || getDaysAgo(30);

    const { data, url } = await callKisApi<ForeignTradingTrendItem[]>(
      '/uapi/domestic-stock/v1/quotations/inquire-foreign-mem-pchs-trend',
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: input.ticker,
        FID_INPUT_DATE_1: startDate,
        FID_INPUT_DATE_2: endDate,
      },
      { trId: TR_ID.FOREIGN_TRADING_TREND }
    );

    const items = Array.isArray(data) ? data : [];

    const trends = items
      .filter((item) => item.stck_bsop_date)
      .map((item) => ({
        일자: item.stck_bsop_date,
        종가: Number(item.stck_clpr).toLocaleString('ko-KR'),
        등락률: `${item.prdy_ctrt}%`,
        외국인순매수: Number(item.frgn_ntby_qty).toLocaleString('ko-KR'),
        외국인보유수량: Number(item.frgn_hold_qty).toLocaleString('ko-KR'),
        외국인보유율: `${item.frgn_hold_rate}%`,
        외국인한도율: `${item.frgn_lmit_rate}%`,
      }));

    // 최신 보유 정보
    const latest = items[0];
    const latestHolding = latest
      ? {
          보유수량: Number(latest.frgn_hold_qty).toLocaleString('ko-KR'),
          보유율: `${latest.frgn_hold_rate}%`,
          한도율: `${latest.frgn_lmit_rate}%`,
        }
      : null;

    return formatToolResult(
      {
        종목코드: input.ticker,
        조회기간: `${startDate} ~ ${endDate}`,
        현재외국인보유: latestHolding,
        일별추이: trends,
      },
      [url]
    );
  },
});

/**
 * 회원사별 매매 동향
 */
export const getMemberTrading = new DynamicStructuredTool({
  name: 'get_member_trading',
  description: `종목의 회원사(증권사)별 매매 현황을 조회합니다.
사용 시점: 어떤 증권사가 매매하는지, 세력 동향이 필요할 때
키워드: 회원사, 증권사, 세력, 증권사매매, 창구별, 매매주체`,
  schema: MemberInputSchema,
  func: async (input) => {
    const { data, url } = await callKisApi<MemberTradingItem[]>(
      '/uapi/domestic-stock/v1/quotations/inquire-member',
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: input.ticker,
      },
      { trId: TR_ID.MEMBER_TRADING }
    );

    const items = Array.isArray(data) ? data.slice(0, input.count) : [];

    const sellers = items.map((item) => ({
      회원사: item.seln_mbcr_name,
      매도수량: Number(item.seln_qty).toLocaleString('ko-KR'),
      매도금액: `${(Number(item.seln_amt) / 100000000).toFixed(1)}억원`,
    }));

    const buyers = items.map((item) => ({
      회원사: item.shnu_mbcr_name,
      매수수량: Number(item.shnu_qty).toLocaleString('ko-KR'),
      매수금액: `${(Number(item.shnu_amt) / 100000000).toFixed(1)}억원`,
    }));

    return formatToolResult(
      {
        종목코드: input.ticker,
        매도상위: sellers,
        매수상위: buyers,
      },
      [url]
    );
  },
});

/**
 * 회원사별 일별 매매
 */
export const getMemberDaily = new DynamicStructuredTool({
  name: 'get_member_daily',
  description: `종목의 회원사별 일별 매매 추이를 조회합니다.
사용 시점: 특정 증권사의 매매 패턴 분석이 필요할 때
키워드: 회원사일별, 증권사일별, 세력추적, 창구추이, 연속매매`,
  schema: z.object({
    ticker: z.string().describe('종목코드 (6자리)'),
    member_name: z.string().optional().describe('회원사명 (필터링용)'),
    start_date: z.string().optional().describe('시작일'),
    end_date: z.string().optional().describe('종료일'),
  }),
  func: async (input) => {
    const endDate = input.end_date || getToday();
    const startDate = input.start_date || getDaysAgo(30);

    const { data, url } = await callKisApi<MemberDailyItem[]>(
      '/uapi/domestic-stock/v1/quotations/inquire-member-daily',
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: input.ticker,
        FID_INPUT_DATE_1: startDate,
        FID_INPUT_DATE_2: endDate,
      },
      { trId: TR_ID.MEMBER_DAILY }
    );

    let items = Array.isArray(data) ? data : [];

    // 회원사명 필터링
    if (input.member_name) {
      items = items.filter((item) =>
        item.mbcr_name?.includes(input.member_name || '')
      );
    }

    const dailyData = items
      .filter((item) => item.stck_bsop_date)
      .map((item) => ({
        일자: item.stck_bsop_date,
        회원사: item.mbcr_name,
        순매수: Number(item.ntby_qty).toLocaleString('ko-KR'),
        매수: Number(item.shnu_qty).toLocaleString('ko-KR'),
        매도: Number(item.seln_qty).toLocaleString('ko-KR'),
      }));

    return formatToolResult(
      {
        종목코드: input.ticker,
        조회기간: `${startDate} ~ ${endDate}`,
        회원사필터: input.member_name || '전체',
        일별매매: dailyData,
      },
      [url]
    );
  },
});

/**
 * 투자자별 종목 매매 추정
 */
export const getInvestorEstimate = new DynamicStructuredTool({
  name: 'get_investor_estimate',
  description: `종목의 투자자별 매매를 실시간 추정합니다.
사용 시점: 장중 투자자별 매매 추정치가 필요할 때
키워드: 투자자추정, 실시간수급, 장중수급, 매매추정, 실시간투자자`,
  schema: TickerDateRangeInputSchema,
  func: async (input) => {
    const endDate = input.end_date || getToday();
    const startDate = input.start_date || getDaysAgo(30);

    const { data, url } = await callKisApi<InvestorDailyByMarketItem[]>(
      '/uapi/domestic-stock/v1/quotations/inquire-investor-trend-estimate',
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: input.ticker,
        FID_INPUT_DATE_1: startDate,
        FID_INPUT_DATE_2: endDate,
      },
      { trId: 'FHPTJ04370000' }
    );

    const items = Array.isArray(data) ? data : [];

    const estimates = items.map((item) => ({
      일자: item.stck_bsop_date,
      투자자: item.invr_nm,
      순매수: Number(item.ntby_qty).toLocaleString('ko-KR'),
      매수: Number(item.shnu_qty).toLocaleString('ko-KR'),
      매도: Number(item.seln_qty).toLocaleString('ko-KR'),
      순매수금액: `${(Number(item.ntby_amt) / 100000000).toFixed(1)}억원`,
    }));

    return formatToolResult(
      {
        종목코드: input.ticker,
        조회기간: `${startDate} ~ ${endDate}`,
        투자자별추정: estimates,
      },
      [url]
    );
  },
});
