/**
 * 한국 주식 시세/호가/체결 API 도구
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

/** 현재가 상세 응답 */
interface PriceDetailResponse {
  stck_prpr: string; // 현재가
  prdy_vrss: string; // 전일대비
  prdy_vrss_sign: string; // 전일대비부호
  prdy_ctrt: string; // 전일대비율
  acml_vol: string; // 누적거래량
  acml_tr_pbmn: string; // 누적거래대금
  stck_oprc: string; // 시가
  stck_hgpr: string; // 고가
  stck_lwpr: string; // 저가
  stck_mxpr: string; // 상한가
  stck_llam: string; // 하한가
  w52_hgpr: string; // 52주최고가
  w52_lwpr: string; // 52주최저가
  per: string; // PER
  pbr: string; // PBR
  eps: string; // EPS
  bps: string; // BPS
  hts_avls: string; // 시가총액
  lstn_stcn: string; // 상장주수
  cpfn: string; // 자본금
}

/** 호가 응답 */
interface AskingPriceResponse {
  askp1: string; // 매도호가1
  askp2: string;
  askp3: string;
  askp4: string;
  askp5: string;
  askp6: string;
  askp7: string;
  askp8: string;
  askp9: string;
  askp10: string;
  bidp1: string; // 매수호가1
  bidp2: string;
  bidp3: string;
  bidp4: string;
  bidp5: string;
  bidp6: string;
  bidp7: string;
  bidp8: string;
  bidp9: string;
  bidp10: string;
  askp_rsqn1: string; // 매도호가잔량1
  askp_rsqn2: string;
  askp_rsqn3: string;
  askp_rsqn4: string;
  askp_rsqn5: string;
  askp_rsqn6: string;
  askp_rsqn7: string;
  askp_rsqn8: string;
  askp_rsqn9: string;
  askp_rsqn10: string;
  bidp_rsqn1: string; // 매수호가잔량1
  bidp_rsqn2: string;
  bidp_rsqn3: string;
  bidp_rsqn4: string;
  bidp_rsqn5: string;
  bidp_rsqn6: string;
  bidp_rsqn7: string;
  bidp_rsqn8: string;
  bidp_rsqn9: string;
  bidp_rsqn10: string;
  total_askp_rsqn: string; // 총매도호가잔량
  total_bidp_rsqn: string; // 총매수호가잔량
  antc_cnpr: string; // 예상체결가
}

/** 체결 응답 항목 */
interface ConclusionItem {
  stck_cntg_hour: string; // 체결시간
  stck_prpr: string; // 현재가
  prdy_vrss: string; // 전일대비
  prdy_vrss_sign: string; // 전일대비부호
  prdy_ctrt: string; // 전일대비율
  cntg_vol: string; // 체결거래량
  acml_vol: string; // 누적거래량
  tday_rltv: string; // 당일체결강도
}

/** 분별 시세 응답 항목 */
interface TimeChartItem {
  stck_bsop_date: string; // 영업일자
  stck_cntg_hour: string; // 체결시간
  stck_prpr: string; // 현재가
  stck_oprc: string; // 시가
  stck_hgpr: string; // 고가
  stck_lwpr: string; // 저가
  cntg_vol: string; // 체결거래량
  acml_vol: string; // 누적거래량
  prdy_vrss: string; // 전일대비
  prdy_ctrt: string; // 전일대비율
}

/** 시간외 시세 응답 */
interface OvertimePriceResponse {
  ovtm_untp_prpr: string; // 시간외단일가현재가
  ovtm_untp_prdy_vrss: string; // 시간외단일가전일대비
  ovtm_untp_prdy_vrss_sign: string; // 전일대비부호
  ovtm_untp_prdy_ctrt: string; // 시간외단일가전일대비율
  ovtm_untp_vol: string; // 시간외단일가거래량
  ovtm_untp_tr_pbmn: string; // 시간외단일가거래대금
}

