/**
 * 한국 주식 지수 API 도구
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

/** 지수 현재가 응답 */
interface IndexPriceResponse {
  bstp_nmix_prpr: string; // 지수현재가
  bstp_nmix_prdy_vrss: string; // 지수전일대비
  prdy_vrss_sign: string; // 전일대비부호
  bstp_nmix_prdy_ctrt: string; // 지수등락률
  acml_vol: string; // 누적거래량
  acml_tr_pbmn: string; // 누적거래대금
  bstp_nmix_oprc: string; // 지수시가
  bstp_nmix_hgpr: string; // 지수고가
  bstp_nmix_lwpr: string; // 지수저가
}

/** 지수 일별 시세 응답 항목 */
interface IndexDailyPriceItem {
  stck_bsop_date: string; // 영업일자
  bstp_nmix_prpr: string; // 지수현재가
  bstp_nmix_oprc: string; // 지수시가
  bstp_nmix_hgpr: string; // 지수고가
  bstp_nmix_lwpr: string; // 지수저가
  acml_vol: string; // 누적거래량
  acml_tr_pbmn: string; // 누적거래대금
  bstp_nmix_prdy_vrss: string; // 전일대비
  bstp_nmix_prdy_ctrt: string; // 등락률
}

/** 지수 분별 시세 응답 항목 */
interface IndexTimePriceItem {
  stck_cntg_hour: string; // 체결시간
  bstp_nmix_prpr: string; // 지수현재가
  bstp_nmix_oprc: string; // 지수시가
  bstp_nmix_hgpr: string; // 지수고가
  bstp_nmix_lwpr: string; // 지수저가
  cntg_vol: string; // 체결거래량
  acml_vol: string; // 누적거래량
}

/** 업종별 시세 응답 항목 */
interface SectorPriceItem {
  bstp_cls_code: string; // 업종코드
  bstp_kor_isnm: string; // 업종명
  bstp_nmix_prpr: string; // 지수현재가
  bstp_nmix_prdy_vrss: string; // 전일대비
  bstp_nmix_prdy_ctrt: string; // 등락률
  acml_vol: string; // 누적거래량
  acml_tr_pbmn: string; // 누적거래대금
}

/** 지수 프로그램매매 응답 항목 */
interface IndexProgramItem {
  stck_bsop_date: string; // 영업일자
  arbt_buy_tram: string; // 차익매수거래대금
  arbt_seln_tram: string; // 차익매도거래대금
  arbt_ntby_tram: string; // 차익순매수대금
  nrbt_buy_tram: string; // 비차익매수거래대금
  nrbt_seln_tram: string; // 비차익매도거래대금
  nrbt_ntby_tram: string; // 비차익순매수대금
  totl_buy_tram: string; // 전체매수대금
  totl_seln_tram: string; // 전체매도대금
  totl_ntby_tram: string; // 전체순매수대금
}

// ============================================================
// 지수 코드 상수
// ============================================================

const INDEX_CODES = {
  코스피: '0001',
  코스피200: '1001',
  코스피100: '1002',
  코스피50: '1003',
  코스닥: '2001',
  코스닥150: '2002',
  KRX300: '3001',
} as const;

type IndexName = keyof typeof INDEX_CODES;

// ============================================================
// 스키마 정의
// ============================================================

const IndexInputSchema = z.object({
  index_name: z
    .enum([
      '코스피',
      '코스피200',
      '코스피100',
      '코스피50',
      '코스닥',
      '코스닥150',
      'KRX300',
    ])
    .default('코스피')
    .describe('지수명'),
});

const IndexDateRangeInputSchema = z.object({
  index_name: z
    .enum([
      '코스피',
      '코스피200',
      '코스피100',
      '코스피50',
      '코스닥',
      '코스닥150',
      'KRX300',
    ])
    .default('코스피')
    .describe('지수명'),
  start_date: z
    .string()
    .optional()
    .describe('시작일 (YYYYMMDD). 생략시 30일 전'),
  end_date: z.string().optional().describe('종료일 (YYYYMMDD). 생략시 오늘'),
});

