/**
 * 한국 주식 시장 정보 도구
 * @see https://apiportal.koreainvestment.com/apiservice/apiservice-domestic-stock-quotations
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { callKisApi } from './api.js';
import { TR_ID, MARKET_CODE } from './constants.js';
import { formatToolResult } from '../../types.js';

/**
 * 등락률 순위 응답 항목
 */
interface FluctuationRankItem {
  /** 순위 */
  data_rank: string;
  /** 종목코드 */
  stck_shrn_iscd: string;
  /** 종목명 */
  hts_kor_isnm: string;
  /** 현재가 */
  stck_prpr: string;
  /** 전일대비 */
  prdy_vrss: string;
  /** 전일대비부호 */
  prdy_vrss_sign: string;
  /** 전일대비율 */
  prdy_ctrt: string;
  /** 거래량 */
  acml_vol: string;
  /** 전일거래량대비 */
  prdy_vol: string;
  /** 시가총액 */
  stck_avls: string;
}

/**
 * 거래량 순위 응답 항목
 */
interface VolumeRankItem {
  /** 순위 */
  data_rank: string;
  /** 종목코드 */
  mksc_shrn_iscd: string;
  /** 종목명 */
  hts_kor_isnm: string;
  /** 현재가 */
  stck_prpr: string;
  /** 전일대비 */
  prdy_vrss: string;
  /** 전일대비부호 */
  prdy_vrss_sign: string;
  /** 전일대비율 */
  prdy_ctrt: string;
  /** 거래량 */
  acml_vol: string;
  /** 전일대비거래량비율 */
  prdy_vol_vrss_acml_vol_rate: string;
  /** 평균거래량 */
  avrg_vol: string;
  /** 거래대금 */
  acml_tr_pbmn: string;
}

const MarketRankingInputSchema = z.object({
  market: z
    .enum(['all', 'kospi', 'kosdaq'])
    .default('all')
    .describe('시장 구분 (all: 전체, kospi: 코스피, kosdaq: 코스닥)'),
  count: z.number().default(20).describe('조회 개수 (최대 30)'),
});

/**
 * 시장 코드 변환
 */
function getMarketCode(market: string): string {
  switch (market) {
    case 'kospi':
      return MARKET_CODE.KOSPI;
    case 'kosdaq':
      return MARKET_CODE.KOSDAQ;
    default:
      return MARKET_CODE.ALL;
  }
}

export const getTopGainers = new DynamicStructuredTool({
  name: 'get_top_gainers',
  description: '상승률 상위 종목을 조회합니다. 오늘 가장 많이 오른 종목들을 확인할 수 있습니다.',
  schema: MarketRankingInputSchema,
  func: async (input) => {
    const fid_cond_mrkt_div_code = input.market === 'kosdaq' ? 'Q' : 'J';

    const { data, url } = await callKisApi<FluctuationRankItem[]>(
      '/uapi/domestic-stock/v1/ranking/fluctuation',
      {
        FID_COND_MRKT_DIV_CODE: fid_cond_mrkt_div_code,
        FID_COND_SCR_DIV_CODE: '20170', // 등락률
        FID_INPUT_ISCD: '0000', // 전체
        FID_DIV_CLS_CODE: '0', // 상승률
        FID_BLNG_CLS_CODE: '0',
        FID_TRGT_CLS_CODE: '111111111',
        FID_TRGT_EXLS_CLS_CODE: '000000',
        FID_INPUT_PRICE_1: '0',
        FID_INPUT_PRICE_2: '0',
        FID_VOL_CNT: '0',
        FID_INPUT_DATE_1: '',
      },
      { trId: TR_ID.RANKING_FLUCTUATION }
    );

    const items = Array.isArray(data) ? data.slice(0, input.count) : [];

    const gainers = items.map((item) => ({
      순위: item.data_rank,
      종목코드: item.stck_shrn_iscd,
      종목명: item.hts_kor_isnm,
      현재가: Number(item.stck_prpr).toLocaleString('ko-KR'),
      등락률: `${item.prdy_ctrt}%`,
      전일대비: Number(item.prdy_vrss).toLocaleString('ko-KR'),
      거래량: Number(item.acml_vol).toLocaleString('ko-KR'),
    }));

    return formatToolResult(
      {
        시장: input.market === 'all' ? '전체' : input.market.toUpperCase(),
        기준: '상승률 상위',
        종목수: gainers.length,
        상승률순위: gainers,
      },
      [url]
    );
  },
});