/** 장운영 현황 응답 */
interface MarketStatusResponse {
  bzdy_sc_tp: string; // 영업일구분
  opnd_yn: string; // 개장여부
  mket_cls_sc_cd: string; // 장구분코드
  mket_cls_sc_nm: string; // 장구분명
  stck_prdy_clpr_hour: string; // 주식전일종가시간
  stck_prdy_oprc_hour: string; // 주식전일시가시간
  stck_oprc_hour: string; // 주식시가시간
  stck_cls_hour: string; // 주식종가시간
}

/** VI 발동 현황 응답 항목 */
interface ViStatusItem {
  stck_shrn_iscd: string; // 종목코드
  hts_kor_isnm: string; // 종목명
  vi_cls_code: string; // VI구분코드
  vi_stnd_prc: string; // VI기준가
  vi_uplm_prc: string; // VI상한가
  vi_lslm_prc: string; // VI하한가
  vi_oprc: string; // VI발동가
  vi_str_dttm: string; // VI발동시간
  vi_end_dttm: string; // VI종료시간
}

/** 예상체결가 응답 */
interface ExpectedPriceResponse {
  antc_mkop: string; // 예상시가
  antc_cnpr: string; // 예상체결가
  antc_cntg_vrss: string; // 예상체결대비
  antc_cntg_prdy_ctrt: string; // 예상체결등락률
  antc_vol: string; // 예상체결량
  antc_tr_pbmn: string; // 예상거래대금
  antc_cntg_vrss_sign: string; // 예상체결대비부호
  stck_prpr: string; // 현재가
}

/** 복수종목 시세 응답 항목 */
interface MultiPriceItem {
  stck_shrn_iscd: string; // 종목코드
  stck_prpr: string; // 현재가
  prdy_vrss: string; // 전일대비
  prdy_vrss_sign: string; // 전일대비부호
  prdy_ctrt: string; // 전일대비율
  acml_vol: string; // 누적거래량
  stck_oprc: string; // 시가
  stck_hgpr: string; // 고가
  stck_lwpr: string; // 저가
}

// ============================================================
// 스키마 정의
// ============================================================

const TickerInputSchema = z.object({
  ticker: z.string().describe('종목코드 (6자리). 예: "005930"'),
});

const TimeChartInputSchema = z.object({
  ticker: z.string().describe('종목코드 (6자리). 예: "005930"'),
  period: z
    .enum(['1', '3', '5', '10', '15', '30', '60'])
    .default('1')
    .describe('분봉 구간'),
  count: z.number().default(30).describe('조회 개수 (최대 100)'),
});

const MultiTickerInputSchema = z.object({
  tickers: z
    .array(z.string())
    .describe('종목코드 배열. 예: ["005930", "000660"]'),
});

// ============================================================
// 도구 정의
// ============================================================

/**
 * 현재가 상세 조회
 */
export const getPriceDetail = new DynamicStructuredTool({
  name: 'get_price_detail',
  description: `종목의 현재가 상세 정보를 조회합니다. PER, PBR, EPS, BPS 등 투자지표 포함.
사용 시점: 종목의 상세 시세와 투자지표가 필요할 때
키워드: 현재가상세, PER, PBR, EPS, BPS, 시가총액, 상한가, 하한가`,
  schema: TickerInputSchema,
  func: async (input) => {
    const { data, url } = await callKisApi<PriceDetailResponse>(
      '/uapi/domestic-stock/v1/quotations/inquire-price',
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: input.ticker,
      },
      { trId: TR_ID.PRICE_CURRENT }
    );

    const result = {
      종목코드: input.ticker,
      현재가: Number(data.stck_prpr).toLocaleString('ko-KR'),
      전일대비: Number(data.prdy_vrss).toLocaleString('ko-KR'),
      등락률: `${data.prdy_ctrt}%`,
      시가: Number(data.stck_oprc).toLocaleString('ko-KR'),
      고가: Number(data.stck_hgpr).toLocaleString('ko-KR'),
      저가: Number(data.stck_lwpr).toLocaleString('ko-KR'),
      상한가: Number(data.stck_mxpr).toLocaleString('ko-KR'),
      하한가: Number(data.stck_llam).toLocaleString('ko-KR'),
      거래량: Number(data.acml_vol).toLocaleString('ko-KR'),
      거래대금: `${(Number(data.acml_tr_pbmn) / 100000000).toFixed(1)}억원`,
      시가총액: `${(Number(data.hts_avls) / 10000).toFixed(1)}조원`,
      '52주_최고': Number(data.w52_hgpr).toLocaleString('ko-KR'),
      '52주_최저': Number(data.w52_lwpr).toLocaleString('ko-KR'),
      PER: data.per || '-',
      PBR: data.pbr || '-',
      EPS: data.eps || '-',
      BPS: data.bps || '-',
      상장주수: Number(data.lstn_stcn).toLocaleString('ko-KR'),
    };

    return formatToolResult(result, [url]);
  },
});