const MarketInputSchema = z.object({
  market: z.enum(['kospi', 'kosdaq']).default('kospi').describe('시장 구분'),
});

// ============================================================
// 도구 정의
// ============================================================

/**
 * 지수 현재가 조회
 */
export const getIndexPrice = new DynamicStructuredTool({
  name: 'get_index_price',
  description: `주요 지수(코스피, 코스닥 등)의 현재가를 조회합니다.
사용 시점: 지수 현재 시세, 시장 전체 동향이 필요할 때
키워드: 지수, 코스피, 코스닥, 코스피200, 시장지수, 종합지수`,
  schema: IndexInputSchema,
  func: async (input) => {
    const indexCode = INDEX_CODES[input.index_name as IndexName];

    const { data, url } = await callKisApi<IndexPriceResponse>(
      '/uapi/domestic-stock/v1/quotations/inquire-index-price',
      {
        FID_COND_MRKT_DIV_CODE: 'U',
        FID_INPUT_ISCD: indexCode,
      },
      { trId: TR_ID.INDEX_PRICE }
    );

    return formatToolResult(
      {
        지수명: input.index_name,
        현재가: Number(data.bstp_nmix_prpr).toLocaleString('ko-KR', {
          minimumFractionDigits: 2,
        }),
        전일대비: Number(data.bstp_nmix_prdy_vrss).toLocaleString('ko-KR', {
          minimumFractionDigits: 2,
        }),
        등락률: `${data.bstp_nmix_prdy_ctrt}%`,
        시가: Number(data.bstp_nmix_oprc).toLocaleString('ko-KR', {
          minimumFractionDigits: 2,
        }),
        고가: Number(data.bstp_nmix_hgpr).toLocaleString('ko-KR', {
          minimumFractionDigits: 2,
        }),
        저가: Number(data.bstp_nmix_lwpr).toLocaleString('ko-KR', {
          minimumFractionDigits: 2,
        }),
        거래량: Number(data.acml_vol).toLocaleString('ko-KR'),
        거래대금: `${(Number(data.acml_tr_pbmn) / 1000000000000).toFixed(
          1
        )}조원`,
      },
      [url]
    );
  },
});

/**
 * 지수 일별 시세 조회
 */
export const getIndexDailyPrice = new DynamicStructuredTool({
  name: 'get_index_daily_price',
  description: `지수의 일별 시세 추이를 조회합니다.
사용 시점: 지수 일별 차트, 시장 추세 분석이 필요할 때
키워드: 지수일별, 지수추이, 지수차트, 시장추세, 코스피추이`,
  schema: IndexDateRangeInputSchema,
  func: async (input) => {
    const indexCode = INDEX_CODES[input.index_name as IndexName];
    const endDate = input.end_date || getToday();
    const startDate = input.start_date || getDaysAgo(30);

    const { data, url } = await callKisApi<IndexDailyPriceItem[]>(
      '/uapi/domestic-stock/v1/quotations/inquire-index-daily-price',
      {
        FID_COND_MRKT_DIV_CODE: 'U',
        FID_INPUT_ISCD: indexCode,
        FID_INPUT_DATE_1: startDate,
        FID_INPUT_DATE_2: endDate,
        FID_PERIOD_DIV_CODE: 'D',
      },
      { trId: TR_ID.INDEX_DAILY_PRICE }
    );

    const items = Array.isArray(data) ? data : [];

    const dailyPrices = items
      .filter((item) => item.stck_bsop_date)
      .map((item) => ({
        날짜: item.stck_bsop_date,
        종가: Number(item.bstp_nmix_prpr).toFixed(2),
        시가: Number(item.bstp_nmix_oprc).toFixed(2),
        고가: Number(item.bstp_nmix_hgpr).toFixed(2),
        저가: Number(item.bstp_nmix_lwpr).toFixed(2),
        등락률: `${item.bstp_nmix_prdy_ctrt}%`,
        거래량: Number(item.acml_vol).toLocaleString('ko-KR'),
      }));

    return formatToolResult(
      {
        지수명: input.index_name,
        조회기간: `${startDate} ~ ${endDate}`,
        데이터수: dailyPrices.length,
        일별시세: dailyPrices,
      },
      [url]
    );
  },
});