export const getTopLosers = new DynamicStructuredTool({
  name: 'get_top_losers',
  description: '하락률 상위 종목을 조회합니다. 오늘 가장 많이 하락한 종목들을 확인할 수 있습니다.',
  schema: MarketRankingInputSchema,
  func: async (input) => {
    const fid_cond_mrkt_div_code = input.market === 'kosdaq' ? 'Q' : 'J';

    const { data, url } = await callKisApi<FluctuationRankItem[]>(
      '/uapi/domestic-stock/v1/ranking/fluctuation',
      {
        FID_COND_MRKT_DIV_CODE: fid_cond_mrkt_div_code,
        FID_COND_SCR_DIV_CODE: '20170',
        FID_INPUT_ISCD: '0000',
        FID_DIV_CLS_CODE: '1', // 하락률
        FID_BLNG_CLS_CODE: '0',
        FID_TRGT_CLS_CODE: '111111111',
        FID_TRGT_EXLS_CLS_CODE: '000000',
        FID_INPUT_PRICE_1: '0',
        FID_INPUT_PRICE_2: '0',
        FID_VOL_CNT: '0',
        FID_INPUT_DATE_1: '',
      },
      { trId: TR_ID.RANKING_FLUCTUATION }
    );

    const items = Array.isArray(data) ? data.slice(0, input.count) : [];

    const losers = items.map((item) => ({
      순위: item.data_rank,
      종목코드: item.stck_shrn_iscd,
      종목명: item.hts_kor_isnm,
      현재가: Number(item.stck_prpr).toLocaleString('ko-KR'),
      등락률: `${item.prdy_ctrt}%`,
      전일대비: Number(item.prdy_vrss).toLocaleString('ko-KR'),
      거래량: Number(item.acml_vol).toLocaleString('ko-KR'),
    }));

    return formatToolResult(
      {
        시장: input.market === 'all' ? '전체' : input.market.toUpperCase(),
        기준: '하락률 상위',
        종목수: losers.length,
        하락률순위: losers,
      },
      [url]
    );
  },
});

export const getVolumeRanking = new DynamicStructuredTool({
  name: 'get_volume_ranking',
  description: '거래량 상위 종목을 조회합니다. 오늘 거래가 가장 활발한 종목들을 확인할 수 있습니다.',
  schema: MarketRankingInputSchema,
  func: async (input) => {
    const fid_cond_mrkt_div_code = input.market === 'kosdaq' ? 'Q' : 'J';

    const { data, url } = await callKisApi<VolumeRankItem[]>(
      '/uapi/domestic-stock/v1/ranking/volume',
      {
        FID_COND_MRKT_DIV_CODE: fid_cond_mrkt_div_code,
        FID_COND_SCR_DIV_CODE: '20171',
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
      { trId: TR_ID.RANKING_VOLUME }
    );

    const items = Array.isArray(data) ? data.slice(0, input.count) : [];

    const ranking = items.map((item) => ({
      순위: item.data_rank,
      종목코드: item.mksc_shrn_iscd,
      종목명: item.hts_kor_isnm,
      현재가: Number(item.stck_prpr).toLocaleString('ko-KR'),
      등락률: `${item.prdy_ctrt}%`,
      거래량: Number(item.acml_vol).toLocaleString('ko-KR'),
      거래대금: `${(Number(item.acml_tr_pbmn) / 100000000).toFixed(0)}억원`,
      전일대비거래량: `${item.prdy_vol_vrss_acml_vol_rate}%`,
    }));

    return formatToolResult(
      {
        시장: input.market === 'all' ? '전체' : input.market.toUpperCase(),
        기준: '거래량 상위',
        종목수: ranking.length,
        거래량순위: ranking,
      },
      [url]
    );
  },
});