/**
 * 호가 조회
 */
export const getAskingPrice = new DynamicStructuredTool({
  name: 'get_asking_price',
  description: `종목의 호가 정보를 조회합니다. 10단계 매수/매도 호가와 잔량 정보.
사용 시점: 호가창, 매수/매도 호가 잔량이 필요할 때
키워드: 호가, 매수호가, 매도호가, 호가잔량, 오더북, 주문장`,
  schema: TickerInputSchema,
  func: async (input) => {
    const { data, url } = await callKisApi<AskingPriceResponse>(
      '/uapi/domestic-stock/v1/quotations/inquire-asking-price-exp-ccn',
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: input.ticker,
      },
      { trId: TR_ID.ASKING_PRICE }
    );

    // 호가 데이터 정리
    const askPrices = [];
    const bidPrices = [];

    for (let i = 1; i <= 10; i++) {
      const askKey = `askp${i}` as keyof AskingPriceResponse;
      const askQtyKey = `askp_rsqn${i}` as keyof AskingPriceResponse;
      const bidKey = `bidp${i}` as keyof AskingPriceResponse;
      const bidQtyKey = `bidp_rsqn${i}` as keyof AskingPriceResponse;

      if (data[askKey] && Number(data[askKey]) > 0) {
        askPrices.push({
          단계: i,
          호가: Number(data[askKey]).toLocaleString('ko-KR'),
          잔량: Number(data[askQtyKey]).toLocaleString('ko-KR'),
        });
      }

      if (data[bidKey] && Number(data[bidKey]) > 0) {
        bidPrices.push({
          단계: i,
          호가: Number(data[bidKey]).toLocaleString('ko-KR'),
          잔량: Number(data[bidQtyKey]).toLocaleString('ko-KR'),
        });
      }
    }

    return formatToolResult(
      {
        종목코드: input.ticker,
        총매도잔량: Number(data.total_askp_rsqn).toLocaleString('ko-KR'),
        총매수잔량: Number(data.total_bidp_rsqn).toLocaleString('ko-KR'),
        예상체결가: Number(data.antc_cnpr).toLocaleString('ko-KR'),
        매도호가: askPrices,
        매수호가: bidPrices,
      },
      [url]
    );
  },
});

/**
 * 체결 조회
 */
export const getConclusions = new DynamicStructuredTool({
  name: 'get_conclusions',
  description: `종목의 실시간 체결 내역을 조회합니다. 시간대별 체결가격/수량 정보.
사용 시점: 실시간 체결 내역, 틱 데이터가 필요할 때
키워드: 체결, 틱, 실시간체결, 체결내역, 거래내역`,
  schema: z.object({
    ticker: z.string().describe('종목코드 (6자리)'),
    count: z.number().default(30).describe('조회 개수'),
  }),
  func: async (input) => {
    const { data, url } = await callKisApi<ConclusionItem[]>(
      '/uapi/domestic-stock/v1/quotations/inquire-ccnl',
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: input.ticker,
      },
      { trId: TR_ID.PRICE_TICK }
    );

    const items = Array.isArray(data) ? data.slice(0, input.count) : [];

    const conclusions = items.map((item) => ({
      체결시간: item.stck_cntg_hour,
      체결가: Number(item.stck_prpr).toLocaleString('ko-KR'),
      전일대비: Number(item.prdy_vrss).toLocaleString('ko-KR'),
      등락률: `${item.prdy_ctrt}%`,
      체결량: Number(item.cntg_vol).toLocaleString('ko-KR'),
      누적거래량: Number(item.acml_vol).toLocaleString('ko-KR'),
      체결강도: `${item.tday_rltv}%`,
    }));

    return formatToolResult(
      {
        종목코드: input.ticker,
        체결수: conclusions.length,
        체결내역: conclusions,
      },
      [url]
    );
  },
});

