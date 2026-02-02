/**
 * DART DS002 정기보고서 주요정보 API 도구
 * @see https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS002
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { callDartApi, REPORT_CODE, getBusinessYear } from './api.js';
import { getCorpCode } from './corp-code.js';
import { formatToolResult } from '../../types.js';

// ============================================================
// 스키마 정의
// ============================================================

const PeriodicReportInputSchema = z.object({
  ticker: z.string().describe('종목코드 (6자리) 또는 회사명'),
  year: z.string().optional().describe('사업연도 (YYYY). 생략시 최근 연도'),
  report_type: z
    .enum(['annual', 'q1', 'q2', 'q3'])
    .default('annual')
    .describe('보고서 유형'),
});

// ============================================================
// 유틸리티 함수
// ============================================================

function getReportCode(reportType: string): string {
  switch (reportType) {
    case 'q1':
      return REPORT_CODE.Q1;
    case 'q2':
      return REPORT_CODE.Q2;
    case 'q3':
      return REPORT_CODE.Q3;
    default:
      return REPORT_CODE.ANNUAL;
  }
}

function formatAmount(amount: string | undefined): string {
  if (!amount) {
    return '-';
  }
  const num = Number(amount.replace(/,/g, ''));
  if (isNaN(num)) {
    return amount;
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
// 주주/자본 관련 (7개)
// ============================================================

/**
 * 증자/감자 현황 조회
 */
export const getCapitalChange = new DynamicStructuredTool({
  name: 'get_capital_change',
  description: `기업의 증자/감자 현황을 조회합니다.
사용 시점: 자본금 변동, 유상증자/무상증자/감자 이력이 필요할 때
키워드: 증자, 감자, 자본금변동, 유상증자, 무상증자, 주식수변동`,
  schema: PeriodicReportInputSchema,
  func: async (input) => {
    const corpCode = await getCorpCode(input.ticker);
    if (!corpCode) {
      return formatToolResult(
        { error: `종목을 찾을 수 없습니다: ${input.ticker}` },
        []
      );
    }

    const year = input.year || getBusinessYear(0);
    const reprtCode = getReportCode(input.report_type);

    const { data, url } = await callDartApi<{
      list: Array<{
        rcept_no: string;
        stock_knd: string; // 주식종류
        isu_dcrs_de: string; // 증감일
        isu_dcrs_stle: string; // 증감사유
        isu_dcrs_stock_knd: string; // 증감주식종류
        isu_dcrs_qy: string; // 증감수량
        isu_dcrs_mstvdv_fval_amount: string; // 액면가액
        isu_dcrs_mstvdv_amount: string; // 발행(감소)가액
      }>;
    }>('/irdsSttus.json', {
      corp_code: corpCode,
      bsns_year: year,
      reprt_code: reprtCode,
    });

    const items = data.list || [];

    const changes = items.map((item) => ({
      주식종류: item.stock_knd,
      증감일: item.isu_dcrs_de,
      증감사유: item.isu_dcrs_stle,
      증감수량: item.isu_dcrs_qy,
      액면가액: formatAmount(item.isu_dcrs_mstvdv_fval_amount),
      발행가액: formatAmount(item.isu_dcrs_mstvdv_amount),
    }));

    return formatToolResult(
      {
        종목: input.ticker,
        사업연도: year,
        보고서: input.report_type,
        증자감자현황: changes,
      },
      [url]
    );
  },
});

/**
 * 배당에 관한 사항 조회
 */