/**
 * 지수 분별 시세 조회
 */
export const getIndexTimePrice = new DynamicStructuredTool({
  name: 'get_index_time_price',
  description: `지수의 분별 시세(분봉)를 조회합니다.
사용 시점: 지수 분봉, 장중 지수 흐름 분석이 필요할 때
키워드: 지수분봉, 지수분차트, 장중지수, 인트라데이지수`,
  schema: z.object({
    index_name: z
      .enum([
        '코스피',
        '코스피200',
        '코스피100',
        '코스피50',
        '코스닥',
        '코스닥150',
        'KRX300',
      ])
      .default('코스피')
      .describe('지수명'),
    count: z.number().default(30).describe('조회 개수'),
  }),
  func: async (input) => {
    const indexCode = INDEX_CODES[input.index_name as IndexName];

    const { data, url } = await callKisApi<IndexTimePriceItem[]>(
      '/uapi/domestic-stock/v1/quotations/inquire-index-time-price',
      {
        FID_COND_MRKT_DIV_CODE: 'U',
        FID_INPUT_ISCD: indexCode,
        FID_INPUT_HOUR_1: '160000',
      },
      { trId: TR_ID.INDEX_TIME_PRICE }
    );

    const items = Array.isArray(data) ? data.slice(0, input.count) : [];

    const timePrices = items
      .filter((item) => item.stck_cntg_hour)
      .map((item) => ({
        시간: item.stck_cntg_hour,
        현재가: Number(item.bstp_nmix_prpr).toFixed(2),
        시가: Number(item.bstp_nmix_oprc).toFixed(2),
        고가: Number(item.bstp_nmix_hgpr).toFixed(2),
        저가: Number(item.bstp_nmix_lwpr).toFixed(2),
        거래량: Number(item.cntg_vol).toLocaleString('ko-KR'),
      }));

    return formatToolResult(
      {
        지수명: input.index_name,
        데이터수: timePrices.length,
        분별시세: timePrices,
      },
      [url]
    );
  },
});

/**
 * 업종별 시세 조회
 */
export const getSectorPriceList = new DynamicStructuredTool({
  name: 'get_sector_price_list',
  description: `업종별 지수 현황을 조회합니다. 전 업종의 등락률 확인.
사용 시점: 업종별 강세/약세, 섹터 동향이 필요할 때
키워드: 업종지수, 섹터, 업종동향, 업종별시세, 테마, 산업별`,
  schema: MarketInputSchema,
  func: async (input) => {
    const fid_cond_mrkt_div_code = input.market === 'kosdaq' ? 'Q' : 'J';

    const { data, url } = await callKisApi<SectorPriceItem[]>(
      '/uapi/domestic-stock/v1/quotations/inquire-index-category-price',
      {
        FID_COND_MRKT_DIV_CODE: fid_cond_mrkt_div_code,
        FID_INPUT_ISCD: '0000',
      },
      { trId: TR_ID.SECTOR_PRICE_LIST }
    );

    const items = Array.isArray(data) ? data : [];

    const sectors = items.map((item) => ({
      업종코드: item.bstp_cls_code,
      업종명: item.bstp_kor_isnm,
      현재가: Number(item.bstp_nmix_prpr).toFixed(2),
      전일대비: Number(item.bstp_nmix_prdy_vrss).toFixed(2),
      등락률: `${item.bstp_nmix_prdy_ctrt}%`,
      거래량: Number(item.acml_vol).toLocaleString('ko-KR'),
      거래대금: `${(Number(item.acml_tr_pbmn) / 100000000).toFixed(0)}억원`,
    }));

    // 등락률 기준 정렬
    const sortedSectors = [...sectors].sort((a, b) => {
      const rateA = parseFloat(a.등락률);
      const rateB = parseFloat(b.등락률);
      return rateB - rateA;
    });

    return formatToolResult(
      {
        시장: input.market.toUpperCase(),
        업종수: sortedSectors.length,
        상승업종: sortedSectors.filter((s) => parseFloat(s.등락률) > 0).length,
        하락업종: sortedSectors.filter((s) => parseFloat(s.등락률) < 0).length,
        업종별시세: sortedSectors,
      },
      [url]
    );
  },
});