/**
 * 분봉 차트 조회
 */
export const getTimeChart = new DynamicStructuredTool({
  name: 'get_time_chart',
  description: `종목의 분봉(분별 시세) 데이터를 조회합니다. 1/3/5/10/15/30/60분봉 지원.
사용 시점: 분봉 차트, 단기 시세 흐름이 필요할 때
키워드: 분봉, 분차트, 단기차트, 인트라데이, 1분봉, 5분봉`,
  schema: TimeChartInputSchema,
  func: async (input) => {
    const { data, url } = await callKisApi<TimeChartItem[]>(
      '/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice',
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: input.ticker,
        FID_INPUT_HOUR_1: '160000',
        FID_ETC_CLS_CODE: '',
        FID_PW_DATA_INCU_YN: 'Y',
      },
      { trId: TR_ID.TIME_CHART }
    );

    const items = Array.isArray(data) ? data.slice(0, input.count) : [];

    const chartData = items
      .filter((item) => item.stck_cntg_hour)
      .map((item) => ({
        시간: item.stck_cntg_hour,
        시가: Number(item.stck_oprc),
        고가: Number(item.stck_hgpr),
        저가: Number(item.stck_lwpr),
        종가: Number(item.stck_prpr),
        거래량: Number(item.cntg_vol),
        누적거래량: Number(item.acml_vol),
      }));

    return formatToolResult(
      {
        종목코드: input.ticker,
        분봉구간: `${input.period}분`,
        데이터수: chartData.length,
        차트: chartData,
      },
      [url]
    );
  },
});

/**
 * 시간외 시세 조회
 */
export const getOvertimePrice = new DynamicStructuredTool({
  name: 'get_overtime_price',
  description: `종목의 시간외 단일가 시세를 조회합니다.
사용 시점: 장 마감 후 시간외 거래 시세가 필요할 때
키워드: 시간외, 장외거래, 시간외단일가, 애프터마켓`,
  schema: TickerInputSchema,
  func: async (input) => {
    const { data, url } = await callKisApi<OvertimePriceResponse>(
      '/uapi/domestic-stock/v1/quotations/inquire-daily-overtimeprice',
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: input.ticker,
      },
      { trId: TR_ID.OVERTIME_PRICE }
    );

    return formatToolResult(
      {
        종목코드: input.ticker,
        시간외현재가: Number(data.ovtm_untp_prpr).toLocaleString('ko-KR'),
        시간외전일대비: Number(data.ovtm_untp_prdy_vrss).toLocaleString(
          'ko-KR'
        ),
        시간외등락률: `${data.ovtm_untp_prdy_ctrt}%`,
        시간외거래량: Number(data.ovtm_untp_vol).toLocaleString('ko-KR'),
        시간외거래대금: `${(Number(data.ovtm_untp_tr_pbmn) / 100000000).toFixed(
          1
        )}억원`,
      },
      [url]
    );
  },
});

/**
 * 시간외 호가 조회
 */