export const getDividendInfo = new DynamicStructuredTool({
  name: 'get_dividend_info',
  description: `기업의 배당에 관한 사항을 조회합니다.
사용 시점: 배당금, 배당성향, 배당수익률 정보가 필요할 때
키워드: 배당, 배당금, 배당성향, 배당수익률, 현금배당, 주식배당`,
  schema: PeriodicReportInputSchema,
  func: async (input) => {
    const corpCode = await getCorpCode(input.ticker);
    if (!corpCode) {
      return formatToolResult(
        { error: `종목을 찾을 수 없습니다: ${input.ticker}` },
        []
      );
    }

    const year = input.year || getBusinessYear(0);
    const reprtCode = getReportCode(input.report_type);

    const { data, url } = await callDartApi<{
      list: Array<{
        se: string; // 구분
        thstrm: string; // 당기
        frmtrm: string; // 전기
        lwfr: string; // 전전기
      }>;
    }>('/alotMatter.json', {
      corp_code: corpCode,
      bsns_year: year,
      reprt_code: reprtCode,
    });

    const items = data.list || [];

    const dividendInfo = items.map((item) => ({
      구분: item.se,
      당기: item.thstrm,
      전기: item.frmtrm,
      전전기: item.lwfr,
    }));

    return formatToolResult(
      {
        종목: input.ticker,
        사업연도: year,
        보고서: input.report_type,
        배당현황: dividendInfo,
      },
      [url]
    );
  },
});

/**
 * 자기주식 취득/처분 현황 조회
 */
export const getTreasuryStock = new DynamicStructuredTool({
  name: 'get_treasury_stock',
  description: `기업의 자기주식 취득/처분 현황을 조회합니다.
사용 시점: 자사주 매입/소각 현황이 필요할 때
키워드: 자기주식, 자사주, 자사주매입, 자사주소각, 자기주식취득`,
  schema: PeriodicReportInputSchema,
  func: async (input) => {
    const corpCode = await getCorpCode(input.ticker);
    if (!corpCode) {
      return formatToolResult(
        { error: `종목을 찾을 수 없습니다: ${input.ticker}` },
        []
      );
    }

    const year = input.year || getBusinessYear(0);
    const reprtCode = getReportCode(input.report_type);

    const { data, url } = await callDartApi<{
      list: Array<{
        acqs_mth1: string; // 취득방법1
        acqs_mth2: string; // 취득방법2
        acqs_mth3: string; // 취득방법3
        stock_knd: string; // 주식종류
        bsis_qy: string; // 기초수량
        change_qy_acqs: string; // 변동수량(취득)
        change_qy_dsps: string; // 변동수량(처분)
        change_qy_incnr: string; // 변동수량(소각)
        trmend_qy: string; // 기말수량
        rm: string; // 비고
      }>;
    }>('/tesstkAcqsDspsSttus.json', {
      corp_code: corpCode,
      bsns_year: year,
      reprt_code: reprtCode,
    });

    const items = data.list || [];

    const treasuryStock = items.map((item) => ({
      주식종류: item.stock_knd,
      취득방법: `${item.acqs_mth1} ${item.acqs_mth2} ${item.acqs_mth3}`.trim(),
      기초수량: item.bsis_qy,
      취득: item.change_qy_acqs,
      처분: item.change_qy_dsps,
      소각: item.change_qy_incnr,
      기말수량: item.trmend_qy,
      비고: item.rm,
    }));

    return formatToolResult(
      {
        종목: input.ticker,
        사업연도: year,
        보고서: input.report_type,
        자기주식현황: treasuryStock,
      },
      [url]
    );
  },
});

/**
 * 최대주주 현황 조회
 */
export const getLargestShareholder = new DynamicStructuredTool({
  name: 'get_largest_shareholder',
  description: `기업의 최대주주 현황을 조회합니다.
사용 시점: 최대주주, 대주주 지분 현황이 필요할 때
키워드: 최대주주, 대주주, 지분, 지분율, 주요주주, 오너지분`,
  schema: PeriodicReportInputSchema,
  func: async (input) => {
    const corpCode = await getCorpCode(input.ticker);
    if (!corpCode) {
      return formatToolResult(
        { error: `종목을 찾을 수 없습니다: ${input.ticker}` },
        []
      );
    }

    const year = input.year || getBusinessYear(0);
    const reprtCode = getReportCode(input.report_type);

    const { data, url } = await callDartApi<{
      list: Array<{
        nm: string; // 성명
        relate: string; // 관계
        stock_knd: string; // 주식종류
        bsis_posesn_stock_co: string; // 기초소유주식수
        bsis_posesn_stock_qota_rt: string; // 기초소유지분율
        trmend_posesn_stock_co: string; // 기말소유주식수
        trmend_posesn_stock_qota_rt: string; // 기말소유지분율
        rm: string; // 비고
      }>;
    }>('/hyslrSttus.json', {
      corp_code: corpCode,
      bsns_year: year,
      reprt_code: reprtCode,
    });

    const items = data.list || [];

    const shareholders = items.map((item) => ({
      성명: item.nm,
      관계: item.relate,
      주식종류: item.stock_knd,
      기초주식수: item.bsis_posesn_stock_co,
      기초지분율: `${item.bsis_posesn_stock_qota_rt}%`,
      기말주식수: item.trmend_posesn_stock_co,
      기말지분율: `${item.trmend_posesn_stock_qota_rt}%`,
      비고: item.rm,
    }));

    return formatToolResult(
      {
        종목: input.ticker,
        사업연도: year,
        보고서: input.report_type,
        최대주주현황: shareholders,
      },
      [url]
    );
  },
});

