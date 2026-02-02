/**
 * 한국 주식 기업이벤트/KSD 정보 API 도구
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

/** 배당정보 응답 항목 */
interface DividendItem {
  stck_shrn_iscd: string; // 종목코드
  hts_kor_isnm: string; // 종목명
  dvnd_type_name: string; // 배당유형
  rec_date: string; // 배당기준일
  pay_date: string; // 배당지급일
  per_shr_dvnd_amt: string; // 주당배당금
  dvnd_yld: string; // 배당수익률
  face_value: string; // 액면가
}

/** 무상증자 응답 항목 */
interface BonusIssueItem {
  stck_shrn_iscd: string; // 종목코드
  hts_kor_isnm: string; // 종목명
  iss_ratio: string; // 증자비율
  rec_date: string; // 기준일
  nstk_list_date: string; // 신주상장일
  bef_stck_qty: string; // 증자전주식수
  aft_stck_qty: string; // 증자후주식수
}

/** 유상증자 응답 항목 */
interface RightsIssueItem {
  stck_shrn_iscd: string; // 종목코드
  hts_kor_isnm: string; // 종목명
  iss_ratio: string; // 증자비율
  rec_date: string; // 기준일
  nstk_list_date: string; // 신주상장일
  ofrg_pric: string; // 발행가
  subs_str_date: string; // 청약시작일
  subs_end_date: string; // 청약종료일
}

/** 감자 응답 항목 */
interface CapitalDecreaseItem {
  stck_shrn_iscd: string; // 종목코드
  hts_kor_isnm: string; // 종목명
  dcrs_ratio: string; // 감자비율
  rec_date: string; // 기준일
  dcrs_cls_name: string; // 감자구분
  bef_stck_qty: string; // 감자전주식수
  aft_stck_qty: string; // 감자후주식수
}

/** 합병/분할 응답 항목 */
interface MergerSplitItem {
  stck_shrn_iscd: string; // 종목코드
  hts_kor_isnm: string; // 종목명
  mgr_cls_name: string; // 합병/분할구분
  rec_date: string; // 기준일
  mgr_date: string; // 합병/분할일
  mgr_ratio: string; // 합병/분할비율
}

/** 주주총회 응답 항목 */
interface ShareholderMeetingItem {
  stck_shrn_iscd: string; // 종목코드
  hts_kor_isnm: string; // 종목명
  mtg_cls_name: string; // 총회구분
  mtg_date: string; // 총회일자
  rec_date: string; // 기준일
  mtg_place: string; // 총회장소
}

/** 상장정보 응답 항목 */
interface ListingInfoItem {
  stck_shrn_iscd: string; // 종목코드
  hts_kor_isnm: string; // 종목명
  list_date: string; // 상장일자
  list_shrs: string; // 상장주식수
  face_value: string; // 액면가
  mrkt_cls_name: string; // 시장구분
  bstp_cls_name: string; // 업종구분
}

/** 배당수익률 응답 항목 */
interface DividendYieldItem {
  stck_shrn_iscd: string; // 종목코드
  hts_kor_isnm: string; // 종목명
  stck_prpr: string; // 현재가
  prdy_ctrt: string; // 전일대비율
  dvnd_yld: string; // 배당수익률
  per_shr_dvnd_amt: string; // 주당배당금
  rec_date: string; // 배당기준일
}

/** 권리일정 응답 항목 */
interface RightsScheduleItem {
  stck_shrn_iscd: string; // 종목코드
  hts_kor_isnm: string; // 종목명
  rgts_cls_name: string; // 권리구분
  rec_date: string; // 기준일
  rgts_str_date: string; // 권리시작일
  rgts_end_date: string; // 권리종료일
  nstk_list_date: string; // 신주상장일
}

// ============================================================
// 스키마 정의
// ============================================================

const DateRangeInputSchema = z.object({
  start_date: z
    .string()
    .optional()
    .describe('시작일 (YYYYMMDD). 생략시 30일 전'),
  end_date: z.string().optional().describe('종료일 (YYYYMMDD). 생략시 오늘'),
});

const TickerInputSchema = z.object({
  ticker: z.string().describe('종목코드 (6자리). 예: "005930"'),
});

const DividendInputSchema = z.object({
  market: z
    .enum(['all', 'kospi', 'kosdaq'])
    .default('all')
    .describe('시장 구분'),
  count: z.number().default(30).describe('조회 개수'),
});

// ============================================================
// 도구 정의
// ============================================================

/**
 * 배당 정보 조회
 */