export const getOvertimeAskingPrice = new DynamicStructuredTool({
  name: 'get_overtime_asking_price',
  description: `종목의 시간외 호가 정보를 조회합니다.
사용 시점: 시간외 거래 시 호가창 정보가 필요할 때
키워드: 시간외호가, 장외호가, 시간외매수, 시간외매도`,
  schema: TickerInputSchema,
  func: async (input) => {
    const { data, url } = await callKisApi<AskingPriceResponse>(
      '/uapi/domestic-stock/v1/quotations/inquire-overtime-asking-price',
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: input.ticker,
      },
      { trId: TR_ID.OVERTIME_ASKING_PRICE }
    );

    const askPrices = [];
    const bidPrices = [];

    for (let i = 1; i <= 5; i++) {
      const askKey = `askp${i}` as keyof AskingPriceResponse;
      const askQtyKey = `askp_rsqn${i}` as keyof AskingPriceResponse;
      const bidKey = `bidp${i}` as keyof AskingPriceResponse;
      const bidQtyKey = `bidp_rsqn${i}` as keyof AskingPriceResponse;

      if (data[askKey] && Number(data[askKey]) > 0) {
        askPrices.push({
          단계: i,
          호가: Number(data[askKey]).toLocaleString('ko-KR'),
          잔량: Number(data[askQtyKey]).toLocaleString('ko-KR'),
        });
      }

      if (data[bidKey] && Number(data[bidKey]) > 0) {
        bidPrices.push({
          단계: i,
          호가: Number(data[bidKey]).toLocaleString('ko-KR'),
          잔량: Number(data[bidQtyKey]).toLocaleString('ko-KR'),
        });
      }
    }

    return formatToolResult(
      {
        종목코드: input.ticker,
        총매도잔량: Number(data.total_askp_rsqn).toLocaleString('ko-KR'),
        총매수잔량: Number(data.total_bidp_rsqn).toLocaleString('ko-KR'),
        매도호가: askPrices,
        매수호가: bidPrices,
      },
      [url]
    );
  },
});

/**
 * 예상체결가 조회
 */
export const getExpectedPrice = new DynamicStructuredTool({
  name: 'get_expected_price',
  description: `종목의 예상체결가 정보를 조회합니다 (동시호가 시간).
사용 시점: 장 시작 전/마감 동시호가 시 예상체결가가 필요할 때
키워드: 예상체결가, 동시호가, 예상시가, 예상종가, 갭`,
  schema: TickerInputSchema,
  func: async (input) => {
    const { data, url } = await callKisApi<ExpectedPriceResponse>(
      '/uapi/domestic-stock/v1/quotations/inquire-asking-price-exp-ccn',
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: input.ticker,
      },
      { trId: TR_ID.ASKING_PRICE }
    );

    return formatToolResult(
      {
        종목코드: input.ticker,
        현재가: Number(data.stck_prpr).toLocaleString('ko-KR'),
        예상시가: Number(data.antc_mkop).toLocaleString('ko-KR'),
        예상체결가: Number(data.antc_cnpr).toLocaleString('ko-KR'),
        예상체결대비: Number(data.antc_cntg_vrss).toLocaleString('ko-KR'),
        예상등락률: `${data.antc_cntg_prdy_ctrt}%`,
        예상체결량: Number(data.antc_vol).toLocaleString('ko-KR'),
        예상거래대금: `${(Number(data.antc_tr_pbmn) / 100000000).toFixed(
          1
        )}억원`,
      },
      [url]
    );
  },
});

/**
 * 장운영 현황 조회
 */
export const getMarketStatus = new DynamicStructuredTool({
  name: 'get_market_status',
  description: `현재 장운영 현황을 조회합니다. 장 시작/종료 시간, 개장 여부 등.
사용 시점: 현재 장이 열렸는지, 장운영 시간이 필요할 때
키워드: 장상태, 개장, 폐장, 장운영시간, 장시작, 장마감`,
  schema: z.object({}),
  func: async () => {
    const { data, url } = await callKisApi<MarketStatusResponse>(
      '/uapi/domestic-stock/v1/quotations/inquire-market-time',
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: '0000',
      },
      { trId: TR_ID.MARKET_TIME }
    );

    return formatToolResult(
      {
        영업일구분: data.bzdy_sc_tp,
        개장여부: data.opnd_yn === 'Y' ? '개장' : '폐장',
        장구분: data.mket_cls_sc_nm,
        시가시간: data.stck_oprc_hour,
        종가시간: data.stck_cls_hour,
      },
      [url]
    );
  },
});