/**
 * 최대주주 변동 현황 조회
 */
export const getLargestShareholderChange = new DynamicStructuredTool({
  name: 'get_largest_shareholder_change',
  description: `기업의 최대주주 변동 현황을 조회합니다.
사용 시점: 최대주주 변경 이력이 필요할 때
키워드: 최대주주변동, 대주주변경, 지배구조변경, 경영권변동`,
  schema: PeriodicReportInputSchema,
  func: async (input) => {
    const corpCode = await getCorpCode(input.ticker);
    if (!corpCode) {
      return formatToolResult(
        { error: `종목을 찾을 수 없습니다: ${input.ticker}` },
        []
      );
    }

    const year = input.year || getBusinessYear(0);
    const reprtCode = getReportCode(input.report_type);

    const { data, url } = await callDartApi<{
      list: Array<{
        change_on: string; // 변동일
        mxmm_shrholdr_nm: string; // 최대주주명
        posesn_stock_co: string; // 소유주식수
        qota_rt: string; // 지분율
        change_cause: string; // 변동원인
        rm: string; // 비고
      }>;
    }>('/hyslrChgSttus.json', {
      corp_code: corpCode,
      bsns_year: year,
      reprt_code: reprtCode,
    });

    const items = data.list || [];

    const changes = items.map((item) => ({
      변동일: item.change_on,
      최대주주명: item.mxmm_shrholdr_nm,
      소유주식수: item.posesn_stock_co,
      지분율: `${item.qota_rt}%`,
      변동원인: item.change_cause,
      비고: item.rm,
    }));

    return formatToolResult(
      {
        종목: input.ticker,
        사업연도: year,
        보고서: input.report_type,
        최대주주변동: changes,
      },
      [url]
    );
  },
});

/**
 * 소액주주 현황 조회
 */
export const getMinorityShareholder = new DynamicStructuredTool({
  name: 'get_minority_shareholder',
  description: `기업의 소액주주 현황을 조회합니다.
사용 시점: 소액주주 비율, 주주분포가 필요할 때
키워드: 소액주주, 일반주주, 주주분포, 주주현황, 지분분포`,
  schema: PeriodicReportInputSchema,
  func: async (input) => {
    const corpCode = await getCorpCode(input.ticker);
    if (!corpCode) {
      return formatToolResult(
        { error: `종목을 찾을 수 없습니다: ${input.ticker}` },
        []
      );
    }

    const year = input.year || getBusinessYear(0);
    const reprtCode = getReportCode(input.report_type);

    const { data, url } = await callDartApi<{
      list: Array<{
        se: string; // 구분
        shrholdr_co: string; // 주주수
        shrholdr_tot_co: string; // 전체주주수
        shrholdr_rate: string; // 주주비율
        hold_stock_co: string; // 보유주식수
        stock_tot_co: string; // 총발행주식수
        hold_stock_rate: string; // 보유주식비율
      }>;
    }>('/mrhlSttus.json', {
      corp_code: corpCode,
      bsns_year: year,
      reprt_code: reprtCode,
    });

    const items = data.list || [];

    const minorities = items.map((item) => ({
      구분: item.se,
      주주수: item.shrholdr_co,
      전체주주수: item.shrholdr_tot_co,
      주주비율: `${item.shrholdr_rate}%`,
      보유주식수: item.hold_stock_co,
      총발행주식수: item.stock_tot_co,
      보유주식비율: `${item.hold_stock_rate}%`,
    }));

    return formatToolResult(
      {
        종목: input.ticker,
        사업연도: year,
        보고서: input.report_type,
        소액주주현황: minorities,
      },
      [url]
    );
  },
});