export const getKsdDividend = new DynamicStructuredTool({
  name: 'get_ksd_dividend',
  description: `배당 예정 종목 정보를 조회합니다. 배당기준일, 배당금, 배당수익률 등.
사용 시점: 배당주 투자, 배당 일정 확인이 필요할 때
키워드: 배당, 배당금, 배당기준일, 배당수익률, 배당주, 현금배당, 주식배당`,
  schema: DateRangeInputSchema,
  func: async (input) => {
    const endDate = input.end_date || getToday();
    const startDate = input.start_date || getDaysAgo(90);

    const { data, url } = await callKisApi<DividendItem[]>(
      '/uapi/domestic-stock/v1/ksd/dividend',
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_DATE_1: startDate,
        FID_INPUT_DATE_2: endDate,
      },
      { trId: TR_ID.KSD_DIVIDEND }
    );

    const items = Array.isArray(data) ? data : [];

    const dividends = items.map((item) => ({
      종목코드: item.stck_shrn_iscd,
      종목명: item.hts_kor_isnm,
      배당유형: item.dvnd_type_name,
      배당기준일: item.rec_date,
      배당지급일: item.pay_date,
      주당배당금: Number(item.per_shr_dvnd_amt).toLocaleString('ko-KR'),
      배당수익률: `${item.dvnd_yld}%`,
    }));

    return formatToolResult(
      {
        조회기간: `${startDate} ~ ${endDate}`,
        배당종목수: dividends.length,
        배당정보: dividends,
      },
      [url]
    );
  },
});

/**
 * 무상증자 정보 조회
 */
export const getKsdBonusIssue = new DynamicStructuredTool({
  name: 'get_ksd_bonus_issue',
  description: `무상증자 예정/완료 종목을 조회합니다.
사용 시점: 무상증자 이벤트, 주식수 증가 확인이 필요할 때
키워드: 무상증자, 무상, 증자, 주식배당, 보너스주식`,
  schema: DateRangeInputSchema,
  func: async (input) => {
    const endDate = input.end_date || getToday();
    const startDate = input.start_date || getDaysAgo(90);

    const { data, url } = await callKisApi<BonusIssueItem[]>(
      '/uapi/domestic-stock/v1/ksd/bonus-issue',
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_DATE_1: startDate,
        FID_INPUT_DATE_2: endDate,
      },
      { trId: TR_ID.KSD_BONUS_ISSUE }
    );

    const items = Array.isArray(data) ? data : [];

    const bonusIssues = items.map((item) => ({
      종목코드: item.stck_shrn_iscd,
      종목명: item.hts_kor_isnm,
      증자비율: item.iss_ratio,
      기준일: item.rec_date,
      신주상장일: item.nstk_list_date,
      증자전주식수: Number(item.bef_stck_qty).toLocaleString('ko-KR'),
      증자후주식수: Number(item.aft_stck_qty).toLocaleString('ko-KR'),
    }));

    return formatToolResult(
      {
        조회기간: `${startDate} ~ ${endDate}`,
        무상증자종목수: bonusIssues.length,
        무상증자정보: bonusIssues,
      },
      [url]
    );
  },
});

/**
 * 유상증자 정보 조회
 */
export const getKsdRightsIssue = new DynamicStructuredTool({
  name: 'get_ksd_rights_issue',
  description: `유상증자 예정/완료 종목을 조회합니다.
사용 시점: 유상증자 이벤트, 신주인수권 확인이 필요할 때
키워드: 유상증자, 유증, 신주, 청약, 발행가, 신주인수권`,
  schema: DateRangeInputSchema,
  func: async (input) => {
    const endDate = input.end_date || getToday();
    const startDate = input.start_date || getDaysAgo(90);

    const { data, url } = await callKisApi<RightsIssueItem[]>(
      '/uapi/domestic-stock/v1/ksd/rights-issue',
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_DATE_1: startDate,
        FID_INPUT_DATE_2: endDate,
      },
      { trId: TR_ID.KSD_RIGHTS_ISSUE }
    );

    const items = Array.isArray(data) ? data : [];

    const rightsIssues = items.map((item) => ({
      종목코드: item.stck_shrn_iscd,
      종목명: item.hts_kor_isnm,
      증자비율: item.iss_ratio,
      기준일: item.rec_date,
      신주상장일: item.nstk_list_date,
      발행가: Number(item.ofrg_pric).toLocaleString('ko-KR'),
      청약기간: `${item.subs_str_date} ~ ${item.subs_end_date}`,
    }));

    return formatToolResult(
      {
        조회기간: `${startDate} ~ ${endDate}`,
        유상증자종목수: rightsIssues.length,
        유상증자정보: rightsIssues,
      },
      [url]
    );
  },
});

/**
 * 감자 정보 조회
 */
