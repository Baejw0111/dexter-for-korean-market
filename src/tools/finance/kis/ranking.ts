/**
 * 한국 주식 순위/랭킹 API 도구
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

/** 시가총액 순위 응답 항목 */
interface MarketCapRankItem {
  data_rank: string;
  stck_shrn_iscd: string;
  hts_kor_isnm: string;
  stck_prpr: string;
  prdy_vrss: string;
  prdy_vrss_sign: string;
  prdy_ctrt: string;
  acml_vol: string;
  stck_avls: string; // 시가총액 (억원)
  per: string;
  pbr: string;
  lstn_stcn: string; // 상장주수
}

/** 거래대금 순위 응답 항목 */
interface TradingValueRankItem {
  data_rank: string;
  mksc_shrn_iscd: string;
  hts_kor_isnm: string;
  stck_prpr: string;
  prdy_vrss: string;
  prdy_vrss_sign: string;
  prdy_ctrt: string;
  acml_vol: string;
  acml_tr_pbmn: string; // 거래대금
}

/** 신고가/신저가 응답 항목 */
interface NewHighLowRankItem {
  data_rank: string;
  stck_shrn_iscd: string;
  hts_kor_isnm: string;
  stck_prpr: string;
  prdy_vrss: string;
  prdy_ctrt: string;
  acml_vol: string;
  hgpr_date: string; // 고가일자
  lwpr_date: string; // 저가일자
  w52_hgpr: string; // 52주 최고가
  w52_lwpr: string; // 52주 최저가
}

/** 이격도 순위 응답 항목 */
interface DisparityRankItem {
  data_rank: string;
  stck_shrn_iscd: string;
  hts_kor_isnm: string;
  stck_prpr: string;
  prdy_vrss: string;
  prdy_ctrt: string;
  acml_vol: string;
  dprty_5: string; // 5일 이격도
  dprty_20: string; // 20일 이격도
  dprty_60: string; // 60일 이격도
  dprty_120: string; // 120일 이격도
}

/** 체결강도 순위 응답 항목 */
interface VolumePowerRankItem {
  data_rank: string;
  stck_shrn_iscd: string;
  hts_kor_isnm: string;
  stck_prpr: string;
  prdy_vrss: string;
  prdy_ctrt: string;
  acml_vol: string;
  tday_rltv: string; // 당일 체결강도
  seln_cnqn: string; // 매도체결량
  shnu_cnqn: string; // 매수체결량
}

/** 호가잔량 순위 응답 항목 */
interface QuoteBalanceRankItem {
  data_rank: string;
  stck_shrn_iscd: string;
  hts_kor_isnm: string;
  stck_prpr: string;
  prdy_vrss: string;
  prdy_ctrt: string;
  seln_rsqn: string; // 매도잔량
  shnu_rsqn: string; // 매수잔량
  ntby_rsqn: string; // 순매수잔량
}

/** 시간외 등락률 순위 응답 항목 */
interface OvertimeFluctRankItem {
  data_rank: string;
  stck_shrn_iscd: string;
  hts_kor_isnm: string;
  stck_prpr: string;
  prdy_vrss: string;
  prdy_ctrt: string;
  ovtm_prpr: string; // 시간외 현재가
  ovtm_vrss: string; // 시간외 대비
  ovtm_ctrt: string; // 시간외 등락률
}

/** 예상체결가 순위 응답 항목 */
interface ExpectedPriceRankItem {
  data_rank: string;
  stck_shrn_iscd: string;
  hts_kor_isnm: string;
  stck_prpr: string;
  prdy_vrss: string;
  prdy_ctrt: string;
  antc_mkop: string; // 예상시가
  antc_cnpr: string; // 예상체결가
  antc_cntg_vrss: string; // 예상체결대비
  antc_cntg_ctrt: string; // 예상체결등락률
  antc_vol: string; // 예상체결량
}

// ============================================================
// 스키마 정의
// ============================================================