/**
 * 주식 총수 현황 조회
 */
export const getTotalShares = new DynamicStructuredTool({
  name: 'get_total_shares',
  description: `기업의 주식 총수 현황을 조회합니다.
사용 시점: 발행주식수, 유통주식수, 자기주식 현황이 필요할 때
키워드: 주식총수, 발행주식, 유통주식, 상장주식수, 자기주식`,
  schema: PeriodicReportInputSchema,
  func: async (input) => {
    const corpCode = await getCorpCode(input.ticker);
    if (!corpCode) {
      return formatToolResult(
        { error: `종목을 찾을 수 없습니다: ${input.ticker}` },
        []
      );
    }

    const year = input.year || getBusinessYear(0);
    const reprtCode = getReportCode(input.report_type);

    const { data, url } = await callDartApi<{
      list: Array<{
        se: string; // 구분
        isu_stock_totqy: string; // 발행주식총수
        now_to_isu_stock_totqy: string; // 현재까지발행주식총수
        now_to_dcrs_stock_totqy: string; // 현재까지감소주식총수
        redc: string; // 감자
        profit_incnr: string; // 이익소각
        rdmstk_repy: string; // 상환주식상환
        etc: string; // 기타
        istc_totqy: string; // 발행주식총수
        tesstk_co: string; // 자기주식수
        distb_stock_co: string; // 유통주식수
      }>;
    }>('/stockTotqySttus.json', {
      corp_code: corpCode,
      bsns_year: year,
      reprt_code: reprtCode,
    });

    const items = data.list || [];

    const totalShares = items.map((item) => ({
      구분: item.se,
      발행주식총수: item.isu_stock_totqy,
      감자: item.redc,
      이익소각: item.profit_incnr,
      상환: item.rdmstk_repy,
      기타: item.etc,
      현발행주식수: item.istc_totqy,
      자기주식수: item.tesstk_co,
      유통주식수: item.distb_stock_co,
    }));

    return formatToolResult(
      {
        종목: input.ticker,
        사업연도: year,
        보고서: input.report_type,
        주식총수현황: totalShares,
      },
      [url]
    );
  },
});

// ============================================================
// 임원/직원 관련 (9개)
// ============================================================

/**
 * 임원 현황 조회
 */
export const getExecutives = new DynamicStructuredTool({
  name: 'get_executives',
  description: `기업의 임원 현황을 조회합니다.
사용 시점: 임원 구성, 경영진 정보가 필요할 때
키워드: 임원, 이사, 감사, CEO, 대표이사, 경영진, 사내이사`,
  schema: PeriodicReportInputSchema,
  func: async (input) => {
    const corpCode = await getCorpCode(input.ticker);
    if (!corpCode) {
      return formatToolResult(
        { error: `종목을 찾을 수 없습니다: ${input.ticker}` },
        []
      );
    }

    const year = input.year || getBusinessYear(0);
    const reprtCode = getReportCode(input.report_type);

    const { data, url } = await callDartApi<{
      list: Array<{
        nm: string; // 성명
        sexdstn: string; // 성별
        birth_ym: string; // 출생년월
        ofcps: string; // 직위
        rgist_exctv_at: string; // 등기임원여부
        fte_at: string; // 상근여부
        chrg_job: string; // 담당업무
        main_career: string; // 주요경력
        mxmm_shrholdr_relate: string; // 최대주주관계
        hffc_pd: string; // 재직기간
        tenure_end_on: string; // 임기만료일
      }>;
    }>('/exctvSttus.json', {
      corp_code: corpCode,
      bsns_year: year,
      reprt_code: reprtCode,
    });

    const items = data.list || [];

    const executives = items.map((item) => ({
      성명: item.nm,
      성별: item.sexdstn,
      출생년월: item.birth_ym,
      직위: item.ofcps,
      등기임원: item.rgist_exctv_at,
      상근여부: item.fte_at,
      담당업무: item.chrg_job,
      최대주주관계: item.mxmm_shrholdr_relate,
      재직기간: item.hffc_pd,
      임기만료일: item.tenure_end_on,
    }));

    return formatToolResult(
      {
        종목: input.ticker,
        사업연도: year,
        보고서: input.report_type,
        임원현황: executives,
      },
      [url]
    );
  },
});