export const getKsdCapitalDecrease = new DynamicStructuredTool({
  name: 'get_ksd_capital_decrease',
  description: `감자(자본감소) 예정/완료 종목을 조회합니다.
사용 시점: 감자 이벤트, 주식수 감소 확인이 필요할 때
키워드: 감자, 자본감소, 주식병합, 유상감자, 무상감자`,
  schema: DateRangeInputSchema,
  func: async (input) => {
    const endDate = input.end_date || getToday();
    const startDate = input.start_date || getDaysAgo(90);

    const { data, url } = await callKisApi<CapitalDecreaseItem[]>(
      '/uapi/domestic-stock/v1/ksd/capital-decrease',
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_DATE_1: startDate,
        FID_INPUT_DATE_2: endDate,
      },
      { trId: TR_ID.KSD_CAPITAL_DECREASE }
    );

    const items = Array.isArray(data) ? data : [];

    const decreases = items.map((item) => ({
      종목코드: item.stck_shrn_iscd,
      종목명: item.hts_kor_isnm,
      감자구분: item.dcrs_cls_name,
      감자비율: item.dcrs_ratio,
      기준일: item.rec_date,
      감자전주식수: Number(item.bef_stck_qty).toLocaleString('ko-KR'),
      감자후주식수: Number(item.aft_stck_qty).toLocaleString('ko-KR'),
    }));

    return formatToolResult(
      {
        조회기간: `${startDate} ~ ${endDate}`,
        감자종목수: decreases.length,
        감자정보: decreases,
      },
      [url]
    );
  },
});

/**
 * 합병/분할 정보 조회
 */
export const getKsdMergerSplit = new DynamicStructuredTool({
  name: 'get_ksd_merger_split',
  description: `합병/분할 예정/완료 종목을 조회합니다.
사용 시점: 기업합병, 기업분할 이벤트 확인이 필요할 때
키워드: 합병, 분할, 인적분할, 물적분할, 흡수합병, 신설합병`,
  schema: DateRangeInputSchema,
  func: async (input) => {
    const endDate = input.end_date || getToday();
    const startDate = input.start_date || getDaysAgo(180);

    const { data, url } = await callKisApi<MergerSplitItem[]>(
      '/uapi/domestic-stock/v1/ksd/merger-split',
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_DATE_1: startDate,
        FID_INPUT_DATE_2: endDate,
      },
      { trId: TR_ID.KSD_MERGER_SPLIT }
    );

    const items = Array.isArray(data) ? data : [];

    const mergerSplits = items.map((item) => ({
      종목코드: item.stck_shrn_iscd,
      종목명: item.hts_kor_isnm,
      구분: item.mgr_cls_name,
      기준일: item.rec_date,
      합병분할일: item.mgr_date,
      합병분할비율: item.mgr_ratio,
    }));

    return formatToolResult(
      {
        조회기간: `${startDate} ~ ${endDate}`,
        합병분할종목수: mergerSplits.length,
        합병분할정보: mergerSplits,
      },
      [url]
    );
  },
});

/**
 * 주주총회 정보 조회
 */
export const getKsdShareholderMeeting = new DynamicStructuredTool({
  name: 'get_ksd_shareholder_meeting',
  description: `주주총회 일정을 조회합니다.
사용 시점: 주주총회 일정, 의결권 행사 확인이 필요할 때
키워드: 주주총회, 정기주총, 임시주총, 의결권, 의안, 배당결의`,
  schema: DateRangeInputSchema,
  func: async (input) => {
    const endDate = input.end_date || getToday();
    const startDate = input.start_date || getDaysAgo(90);

    const { data, url } = await callKisApi<ShareholderMeetingItem[]>(
      '/uapi/domestic-stock/v1/ksd/shareholder-meeting',
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_DATE_1: startDate,
        FID_INPUT_DATE_2: endDate,
      },
      { trId: TR_ID.KSD_SHAREHOLDER_MEETING }
    );

    const items = Array.isArray(data) ? data : [];

    const meetings = items.map((item) => ({
      종목코드: item.stck_shrn_iscd,
      종목명: item.hts_kor_isnm,
      총회구분: item.mtg_cls_name,
      총회일자: item.mtg_date,
      기준일: item.rec_date,
      총회장소: item.mtg_place,
    }));

    return formatToolResult(
      {
        조회기간: `${startDate} ~ ${endDate}`,
        주주총회종목수: meetings.length,
        주주총회일정: meetings,
      },
      [url]
    );
  },
});

/**
 * 상장정보 조회
 */