/**
 * VI 발동 현황 조회
 */
export const getViStatus = new DynamicStructuredTool({
  name: 'get_vi_status',
  description: `변동성 완화장치(VI) 발동 현황을 조회합니다.
사용 시점: VI 발동 종목, 급등락 종목 확인이 필요할 때
키워드: VI, 변동성완화장치, 서킷브레이커, 급등, 급락, 변동성`,
  schema: z.object({
    market: z
      .enum(['all', 'kospi', 'kosdaq'])
      .default('all')
      .describe('시장 구분'),
  }),
  func: async (input) => {
    const fid_cond_mrkt_div_code = input.market === 'kosdaq' ? 'Q' : 'J';

    const { data, url } = await callKisApi<ViStatusItem[]>(
      '/uapi/domestic-stock/v1/quotations/inquire-vi-status',
      {
        FID_COND_MRKT_DIV_CODE: fid_cond_mrkt_div_code,
        FID_INPUT_ISCD: '0000',
      },
      { trId: 'FHPST01510000' }
    );

    const items = Array.isArray(data) ? data : [];

    const viList = items.map((item) => ({
      종목코드: item.stck_shrn_iscd,
      종목명: item.hts_kor_isnm,
      VI구분: item.vi_cls_code === '1' ? '정적VI' : '동적VI',
      기준가: Number(item.vi_stnd_prc).toLocaleString('ko-KR'),
      발동가: Number(item.vi_oprc).toLocaleString('ko-KR'),
      상한가: Number(item.vi_uplm_prc).toLocaleString('ko-KR'),
      하한가: Number(item.vi_lslm_prc).toLocaleString('ko-KR'),
      발동시간: item.vi_str_dttm,
      종료시간: item.vi_end_dttm,
    }));

    return formatToolResult(
      {
        시장: input.market === 'all' ? '전체' : input.market.toUpperCase(),
        VI발동종목수: viList.length,
        VI현황: viList,
      },
      [url]
    );
  },
});

/**
 * 복수종목 시세 조회
 */
export const getMultiPrice = new DynamicStructuredTool({
  name: 'get_multi_price',
  description: `여러 종목의 현재가를 한 번에 조회합니다 (최대 20종목).
사용 시점: 여러 종목 시세를 동시에 확인해야 할 때
키워드: 복수종목, 다중종목, 여러종목, 포트폴리오시세, 관심종목시세`,
  schema: MultiTickerInputSchema,
  func: async (input) => {
    const tickers = input.tickers.slice(0, 20); // 최대 20개

    // 개별 조회 (복수종목 API가 없는 경우 병렬 조회)
    const results = await Promise.all(
      tickers.map(async (ticker) => {
        try {
          const { data } = await callKisApi<PriceDetailResponse>(
            '/uapi/domestic-stock/v1/quotations/inquire-price',
            {
              FID_COND_MRKT_DIV_CODE: 'J',
              FID_INPUT_ISCD: ticker,
            },
            { trId: TR_ID.PRICE_CURRENT }
          );
          return {
            종목코드: ticker,
            현재가: Number(data.stck_prpr).toLocaleString('ko-KR'),
            전일대비: Number(data.prdy_vrss).toLocaleString('ko-KR'),
            등락률: `${data.prdy_ctrt}%`,
            거래량: Number(data.acml_vol).toLocaleString('ko-KR'),
            시가: Number(data.stck_oprc).toLocaleString('ko-KR'),
            고가: Number(data.stck_hgpr).toLocaleString('ko-KR'),
            저가: Number(data.stck_lwpr).toLocaleString('ko-KR'),
          };
        } catch {
          return {
            종목코드: ticker,
            오류: '조회 실패',
          };
        }
      })
    );

    return formatToolResult(
      {
        조회종목수: tickers.length,
        시세: results,
      },
      []
    );
  },
});