/**
 * 직원 현황 조회
 */
export const getEmployees = new DynamicStructuredTool({
  name: 'get_employees',
  description: `기업의 직원 현황을 조회합니다.
사용 시점: 직원수, 평균급여, 인력현황이 필요할 때
키워드: 직원, 직원수, 평균급여, 인력, 정규직, 인건비`,
  schema: PeriodicReportInputSchema,
  func: async (input) => {
    const corpCode = await getCorpCode(input.ticker);
    if (!corpCode) {
      return formatToolResult(
        { error: `종목을 찾을 수 없습니다: ${input.ticker}` },
        []
      );
    }

    const year = input.year || getBusinessYear(0);
    const reprtCode = getReportCode(input.report_type);

    const { data, url } = await callDartApi<{
      list: Array<{
        fo_bbm: string; // 사업부문
        sexdstn: string; // 성별
        reform_bfe_emp_co_rgllbr: string; // 정규직원수
        reform_bfe_emp_co_cnttk: string; // 계약직원수
        reform_bfe_emp_co_etc: string; // 기타직원수
        rgllbr_co: string; // 정규직
        rgllbr_abacpt_labrco: string; // 정규직기간제
        cnttk_co: string; // 계약직
        sm: string; // 합계
        avrg_cnwk_sdytrn: string; // 평균근속연수
        fyer_salary_totamt: string; // 연간급여총액
        jan_salary_am: string; // 1인평균급여
      }>;
    }>('/empSttus.json', {
      corp_code: corpCode,
      bsns_year: year,
      reprt_code: reprtCode,
    });

    const items = data.list || [];

    const employees = items.map((item) => ({
      사업부문: item.fo_bbm,
      성별: item.sexdstn,
      정규직: item.rgllbr_co,
      계약직: item.cnttk_co,
      합계: item.sm,
      평균근속연수: item.avrg_cnwk_sdytrn,
      연간급여총액: formatAmount(item.fyer_salary_totamt),
      '1인평균급여': formatAmount(item.jan_salary_am),
    }));

    return formatToolResult(
      {
        종목: input.ticker,
        사업연도: year,
        보고서: input.report_type,
        직원현황: employees,
      },
      [url]
    );
  },
});

/**
 * 사외이사 현황 조회
 */
export const getOutsideDirectors = new DynamicStructuredTool({
  name: 'get_outside_directors',
  description: `기업의 사외이사 및 위원회 현황을 조회합니다.
사용 시점: 사외이사, 감사위원회, 이사회 구성이 필요할 때
키워드: 사외이사, 감사위원회, 이사회, 독립이사, 위원회, 지배구조`,
  schema: PeriodicReportInputSchema,
  func: async (input) => {
    const corpCode = await getCorpCode(input.ticker);
    if (!corpCode) {
      return formatToolResult(
        { error: `종목을 찾을 수 없습니다: ${input.ticker}` },
        []
      );
    }

    const year = input.year || getBusinessYear(0);
    const reprtCode = getReportCode(input.report_type);

    const { data, url } = await callDartApi<{
      list: Array<{
        nm: string; // 성명
        main_career: string; // 주요경력
        chrg_job: string; // 담당업무
        apntmt_resn_cn: string; // 선임사유
        hffc_pd: string; // 재직기간
        tenure_end_on: string; // 임기만료일
      }>;
    }>('/oudtSttus.json', {
      corp_code: corpCode,
      bsns_year: year,
      reprt_code: reprtCode,
    });

    const items = data.list || [];

    const directors = items.map((item) => ({
      성명: item.nm,
      주요경력: item.main_career,
      담당업무: item.chrg_job,
      선임사유: item.apntmt_resn_cn,
      재직기간: item.hffc_pd,
      임기만료일: item.tenure_end_on,
    }));

    return formatToolResult(
      {
        종목: input.ticker,
        사업연도: year,
        보고서: input.report_type,
        사외이사현황: directors,
      },
      [url]
    );
  },
});