export const getKsdListingInfo = new DynamicStructuredTool({
  name: 'get_ksd_listing_info',
  description: `종목의 상장 기본정보를 조회합니다.
사용 시점: IPO, 상장일, 상장주식수 확인이 필요할 때
키워드: 상장, IPO, 신규상장, 상장일, 상장주식수, 액면가`,
  schema: TickerInputSchema,
  func: async (input) => {
    const { data, url } = await callKisApi<ListingInfoItem>(
      '/uapi/domestic-stock/v1/ksd/listing-info',
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: input.ticker,
      },
      { trId: TR_ID.KSD_LISTING_INFO }
    );

    return formatToolResult(
      {
        종목코드: data.stck_shrn_iscd || input.ticker,
        종목명: data.hts_kor_isnm,
        상장일: data.list_date,
        상장주식수: Number(data.list_shrs).toLocaleString('ko-KR'),
        액면가: Number(data.face_value).toLocaleString('ko-KR'),
        시장구분: data.mrkt_cls_name,
        업종: data.bstp_cls_name,
      },
      [url]
    );
  },
});

/**
 * 배당수익률 순위 조회
 */
export const getDividendYieldRanking = new DynamicStructuredTool({
  name: 'get_dividend_yield_ranking',
  description: `배당수익률 상위 종목을 조회합니다.
사용 시점: 고배당주, 배당수익률 높은 종목이 필요할 때
키워드: 배당수익률, 고배당, 배당순위, 배당주순위, 배당투자`,
  schema: DividendInputSchema,
  func: async (input) => {
    const fid_cond_mrkt_div_code =
      input.market === 'kosdaq' ? 'Q' : input.market === 'kospi' ? 'J' : 'J';

    const { data, url } = await callKisApi<DividendYieldItem[]>(
      '/uapi/domestic-stock/v1/ranking/dividend-yield',
      {
        FID_COND_MRKT_DIV_CODE: fid_cond_mrkt_div_code,
        FID_COND_SCR_DIV_CODE: '20174',
        FID_INPUT_ISCD: '0000',
        FID_DIV_CLS_CODE: '0',
        FID_BLNG_CLS_CODE: '0',
        FID_TRGT_CLS_CODE: '111111111',
        FID_TRGT_EXLS_CLS_CODE: '000000',
        FID_INPUT_PRICE_1: '0',
        FID_INPUT_PRICE_2: '0',
        FID_VOL_CNT: '0',
        FID_INPUT_DATE_1: '',
      },
      { trId: TR_ID.DIVIDEND_YIELD }
    );

    const items = Array.isArray(data) ? data.slice(0, input.count) : [];

    const ranking = items.map((item, index) => ({
      순위: String(index + 1),
      종목코드: item.stck_shrn_iscd,
      종목명: item.hts_kor_isnm,
      현재가: Number(item.stck_prpr).toLocaleString('ko-KR'),
      등락률: `${item.prdy_ctrt}%`,
      배당수익률: `${item.dvnd_yld}%`,
      주당배당금: Number(item.per_shr_dvnd_amt).toLocaleString('ko-KR'),
      배당기준일: item.rec_date,
    }));

    return formatToolResult(
      {
        시장: input.market === 'all' ? '전체' : input.market.toUpperCase(),
        기준: '배당수익률 상위',
        종목수: ranking.length,
        배당수익률순위: ranking,
      },
      [url]
    );
  },
});

/**
 * 권리일정 조회
 */
export const getPeriodRights = new DynamicStructuredTool({
  name: 'get_period_rights',
  description: `종목의 각종 권리일정(배당, 증자, 감자 등)을 조회합니다.
사용 시점: 종목별 권리일정, 기준일 확인이 필요할 때
키워드: 권리일정, 기준일, 배당일정, 증자일정, 권리락`,
  schema: z.object({
    ticker: z.string().describe('종목코드 (6자리)'),
    year: z.string().optional().describe('조회 연도 (YYYY). 생략시 올해'),
  }),
  func: async (input) => {
    const year = input.year || String(new Date().getFullYear());

    const { data, url } = await callKisApi<RightsScheduleItem[]>(
      '/uapi/domestic-stock/v1/ksd/period-rights',
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: input.ticker,
        FID_INPUT_DATE_1: year + '0101',
        FID_INPUT_DATE_2: year + '1231',
      },
      { trId: TR_ID.PERIOD_RIGHTS }
    );

    const items = Array.isArray(data) ? data : [];

    const rights = items.map((item) => ({
      종목코드: item.stck_shrn_iscd,
      종목명: item.hts_kor_isnm,
      권리구분: item.rgts_cls_name,
      기준일: item.rec_date,
      권리기간: `${item.rgts_str_date} ~ ${item.rgts_end_date}`,
      신주상장일: item.nstk_list_date,
    }));

    return formatToolResult(
      {
        종목코드: input.ticker,
        조회연도: year,
        권리일정수: rights.length,
        권리일정: rights,
      },
      [url]
    );
  },
});