/**
 * 업종별 일별 차트 조회
 */
export const getSectorDailyChart = new DynamicStructuredTool({
  name: 'get_sector_daily_chart',
  description: `특정 업종의 일별 시세 추이를 조회합니다.
사용 시점: 특정 업종/섹터의 추세 분석이 필요할 때
키워드: 업종차트, 섹터차트, 업종추이, 산업별추이`,
  schema: z.object({
    sector_code: z.string().describe('업종코드. 예: 증권업종은 "069"'),
    market: z.enum(['kospi', 'kosdaq']).default('kospi').describe('시장 구분'),
    start_date: z.string().optional().describe('시작일'),
    end_date: z.string().optional().describe('종료일'),
  }),
  func: async (input) => {
    const fid_cond_mrkt_div_code = input.market === 'kosdaq' ? 'Q' : 'J';
    const endDate = input.end_date || getToday();
    const startDate = input.start_date || getDaysAgo(30);

    const { data, url } = await callKisApi<IndexDailyPriceItem[]>(
      '/uapi/domestic-stock/v1/quotations/inquire-daily-indexchartprice',
      {
        FID_COND_MRKT_DIV_CODE: fid_cond_mrkt_div_code,
        FID_INPUT_ISCD: input.sector_code,
        FID_INPUT_DATE_1: startDate,
        FID_INPUT_DATE_2: endDate,
        FID_PERIOD_DIV_CODE: 'D',
      },
      { trId: TR_ID.INDEX_DAILY_CHART }
    );

    const items = Array.isArray(data) ? data : [];

    const chartData = items
      .filter((item) => item.stck_bsop_date)
      .map((item) => ({
        날짜: item.stck_bsop_date,
        종가: Number(item.bstp_nmix_prpr).toFixed(2),
        시가: Number(item.bstp_nmix_oprc).toFixed(2),
        고가: Number(item.bstp_nmix_hgpr).toFixed(2),
        저가: Number(item.bstp_nmix_lwpr).toFixed(2),
        등락률: `${item.bstp_nmix_prdy_ctrt}%`,
      }));

    return formatToolResult(
      {
        업종코드: input.sector_code,
        시장: input.market.toUpperCase(),
        조회기간: `${startDate} ~ ${endDate}`,
        데이터수: chartData.length,
        일별차트: chartData,
      },
      [url]
    );
  },
});

/**
 * 지수 프로그램매매 조회
 */