/**
 * 이사/감사 전체 보수 현황 조회
 */
export const getExecutiveCompensationTotal = new DynamicStructuredTool({
  name: 'get_executive_compensation_total',
  description: `기업의 이사/감사 전체 보수 현황을 조회합니다.
사용 시점: 임원 보수 총액, 보수한도가 필요할 때
키워드: 임원보수, 이사보수, 감사보수, 보수한도, 보수총액`,
  schema: PeriodicReportInputSchema,
  func: async (input) => {
    const corpCode = await getCorpCode(input.ticker);
    if (!corpCode) {
      return formatToolResult(
        { error: `종목을 찾을 수 없습니다: ${input.ticker}` },
        []
      );
    }

    const year = input.year || getBusinessYear(0);
    const reprtCode = getReportCode(input.report_type);

    const { data, url } = await callDartApi<{
      list: Array<{
        se: string; // 구분
        nmpr: string; // 인원수
        pymnt_totamt: string; // 보수총액
        jan_pymnt_totamt: string; // 1인당보수
        rm: string; // 비고
      }>;
    }>('/drctrAdtAllMendngSttus.json', {
      corp_code: corpCode,
      bsns_year: year,
      reprt_code: reprtCode,
    });

    const items = data.list || [];

    const compensation = items.map((item) => ({
      구분: item.se,
      인원수: item.nmpr,
      보수총액: formatAmount(item.pymnt_totamt),
      '1인당보수': formatAmount(item.jan_pymnt_totamt),
      비고: item.rm,
    }));

    return formatToolResult(
      {
        종목: input.ticker,
        사업연도: year,
        보고서: input.report_type,
        이사감사보수: compensation,
      },
      [url]
    );
  },
});

/**
 * 개인별 보수 현황 조회 (5억 이상)
 */
export const getExecutiveCompensationIndividual = new DynamicStructuredTool({
  name: 'get_executive_compensation_individual',
  description: `5억원 이상 보수를 받은 이사/감사 개인별 현황을 조회합니다.
사용 시점: 고액연봉 임원, 개인별 보수 내역이 필요할 때
키워드: 임원연봉, 개인별보수, 고액연봉, 5억이상, 스톡옵션`,
  schema: PeriodicReportInputSchema,
  func: async (input) => {
    const corpCode = await getCorpCode(input.ticker);
    if (!corpCode) {
      return formatToolResult(
        { error: `종목을 찾을 수 없습니다: ${input.ticker}` },
        []
      );
    }

    const year = input.year || getBusinessYear(0);
    const reprtCode = getReportCode(input.report_type);

    const { data, url } = await callDartApi<{
      list: Array<{
        nm: string; // 성명
        ofcps: string; // 직위
        pymnt_totamt: string; // 보수총액
        etc_pyat: string; // 기타보수
        stck_pymnt_totamt: string; // 주식보수
      }>;
    }>('/hmvAuditIndvdlBySttus.json', {
      corp_code: corpCode,
      bsns_year: year,
      reprt_code: reprtCode,
    });

    const items = data.list || [];

    const compensation = items.map((item) => ({
      성명: item.nm,
      직위: item.ofcps,
      보수총액: formatAmount(item.pymnt_totamt),
      기타보수: formatAmount(item.etc_pyat),
      주식보수: formatAmount(item.stck_pymnt_totamt),
    }));

    return formatToolResult(
      {
        종목: input.ticker,
        사업연도: year,
        보고서: input.report_type,
        '개인별보수(5억이상)': compensation,
      },
      [url]
    );
  },
});

// ============================================================
// 채무/감사 관련 (일부)
// ============================================================

/**
 * 회계감사인 의견 조회
 */
