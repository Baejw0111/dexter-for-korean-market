/**
 * 한국 주식 가격 조회 도구
 * @see https://apiportal.koreainvestment.com/apiservice/apiservice-domestic-stock-quotations
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { callKisApi, formatDate, getToday, getDaysAgo } from './api.js';
import { TR_ID, PERIOD_CODE, ADJ_PRICE_CODE } from './constants.js';
import { formatToolResult } from '../../types.js';

/**
 * 현재가 조회 응답
 */
interface PriceSnapshotResponse {
  /** 주식 현재가 */
  stck_prpr: string;
  /** 전일 대비 */
  prdy_vrss: string;
  /** 전일 대비 부호 */
  prdy_vrss_sign: string;
  /** 전일 대비율 */
  prdy_ctrt: string;
  /** 누적 거래량 */
  acml_vol: string;
  /** 누적 거래대금 */
  acml_tr_pbmn: string;
  /** 시가 */
  stck_oprc: string;
  /** 고가 */
  stck_hgpr: string;
  /** 저가 */
  stck_lwpr: string;
  /** 52주 최고가 */
  w52_hgpr: string;
  /** 52주 최저가 */
  w52_lwpr: string;
  /** 시가총액 */
  hts_avls: string;
  /** PER */
  per: string;
  /** PBR */
  pbr: string;
  /** 상장주수 */
  lstn_stcn: string;
}

/**
 * 일별 시세 응답
 */
interface DailyPriceResponse {
  /** 영업일자 */
  stck_bsop_date: string;
  /** 시가 */
  stck_oprc: string;
  /** 고가 */
  stck_hgpr: string;
  /** 저가 */
  stck_lwpr: string;
  /** 종가 */
  stck_clpr: string;
  /** 거래량 */
  acml_vol: string;
  /** 전일 대비 */
  prdy_vrss: string;
  /** 전일 대비 부호 */
  prdy_vrss_sign: string;
}

const PriceSnapshotInputSchema = z.object({
  ticker: z
    .string()
    .describe('종목코드. 예: "005930", ETF는 "069500" 또는 "0048J0"'),
});

export const getPriceSnapshot = new DynamicStructuredTool({
  name: 'get_price_snapshot',
  description:
    '특정 종목의 현재가 정보를 조회합니다. 현재가, 전일대비, 등락률, 거래량, 시가, 고가, 저가, PER, PBR 등을 반환합니다.',
  schema: PriceSnapshotInputSchema,
  func: async (input) => {
    const { data, url } = await callKisApi<PriceSnapshotResponse>(
      '/uapi/domestic-stock/v1/quotations/inquire-price',
      {
        FID_COND_MRKT_DIV_CODE: 'J', // 주식
        FID_INPUT_ISCD: input.ticker,
      },
      { trId: TR_ID.PRICE_CURRENT }
    );

    // 응답 데이터 정리
    const snapshot = {
      종목코드: input.ticker,
      현재가: Number(data.stck_prpr).toLocaleString('ko-KR'),
      전일대비: Number(data.prdy_vrss).toLocaleString('ko-KR'),
      등락률: `${data.prdy_ctrt}%`,
      거래량: Number(data.acml_vol).toLocaleString('ko-KR'),
      거래대금: `${(Number(data.acml_tr_pbmn) / 100000000).toFixed(1)}억원`,
      시가: Number(data.stck_oprc).toLocaleString('ko-KR'),
      고가: Number(data.stck_hgpr).toLocaleString('ko-KR'),
      저가: Number(data.stck_lwpr).toLocaleString('ko-KR'),
      '52주_최고': Number(data.w52_hgpr).toLocaleString('ko-KR'),
      '52주_최저': Number(data.w52_lwpr).toLocaleString('ko-KR'),
      시가총액: `${(Number(data.hts_avls) / 10000).toFixed(1)}조원`,
      PER: data.per,
      PBR: data.pbr,
    };

    return formatToolResult(snapshot, [url]);
  },
});

const PricesInputSchema = z.object({
  ticker: z.string().describe('종목코드. 예: "005930", ETF는 "0048J0"'),
  start_date: z
    .string()
    .optional()
    .describe('시작일 (YYYYMMDD 형식). 생략시 30일 전'),
  end_date: z
    .string()
    .optional()
    .describe('종료일 (YYYYMMDD 형식). 생략시 오늘'),
  period: z
    .enum(['D', 'W', 'M', 'Y'])
    .default('D')
    .describe('기간 구분 (D: 일, W: 주, M: 월, Y: 년)'),
  adjusted: z.boolean().default(true).describe('수정주가 반영 여부'),
});

export const getPrices = new DynamicStructuredTool({
  name: 'get_prices',
  description:
    '특정 종목의 과거 시세를 조회합니다. 일/주/월/년 단위로 시가, 고가, 저가, 종가, 거래량을 반환합니다.',
  schema: PricesInputSchema,
  func: async (input) => {
    const endDate = input.end_date || getToday();
    const startDate = input.start_date || getDaysAgo(30);

    const { data, url } = await callKisApi<DailyPriceResponse[]>(
      '/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice',
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: input.ticker,
        FID_INPUT_DATE_1: startDate,
        FID_INPUT_DATE_2: endDate,
        FID_PERIOD_DIV_CODE: input.period,
        FID_ORG_ADJ_PRC: input.adjusted
          ? ADJ_PRICE_CODE.ADJUSTED
          : ADJ_PRICE_CODE.UNADJUSTED,
      },
      { trId: TR_ID.PRICE_DAILY }
    );

    // 배열로 반환된 경우 처리
    const prices = Array.isArray(data) ? data : [data];

    // 응답 데이터 정리
    const formattedPrices = prices
      .filter((p) => p.stck_bsop_date)
      .map((p) => ({
        날짜: p.stck_bsop_date,
        시가: Number(p.stck_oprc),
        고가: Number(p.stck_hgpr),
        저가: Number(p.stck_lwpr),
        종가: Number(p.stck_clpr),
        거래량: Number(p.acml_vol),
        전일대비: Number(p.prdy_vrss),
      }));

    return formatToolResult(
      {
        종목코드: input.ticker,
        조회기간: `${startDate} ~ ${endDate}`,
        기간구분: input.period,
        데이터수: formattedPrices.length,
        시세: formattedPrices,
      },
      [url]
    );
  },
});