export const getIndexProgramTrading = new DynamicStructuredTool({
  name: 'get_index_program_trading',
  description: `지수 관련 프로그램매매 동향을 조회합니다.
사용 시점: 지수선물/옵션 관련 프로그램매매가 필요할 때
키워드: 지수프로그램, 차익거래, 비차익거래, 프로그램순매수, 선물옵션`,
  schema: z.object({
    market: z.enum(['kospi', 'kosdaq']).default('kospi').describe('시장 구분'),
    start_date: z.string().optional().describe('시작일'),
    end_date: z.string().optional().describe('종료일'),
  }),
  func: async (input) => {
    const fid_cond_mrkt_div_code = input.market === 'kosdaq' ? 'Q' : 'J';
    const endDate = input.end_date || getToday();
    const startDate = input.start_date || getDaysAgo(30);

    const { data, url } = await callKisApi<IndexProgramItem[]>(
      '/uapi/domestic-stock/v1/quotations/inquire-index-program-trade',
      {
        FID_COND_MRKT_DIV_CODE: fid_cond_mrkt_div_code,
        FID_INPUT_DATE_1: startDate,
        FID_INPUT_DATE_2: endDate,
      },
      { trId: TR_ID.INDEX_PROGRAM }
    );

    const items = Array.isArray(data) ? data : [];

    const programData = items
      .filter((item) => item.stck_bsop_date)
      .map((item) => ({
        일자: item.stck_bsop_date,
        차익순매수: `${(Number(item.arbt_ntby_tram) / 100000000).toFixed(
          0
        )}억원`,
        비차익순매수: `${(Number(item.nrbt_ntby_tram) / 100000000).toFixed(
          0
        )}억원`,
        전체순매수: `${(Number(item.totl_ntby_tram) / 100000000).toFixed(
          0
        )}억원`,
        차익매수: `${(Number(item.arbt_buy_tram) / 100000000).toFixed(0)}억원`,
        차익매도: `${(Number(item.arbt_seln_tram) / 100000000).toFixed(0)}억원`,
        비차익매수: `${(Number(item.nrbt_buy_tram) / 100000000).toFixed(
          0
        )}억원`,
        비차익매도: `${(Number(item.nrbt_seln_tram) / 100000000).toFixed(
          0
        )}억원`,
      }));

    // 누적 계산
    let totalArbt = 0;
    let totalNrbt = 0;
    let totalAll = 0;

    for (const item of items) {
      totalArbt += Number(item.arbt_ntby_tram) || 0;
      totalNrbt += Number(item.nrbt_ntby_tram) || 0;
      totalAll += Number(item.totl_ntby_tram) || 0;
    }

    return formatToolResult(
      {
        시장: input.market.toUpperCase(),
        조회기간: `${startDate} ~ ${endDate}`,
        누적순매수: {
          차익: `${(totalArbt / 100000000).toFixed(0)}억원`,
          비차익: `${(totalNrbt / 100000000).toFixed(0)}억원`,
          전체: `${(totalAll / 100000000).toFixed(0)}억원`,
        },
        일별프로그램매매: programData,
      },
      [url]
    );
  },
});

/**
 * 주요 지수 종합 조회
 */
export const getMarketIndices = new DynamicStructuredTool({
  name: 'get_market_indices',
  description: `주요 시장 지수들을 한 번에 조회합니다 (코스피, 코스닥, 코스피200 등).
사용 시점: 시장 전체 현황, 주요 지수 동향이 필요할 때
키워드: 시장지수, 주요지수, 코스피코스닥, 지수종합, 시장현황`,
  schema: z.object({}),
  func: async () => {
    const indices = ['코스피', '코스닥', '코스피200', '코스닥150'] as const;
    const results = [];

    for (const indexName of indices) {
      try {
        const indexCode = INDEX_CODES[indexName];
        const { data } = await callKisApi<IndexPriceResponse>(
          '/uapi/domestic-stock/v1/quotations/inquire-index-price',
          {
            FID_COND_MRKT_DIV_CODE: 'U',
            FID_INPUT_ISCD: indexCode,
          },
          { trId: TR_ID.INDEX_PRICE }
        );

        results.push({
          지수명: indexName,
          현재가: Number(data.bstp_nmix_prpr).toFixed(2),
          전일대비: Number(data.bstp_nmix_prdy_vrss).toFixed(2),
          등락률: `${data.bstp_nmix_prdy_ctrt}%`,
          거래대금: `${(Number(data.acml_tr_pbmn) / 1000000000000).toFixed(
            1
          )}조원`,
        });
      } catch {
        results.push({
          지수명: indexName,
          현재가: '-',
          전일대비: '-',
          등락률: '-',
          거래대금: '-',
        });
      }
    }

    return formatToolResult(
      {
        주요지수: results,
      },
      []
    );
  },
});