export const getAuditorOpinion = new DynamicStructuredTool({
  name: 'get_auditor_opinion',
  description: `기업의 회계감사인 감사의견을 조회합니다.
사용 시점: 감사의견, 회계법인, 감사결과가 필요할 때
키워드: 감사의견, 회계감사, 회계법인, 적정, 한정, 부적정`,
  schema: PeriodicReportInputSchema,
  func: async (input) => {
    const corpCode = await getCorpCode(input.ticker);
    if (!corpCode) {
      return formatToolResult(
        { error: `종목을 찾을 수 없습니다: ${input.ticker}` },
        []
      );
    }

    const year = input.year || getBusinessYear(0);
    const reprtCode = getReportCode(input.report_type);

    const { data, url } = await callDartApi<{
      list: Array<{
        bsns_year: string; // 사업연도
        adtor: string; // 감사인
        adt_reprt_opnn_at: string; // 감사의견
        adt_reprt_opnn_rsn: string; // 감사의견사유
        emphs_matter: string; // 강조사항
      }>;
    }>('/accnutAdtorNmAt.json', {
      corp_code: corpCode,
      bsns_year: year,
      reprt_code: reprtCode,
    });

    const items = data.list || [];

    const opinions = items.map((item) => ({
      사업연도: item.bsns_year,
      감사인: item.adtor,
      감사의견: item.adt_reprt_opnn_at,
      의견사유: item.adt_reprt_opnn_rsn,
      강조사항: item.emphs_matter,
    }));

    return formatToolResult(
      {
        종목: input.ticker,
        사업연도: year,
        보고서: input.report_type,
        회계감사의견: opinions,
      },
      [url]
    );
  },
});

// ============================================================
// 기타
// ============================================================

/**
 * 타법인 출자현황 조회
 */
export const getSubsidiaryInvestment = new DynamicStructuredTool({
  name: 'get_subsidiary_investment',
  description: `기업의 타법인 출자현황을 조회합니다.
사용 시점: 자회사, 관계회사, 지분투자 현황이 필요할 때
키워드: 자회사, 관계회사, 출자, 지분투자, 투자회사, 계열사`,
  schema: PeriodicReportInputSchema,
  func: async (input) => {
    const corpCode = await getCorpCode(input.ticker);
    if (!corpCode) {
      return formatToolResult(
        { error: `종목을 찾을 수 없습니다: ${input.ticker}` },
        []
      );
    }

    const year = input.year || getBusinessYear(0);
    const reprtCode = getReportCode(input.report_type);

    const { data, url } = await callDartApi<{
      list: Array<{
        inv_prm: string; // 출자법인
        frst_acqs_de: string; // 최초취득일
        invstmnt_purps: string; // 출자목적
        frst_acqs_amount: string; // 최초취득금액
        bsis_blce_qy: string; // 기초잔액수량
        bsis_blce_qota_rt: string; // 기초잔액지분율
        bsis_blce_acntbk_amount: string; // 기초장부가액
        incrs_dcrs_acqs_dsps_qy: string; // 증감수량
        incrs_dcrs_acqs_dsps_amount: string; // 증감금액
        incrs_dcrs_evl_lstmn: string; // 평가손익
        trmend_blce_qy: string; // 기말잔액수량
        trmend_blce_qota_rt: string; // 기말잔액지분율
        trmend_blce_acntbk_amount: string; // 기말장부가액
        recent_bsns_year_fnnr_sttus_tot_assets: string; // 최근총자산
        recent_bsns_year_fnnr_sttus_thstrm_ntpf: string; // 최근당기순이익
      }>;
    }>('/otrCprInvstmntSttus.json', {
      corp_code: corpCode,
      bsns_year: year,
      reprt_code: reprtCode,
    });

    const items = data.list || [];

    const investments = items.map((item) => ({
      출자법인: item.inv_prm,
      최초취득일: item.frst_acqs_de,
      출자목적: item.invstmnt_purps,
      기초지분율: `${item.bsis_blce_qota_rt}%`,
      기초장부가: formatAmount(item.bsis_blce_acntbk_amount),
      기말지분율: `${item.trmend_blce_qota_rt}%`,
      기말장부가: formatAmount(item.trmend_blce_acntbk_amount),
      최근총자산: formatAmount(item.recent_bsns_year_fnnr_sttus_tot_assets),
      최근순이익: formatAmount(item.recent_bsns_year_fnnr_sttus_thstrm_ntpf),
    }));

    return formatToolResult(
      {
        종목: input.ticker,
        사업연도: year,
        보고서: input.report_type,
        타법인출자현황: investments,
      },
      [url]
    );
  },
});