const RankingInputSchema = z.object({
  market: z
    .enum(['all', 'kospi', 'kosdaq'])
    .default('all')
    .describe('시장 구분 (all: 전체, kospi: 코스피, kosdaq: 코스닥)'),
  count: z.number().default(20).describe('조회 개수 (최대 30)'),
});

const NewHighLowInputSchema = z.object({
  market: z
    .enum(['all', 'kospi', 'kosdaq'])
    .default('all')
    .describe('시장 구분'),
  type: z
    .enum(['high', 'low'])
    .default('high')
    .describe('구분 (high: 신고가, low: 신저가)'),
  count: z.number().default(20).describe('조회 개수'),
});

const DisparityInputSchema = z.object({
  market: z
    .enum(['all', 'kospi', 'kosdaq'])
    .default('all')
    .describe('시장 구분'),
  period: z
    .enum(['5', '20', '60', '120'])
    .default('20')
    .describe('기준 이동평균선 (5일/20일/60일/120일)'),
  type: z
    .enum(['high', 'low'])
    .default('high')
    .describe('구분 (high: 고이격, low: 저이격)'),
  count: z.number().default(20).describe('조회 개수'),
});

// ============================================================
// 유틸리티 함수
// ============================================================

function getMarketDivCode(market: string): string {
  switch (market) {
    case 'kospi':
      return 'J';
    case 'kosdaq':
      return 'Q';
    default:
      return 'J'; // 전체는 J로 조회
  }
}

// ============================================================
// 도구 정의
// ============================================================

/**
 * 시가총액 순위 조회
 */
export const getMarketCapRanking = new DynamicStructuredTool({
  name: 'get_market_cap_ranking',
  description: `시가총액 상위 종목을 조회합니다.
사용 시점: 대형주, 시총 상위 기업, 시장 대표주 목록이 필요할 때
키워드: 시가총액, 시총, 대형주, 대장주, 블루칩, 대기업`,
  schema: RankingInputSchema,
  func: async (input) => {
    const fid_cond_mrkt_div_code = getMarketDivCode(input.market);

    const { data, url } = await callKisApi<MarketCapRankItem[]>(
      '/uapi/domestic-stock/v1/ranking/market-cap',
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
      { trId: TR_ID.RANKING_MARKET_CAP }
    );

    const items = Array.isArray(data) ? data.slice(0, input.count) : [];

    const ranking = items.map((item) => ({
      순위: item.data_rank,
      종목코드: item.stck_shrn_iscd,
      종목명: item.hts_kor_isnm,
      현재가: Number(item.stck_prpr).toLocaleString('ko-KR'),
      등락률: `${item.prdy_ctrt}%`,
      시가총액: `${(Number(item.stck_avls) / 10000).toFixed(1)}조원`,
      거래량: Number(item.acml_vol).toLocaleString('ko-KR'),
      PER: item.per || '-',
      PBR: item.pbr || '-',
    }));

    return formatToolResult(
      {
        시장: input.market === 'all' ? '전체' : input.market.toUpperCase(),
        기준: '시가총액 상위',
        종목수: ranking.length,
        시가총액순위: ranking,
      },
      [url]
    );
  },
});

/**
 * 거래대금 순위 조회
 */