/**
 * 일별 거래량 추이 조회
 */
export const getDailyTradeVolume = new DynamicStructuredTool({
  name: 'get_daily_trade_volume',
  description: `종목의 일별 거래량 추이를 조회합니다.
사용 시점: 거래량 변화 패턴, 거래량 급증 확인이 필요할 때
키워드: 일별거래량, 거래량추이, 거래량급증, 거래량분석`,
  schema: z.object({
    ticker: z.string().describe('종목코드 (6자리)'),
    days: z.number().default(30).describe('조회 일수'),
  }),
  func: async (input) => {
    const endDate = getToday();
    const startDate = getDaysAgo(input.days);

    const { data, url } = await callKisApi<TimeChartItem[]>(
      '/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice',
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: input.ticker,
        FID_INPUT_DATE_1: startDate,
        FID_INPUT_DATE_2: endDate,
        FID_PERIOD_DIV_CODE: 'D',
        FID_ORG_ADJ_PRC: '1',
      },
      { trId: TR_ID.PRICE_DAILY }
    );

    const items = Array.isArray(data) ? data : [];

    const volumes = items
      .filter((item) => item.stck_bsop_date)
      .map((item) => ({
        날짜: item.stck_bsop_date,
        종가: Number(item.stck_prpr).toLocaleString('ko-KR'),
        등락률: `${item.prdy_ctrt}%`,
        거래량: Number(item.acml_vol).toLocaleString('ko-KR'),
      }));

    // 평균 거래량 계산
    const totalVolume = items.reduce(
      (sum, item) => sum + Number(item.acml_vol || 0),
      0
    );
    const avgVolume = Math.round(totalVolume / items.length);

    return formatToolResult(
      {
        종목코드: input.ticker,
        조회기간: `${startDate} ~ ${endDate}`,
        평균거래량: avgVolume.toLocaleString('ko-KR'),
        일별거래량: volumes,
      },
      [url]
    );
  },
});

/**
 * 휴장일 조회
 */
export const getHolidays = new DynamicStructuredTool({
  name: 'get_holidays',
  description: `주식시장 휴장일 정보를 조회합니다.
사용 시점: 휴장일, 공휴일 주식시장 운영 여부 확인이 필요할 때
키워드: 휴장일, 공휴일, 개장일, 영업일, 주식시장휴일`,
  schema: z.object({
    year: z.string().optional().describe('조회 연도 (YYYY). 생략시 올해'),
    month: z.string().optional().describe('조회 월 (MM). 생략시 전체'),
  }),
  func: async (input) => {
    const today = new Date();
    const year = input.year || String(today.getFullYear());
    const month = input.month || '';

    const { data, url } = await callKisApi<
      Array<{
        bass_dt: string;
        wday_dvsn_cd: string;
        bzdy_yn: string;
        opnd_yn: string;
      }>
    >(
      '/uapi/domestic-stock/v1/quotations/chk-holiday',
      {
        BASS_DT: year + (month ? month : '01') + '01',
        CTX_AREA_FK: '',
        CTX_AREA_NK: '',
      },
      { trId: TR_ID.HOLIDAY }
    );

    const items = Array.isArray(data) ? data : [];

    const holidays = items
      .filter((item) => item.bzdy_yn === 'N')
      .map((item) => ({
        날짜: item.bass_dt,
        요일:
          ['일', '월', '화', '수', '목', '금', '토'][
            Number(item.wday_dvsn_cd)
          ] || '-',
        영업일여부: item.bzdy_yn === 'Y' ? '영업일' : '휴장일',
        개장여부: item.opnd_yn === 'Y' ? '개장' : '폐장',
      }));

    return formatToolResult(
      {
        조회년도: year,
        조회월: month || '전체',
        휴장일수: holidays.length,
        휴장일목록: holidays,
      },
      [url]
    );
  },
});