export const getTradingValueRanking = new DynamicStructuredTool({
  name: 'get_trading_value_ranking',
  description: `거래대금 상위 종목을 조회합니다.
사용 시점: 거래대금 많은 종목, 시장 관심 집중 종목이 필요할 때
키워드: 거래대금, 거래금액, 핫한 종목, 주목받는 종목, 유동성`,
  schema: RankingInputSchema,
  func: async (input) => {
    const fid_cond_mrkt_div_code = getMarketDivCode(input.market);

    const { data, url } = await callKisApi<TradingValueRankItem[]>(
      '/uapi/domestic-stock/v1/ranking/trading-value',
      {
        FID_COND_MRKT_DIV_CODE: fid_cond_mrkt_div_code,
        FID_COND_SCR_DIV_CODE: '20172',
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
      { trId: TR_ID.RANKING_TRADING_VALUE }
    );

    const items = Array.isArray(data) ? data.slice(0, input.count) : [];

    const ranking = items.map((item) => ({
      순위: item.data_rank,
      종목코드: item.mksc_shrn_iscd,
      종목명: item.hts_kor_isnm,
      현재가: Number(item.stck_prpr).toLocaleString('ko-KR'),
      등락률: `${item.prdy_ctrt}%`,
      거래대금: `${(Number(item.acml_tr_pbmn) / 100000000).toFixed(0)}억원`,
      거래량: Number(item.acml_vol).toLocaleString('ko-KR'),
    }));

    return formatToolResult(
      {
        시장: input.market === 'all' ? '전체' : input.market.toUpperCase(),
        기준: '거래대금 상위',
        종목수: ranking.length,
        거래대금순위: ranking,
      },
      [url]
    );
  },
});

/**
 * 신고가/신저가 순위 조회
 */
export const getNewHighLowRanking = new DynamicStructuredTool({
  name: 'get_new_high_low_ranking',
  description: `52주 신고가/신저가 근접 종목을 조회합니다.
사용 시점: 돌파 임박 종목, 52주 최고/최저 근처 종목이 필요할 때
키워드: 신고가, 신저가, 52주 최고, 52주 최저, 돌파, 역대`,
  schema: NewHighLowInputSchema,
  func: async (input) => {
    const fid_cond_mrkt_div_code = getMarketDivCode(input.market);

    const { data, url } = await callKisApi<NewHighLowRankItem[]>(
      '/uapi/domestic-stock/v1/ranking/near-new-high-low',
      {
        FID_COND_MRKT_DIV_CODE: fid_cond_mrkt_div_code,
        FID_COND_SCR_DIV_CODE: '20176',
        FID_INPUT_ISCD: '0000',
        FID_DIV_CLS_CODE: input.type === 'high' ? '0' : '1',
        FID_BLNG_CLS_CODE: '0',
        FID_TRGT_CLS_CODE: '111111111',
        FID_TRGT_EXLS_CLS_CODE: '000000',
        FID_INPUT_PRICE_1: '0',
        FID_INPUT_PRICE_2: '0',
        FID_VOL_CNT: '0',
        FID_INPUT_DATE_1: '',
      },
      { trId: TR_ID.RANKING_NEW_HIGH_LOW }
    );

    const items = Array.isArray(data) ? data.slice(0, input.count) : [];

    const ranking = items.map((item) => ({
      순위: item.data_rank,
      종목코드: item.stck_shrn_iscd,
      종목명: item.hts_kor_isnm,
      현재가: Number(item.stck_prpr).toLocaleString('ko-KR'),
      등락률: `${item.prdy_ctrt}%`,
      '52주_최고': Number(item.w52_hgpr).toLocaleString('ko-KR'),
      '52주_최저': Number(item.w52_lwpr).toLocaleString('ko-KR'),
      거래량: Number(item.acml_vol).toLocaleString('ko-KR'),
    }));

    return formatToolResult(
      {
        시장: input.market === 'all' ? '전체' : input.market.toUpperCase(),
        기준: input.type === 'high' ? '52주 신고가 근접' : '52주 신저가 근접',
        종목수: ranking.length,
        순위: ranking,
      },
      [url]
    );
  },
});

/**
 * 이격도 순위 조회
 */
export const getDisparityRanking = new DynamicStructuredTool({
  name: 'get_disparity_ranking',
  description: `이격도(이동평균선과의 괴리율) 순위를 조회합니다.
사용 시점: 과매수/과매도 종목, 이평선 이격 종목이 필요할 때
키워드: 이격도, 괴리율, 과매수, 과매도, 이동평균선, 이평선`,
  schema: DisparityInputSchema,
  func: async (input) => {
    const fid_cond_mrkt_div_code = getMarketDivCode(input.market);

    const { data, url } = await callKisApi<DisparityRankItem[]>(
      '/uapi/domestic-stock/v1/ranking/disparity',
      {
        FID_COND_MRKT_DIV_CODE: fid_cond_mrkt_div_code,
        FID_COND_SCR_DIV_CODE: '20175',
        FID_INPUT_ISCD: '0000',
        FID_DIV_CLS_CODE: input.type === 'high' ? '0' : '1',
        FID_BLNG_CLS_CODE: '0',
        FID_TRGT_CLS_CODE: '111111111',
        FID_TRGT_EXLS_CLS_CODE: '000000',
        FID_INPUT_PRICE_1: '0',
        FID_INPUT_PRICE_2: '0',
        FID_VOL_CNT: '0',
        FID_INPUT_DATE_1: '',
        FID_PRC_CLS_CODE: input.period,
      },
      { trId: TR_ID.RANKING_DISPARITY }
    );

    const items = Array.isArray(data) ? data.slice(0, input.count) : [];

    const periodKey = `이격도_${input.period}일`;
    const ranking = items.map((item) => {
      const disparity =
        input.period === '5'
          ? item.dprty_5
          : input.period === '20'
          ? item.dprty_20
          : input.period === '60'
          ? item.dprty_60
          : item.dprty_120;

      return {
        순위: item.data_rank,
        종목코드: item.stck_shrn_iscd,
        종목명: item.hts_kor_isnm,
        현재가: Number(item.stck_prpr).toLocaleString('ko-KR'),
        등락률: `${item.prdy_ctrt}%`,
        [periodKey]: `${disparity}%`,
        거래량: Number(item.acml_vol).toLocaleString('ko-KR'),
      };
    });

    return formatToolResult(
      {
        시장: input.market === 'all' ? '전체' : input.market.toUpperCase(),
        기준: `${input.period}일 이격도 ${
          input.type === 'high' ? '상위' : '하위'
        }`,
        종목수: ranking.length,
        이격도순위: ranking,
      },
      [url]
    );
  },
});

/**
 * 체결강도 순위 조회
 */
export const getVolumePowerRanking = new DynamicStructuredTool({
  name: 'get_volume_power_ranking',
  description: `체결강도(매수체결/매도체결 비율) 순위를 조회합니다.
사용 시점: 매수세가 강한 종목, 수급이 좋은 종목이 필요할 때
키워드: 체결강도, 매수세, 매도세, 수급, 매수우위, 매도우위`,
  schema: RankingInputSchema,
  func: async (input) => {
    const fid_cond_mrkt_div_code = getMarketDivCode(input.market);

    const { data, url } = await callKisApi<VolumePowerRankItem[]>(
      '/uapi/domestic-stock/v1/ranking/volume-power',
      {
        FID_COND_MRKT_DIV_CODE: fid_cond_mrkt_div_code,
        FID_COND_SCR_DIV_CODE: '20179',
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
      { trId: TR_ID.RANKING_VOLUME_POWER }
    );

    const items = Array.isArray(data) ? data.slice(0, input.count) : [];

    const ranking = items.map((item) => ({
      순위: item.data_rank,
      종목코드: item.stck_shrn_iscd,
      종목명: item.hts_kor_isnm,
      현재가: Number(item.stck_prpr).toLocaleString('ko-KR'),
      등락률: `${item.prdy_ctrt}%`,
      체결강도: `${item.tday_rltv}%`,
      매수체결량: Number(item.shnu_cnqn).toLocaleString('ko-KR'),
      매도체결량: Number(item.seln_cnqn).toLocaleString('ko-KR'),
      거래량: Number(item.acml_vol).toLocaleString('ko-KR'),
    }));

    return formatToolResult(
      {
        시장: input.market === 'all' ? '전체' : input.market.toUpperCase(),
        기준: '체결강도 상위',
        종목수: ranking.length,
        체결강도순위: ranking,
      },
      [url]
    );
  },
});

/**
 * 호가잔량 순위 조회
 */
export const getQuoteBalanceRanking = new DynamicStructuredTool({
  name: 'get_quote_balance_ranking',
  description: `호가잔량(매수/매도 호가 잔량 차이) 순위를 조회합니다.
사용 시점: 매수 대기가 많은 종목, 호가창 분석이 필요할 때
키워드: 호가잔량, 매수잔량, 매도잔량, 호가창, 순매수잔량`,
  schema: RankingInputSchema,
  func: async (input) => {
    const fid_cond_mrkt_div_code = getMarketDivCode(input.market);

    const { data, url } = await callKisApi<QuoteBalanceRankItem[]>(
      '/uapi/domestic-stock/v1/ranking/quote-balance',
      {
        FID_COND_MRKT_DIV_CODE: fid_cond_mrkt_div_code,
        FID_COND_SCR_DIV_CODE: '20178',
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
      { trId: TR_ID.RANKING_QUOTE_BALANCE }
    );

    const items = Array.isArray(data) ? data.slice(0, input.count) : [];

    const ranking = items.map((item) => ({
      순위: item.data_rank,
      종목코드: item.stck_shrn_iscd,
      종목명: item.hts_kor_isnm,
      현재가: Number(item.stck_prpr).toLocaleString('ko-KR'),
      등락률: `${item.prdy_ctrt}%`,
      매수잔량: Number(item.shnu_rsqn).toLocaleString('ko-KR'),
      매도잔량: Number(item.seln_rsqn).toLocaleString('ko-KR'),
      순매수잔량: Number(item.ntby_rsqn).toLocaleString('ko-KR'),
    }));

    return formatToolResult(
      {
        시장: input.market === 'all' ? '전체' : input.market.toUpperCase(),
        기준: '순매수잔량 상위',
        종목수: ranking.length,
        호가잔량순위: ranking,
      },
      [url]
    );
  },
});

/**
 * 시간외 등락률 순위 조회
 */
export const getOvertimeFluctRanking = new DynamicStructuredTool({
  name: 'get_overtime_fluct_ranking',
  description: `시간외 등락률 순위를 조회합니다.
사용 시점: 장 마감 후 시간외 거래에서 움직이는 종목이 필요할 때
키워드: 시간외, 장외, 애프터마켓, 시간외단일가, 시간외등락률`,
  schema: RankingInputSchema,
  func: async (input) => {
    const fid_cond_mrkt_div_code = getMarketDivCode(input.market);

    const { data, url } = await callKisApi<OvertimeFluctRankItem[]>(
      '/uapi/domestic-stock/v1/ranking/overtime-fluctuation',
      {
        FID_COND_MRKT_DIV_CODE: fid_cond_mrkt_div_code,
        FID_COND_SCR_DIV_CODE: '20180',
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
      { trId: TR_ID.RANKING_OVERTIME_FLUCT }
    );

    const items = Array.isArray(data) ? data.slice(0, input.count) : [];

    const ranking = items.map((item) => ({
      순위: item.data_rank,
      종목코드: item.stck_shrn_iscd,
      종목명: item.hts_kor_isnm,
      종가: Number(item.stck_prpr).toLocaleString('ko-KR'),
      당일등락률: `${item.prdy_ctrt}%`,
      시간외가: Number(item.ovtm_prpr).toLocaleString('ko-KR'),
      시간외대비: Number(item.ovtm_vrss).toLocaleString('ko-KR'),
      시간외등락률: `${item.ovtm_ctrt}%`,
    }));

    return formatToolResult(
      {
        시장: input.market === 'all' ? '전체' : input.market.toUpperCase(),
        기준: '시간외 등락률 상위',
        종목수: ranking.length,
        시간외등락률순위: ranking,
      },
      [url]
    );
  },
});

/**
 * 시간외 거래량 순위 조회
 */
export const getOvertimeVolumeRanking = new DynamicStructuredTool({
  name: 'get_overtime_volume_ranking',
  description: `시간외 거래량 순위를 조회합니다.
사용 시점: 장 마감 후 시간외 거래가 활발한 종목이 필요할 때
키워드: 시간외거래량, 장외거래, 애프터마켓, 시간외단일가`,
  schema: RankingInputSchema,
  func: async (input) => {
    const fid_cond_mrkt_div_code = getMarketDivCode(input.market);

    const { data, url } = await callKisApi<TradingValueRankItem[]>(
      '/uapi/domestic-stock/v1/ranking/overtime-volume',
      {
        FID_COND_MRKT_DIV_CODE: fid_cond_mrkt_div_code,
        FID_COND_SCR_DIV_CODE: '20181',
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
      { trId: TR_ID.RANKING_OVERTIME_VOLUME }
    );

    const items = Array.isArray(data) ? data.slice(0, input.count) : [];

    const ranking = items.map((item) => ({
      순위: item.data_rank,
      종목코드: item.mksc_shrn_iscd,
      종목명: item.hts_kor_isnm,
      현재가: Number(item.stck_prpr).toLocaleString('ko-KR'),
      등락률: `${item.prdy_ctrt}%`,
      시간외거래량: Number(item.acml_vol).toLocaleString('ko-KR'),
    }));

    return formatToolResult(
      {
        시장: input.market === 'all' ? '전체' : input.market.toUpperCase(),
        기준: '시간외 거래량 상위',
        종목수: ranking.length,
        시간외거래량순위: ranking,
      },
      [url]
    );
  },
});

/**
 * 예상체결가 등락률 순위 조회
 */
export const getExpectedPriceRanking = new DynamicStructuredTool({
  name: 'get_expected_price_ranking',
  description: `예상체결가 등락률 순위를 조회합니다 (장 시작 전/동시호가).
사용 시점: 장 시작 전 동시호가 시간에 급등/급락 예상 종목이 필요할 때
키워드: 예상체결가, 동시호가, 장전, 갭상승, 갭하락, 시초가`,
  schema: RankingInputSchema,
  func: async (input) => {
    const fid_cond_mrkt_div_code = getMarketDivCode(input.market);

    const { data, url } = await callKisApi<ExpectedPriceRankItem[]>(
      '/uapi/domestic-stock/v1/ranking/expected-fluctuation',
      {
        FID_COND_MRKT_DIV_CODE: fid_cond_mrkt_div_code,
        FID_COND_SCR_DIV_CODE: '20173',
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
      { trId: TR_ID.RANKING_EXPECTED_PRICE }
    );

    const items = Array.isArray(data) ? data.slice(0, input.count) : [];

    const ranking = items.map((item) => ({
      순위: item.data_rank,
      종목코드: item.stck_shrn_iscd,
      종목명: item.hts_kor_isnm,
      전일종가: Number(item.stck_prpr).toLocaleString('ko-KR'),
      예상체결가: Number(item.antc_cnpr).toLocaleString('ko-KR'),
      예상등락률: `${item.antc_cntg_ctrt}%`,
      예상거래량: Number(item.antc_vol).toLocaleString('ko-KR'),
    }));

    return formatToolResult(
      {
        시장: input.market === 'all' ? '전체' : input.market.toUpperCase(),
        기준: '예상체결 등락률 상위',
        종목수: ranking.length,
        예상체결가순위: ranking,
      },
      [url]
    );
  },
});

/**
 * PER 순위 조회 (저PER)
 */
export const getPerRanking = new DynamicStructuredTool({
  name: 'get_per_ranking',
  description: `PER(주가수익비율) 순위를 조회합니다.
사용 시점: 저평가 종목, 밸류에이션 낮은 종목이 필요할 때
키워드: PER, 주가수익비율, 저평가, 밸류에이션, 가치주`,
  schema: z.object({
    market: z
      .enum(['all', 'kospi', 'kosdaq'])
      .default('all')
      .describe('시장 구분'),
    type: z
      .enum(['low', 'high'])
      .default('low')
      .describe('구분 (low: 저PER, high: 고PER)'),
    count: z.number().default(20).describe('조회 개수'),
  }),
  func: async (input) => {
    const fid_cond_mrkt_div_code = getMarketDivCode(input.market);

    // PER 순위는 시가총액 순위 API에서 데이터 가져와서 정렬
    const { data, url } = await callKisApi<MarketCapRankItem[]>(
      '/uapi/domestic-stock/v1/ranking/market-cap',
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
      { trId: TR_ID.RANKING_MARKET_CAP }
    );

    const items = Array.isArray(data) ? data : [];

    // PER이 0보다 큰 항목만 필터링하고 정렬
    const filtered = items
      .filter((item) => {
        const per = parseFloat(item.per);
        return !isNaN(per) && per > 0;
      })
      .sort((a, b) => {
        const perA = parseFloat(a.per);
        const perB = parseFloat(b.per);
        return input.type === 'low' ? perA - perB : perB - perA;
      })
      .slice(0, input.count);

    const ranking = filtered.map((item, index) => ({
      순위: String(index + 1),
      종목코드: item.stck_shrn_iscd,
      종목명: item.hts_kor_isnm,
      현재가: Number(item.stck_prpr).toLocaleString('ko-KR'),
      등락률: `${item.prdy_ctrt}%`,
      PER: item.per,
      PBR: item.pbr || '-',
      시가총액: `${(Number(item.stck_avls) / 10000).toFixed(1)}조원`,
    }));

    return formatToolResult(
      {
        시장: input.market === 'all' ? '전체' : input.market.toUpperCase(),
        기준: input.type === 'low' ? '저PER (저평가)' : '고PER (고평가)',
        종목수: ranking.length,
        PER순위: ranking,
      },
      [url]
    );
  },
});

/**
 * PBR 순위 조회 (저PBR)
 */
export const getPbrRanking = new DynamicStructuredTool({
  name: 'get_pbr_ranking',
  description: `PBR(주가순자산비율) 순위를 조회합니다.
사용 시점: 자산가치 대비 저평가 종목이 필요할 때
키워드: PBR, 주가순자산비율, 저평가, 자산가치, 청산가치`,
  schema: z.object({
    market: z
      .enum(['all', 'kospi', 'kosdaq'])
      .default('all')
      .describe('시장 구분'),
    type: z
      .enum(['low', 'high'])
      .default('low')
      .describe('구분 (low: 저PBR, high: 고PBR)'),
    count: z.number().default(20).describe('조회 개수'),
  }),
  func: async (input) => {
    const fid_cond_mrkt_div_code = getMarketDivCode(input.market);

    const { data, url } = await callKisApi<MarketCapRankItem[]>(
      '/uapi/domestic-stock/v1/ranking/market-cap',
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
      { trId: TR_ID.RANKING_MARKET_CAP }
    );

    const items = Array.isArray(data) ? data : [];

    // PBR이 0보다 큰 항목만 필터링하고 정렬
    const filtered = items
      .filter((item) => {
        const pbr = parseFloat(item.pbr);
        return !isNaN(pbr) && pbr > 0;
      })
      .sort((a, b) => {
        const pbrA = parseFloat(a.pbr);
        const pbrB = parseFloat(b.pbr);
        return input.type === 'low' ? pbrA - pbrB : pbrB - pbrA;
      })
      .slice(0, input.count);

    const ranking = filtered.map((item, index) => ({
      순위: String(index + 1),
      종목코드: item.stck_shrn_iscd,
      종목명: item.hts_kor_isnm,
      현재가: Number(item.stck_prpr).toLocaleString('ko-KR'),
      등락률: `${item.prdy_ctrt}%`,
      PBR: item.pbr,
      PER: item.per || '-',
      시가총액: `${(Number(item.stck_avls) / 10000).toFixed(1)}조원`,
    }));

    return formatToolResult(
      {
        시장: input.market === 'all' ? '전체' : input.market.toUpperCase(),
        기준: input.type === 'low' ? '저PBR (자산가치 대비 저평가)' : '고PBR',
        종목수: ranking.length,
        PBR순위: ranking,
      },
      [url]
    );
  },
});
