/**
 * DART 재무제표 조회 도구
 * @see https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS003&apiId=2019016
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { callDartApi, REPORT_CODE, FS_DIV, getBusinessYear } from './api.js';
import { getCorpCode } from './corp-code.js';
import { formatToolResult } from '../../types.js';

/**
 * 단일회사 주요계정 응답 항목
 */
interface FinancialAccountItem {
  /** 접수번호 */
  rcept_no: string;
  /** 사업연도 */
  bsns_year: string;
  /** 종목코드 */
  stock_code: string;
  /** 보고서코드 */
  reprt_code: string;
  /** 계정명 */
  account_nm: string;
  /** 재무제표구분 */
  fs_div: string;
  /** 재무제표명 */
  fs_nm: string;
  /** 결산기준일 */
  sj_div: string;
  /** 재무제표명 */
  sj_nm: string;
  /** 당기명 */
  thstrm_nm: string;
  /** 당기금액 */
  thstrm_amount: string;
  /** 당기누적금액 */
  thstrm_add_amount: string;
  /** 전기명 */
  frmtrm_nm: string;
  /** 전기금액 */
  frmtrm_amount: string;
  /** 전기누적금액 */
  frmtrm_add_amount: string;
  /** 전전기명 */
  bfefrmtrm_nm: string;
  /** 전전기금액 */
  bfefrmtrm_amount: string;
  /** 통화 */
  currency: string;
}

/**
 * 전체 재무제표 응답 항목
 */
interface FullFinancialItem {
  /** 접수번호 */
  rcept_no: string;
  /** 보고서코드 */
  reprt_code: string;
  /** 사업연도 */
  bsns_year: string;
  /** 회사코드 */
  corp_code: string;
  /** 재무제표구분 */
  sj_div: string;
  /** 재무제표명 */
  sj_nm: string;
  /** 계정ID */
  account_id: string;
  /** 계정명 */
  account_nm: string;
  /** 계정상세 */
  account_detail: string;
  /** 당기명 */
  thstrm_nm: string;
  /** 당기금액 */
  thstrm_amount: string;
  /** 당기누적금액 */
  thstrm_add_amount: string;
  /** 전기명 */
  frmtrm_nm: string;
  /** 전기금액 */
  frmtrm_amount: string;
  /** 전전기명 */
  bfefrmtrm_nm: string;
  /** 전전기금액 */
  bfefrmtrm_amount: string;
  /** 계정과목 정렬순서 */
  ord: string;
  /** 통화 */
  currency: string;
}

const FinancialStatementsInputSchema = z.object({
  ticker: z
    .string()
    .describe('종목코드 (6자리) 또는 회사명. 예: "005930" 또는 "삼성전자"'),
  year: z.string().optional().describe('사업연도 (YYYY). 생략시 최근 연도'),
  report_type: z
    .enum(['annual', 'q1', 'q2', 'q3'])
    .default('annual')
    .describe(
      '보고서 유형 (annual: 사업보고서, q1: 1분기, q2: 반기, q3: 3분기)'
    ),
  fs_type: z
    .enum(['consolidated', 'separate'])
    .default('consolidated')
    .describe('재무제표 유형 (consolidated: 연결, separate: 별도)'),
});

/**
 * 보고서 유형을 DART 보고서 코드로 변환
 */
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

/**
 * 금액 포맷팅 (억원 단위)
 */
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

/**
 * 재무제표 타입별 필터링
 */
function filterByStatementType(
  items: FinancialAccountItem[],
  statementType: string
): FinancialAccountItem[] {
  return items.filter((item) => item.sj_div === statementType);
}

export const getIncomeStatements = new DynamicStructuredTool({
  name: 'get_income_statements',
  description:
    '기업의 손익계산서를 조회합니다. 매출액, 영업이익, 당기순이익 등 수익성 지표를 확인할 수 있습니다.',
  schema: FinancialStatementsInputSchema,
  func: async (input) => {
    const corpCode = await getCorpCode(input.ticker);
    if (!corpCode) {
      return formatToolResult(
        { error: `종목코드 또는 회사명을 찾을 수 없습니다: ${input.ticker}` },
        []
      );
    }

    const year = input.year || getBusinessYear(0);
    const reprtCode = getReportCode(input.report_type);
    const fsDiv =
      input.fs_type === 'consolidated' ? FS_DIV.CONSOLIDATED : FS_DIV.SEPARATE;

    const { data, url } = await callDartApi<{ list: FinancialAccountItem[] }>(
      '/fnlttSinglAcnt.json',
      {
        corp_code: corpCode,
        bsns_year: year,
        reprt_code: reprtCode,
        fs_div: fsDiv,
      }
    );

    // 손익계산서 항목만 필터링 (IS)
    const incomeItems = filterByStatementType(data.list || [], 'IS');

    const formattedData = incomeItems.map((item) => ({
      계정명: item.account_nm,
      당기: formatAmount(item.thstrm_amount),
      전기: formatAmount(item.frmtrm_amount),
      전전기: formatAmount(item.bfefrmtrm_amount),
    }));

    return formatToolResult(
      {
        종목: input.ticker,
        사업연도: year,
        보고서: input.report_type,
        재무제표: input.fs_type,
        손익계산서: formattedData,
      },
      [url]
    );
  },
});

export const getBalanceSheets = new DynamicStructuredTool({
  name: 'get_balance_sheets',
  description:
    '기업의 재무상태표(대차대조표)를 조회합니다. 자산, 부채, 자본 현황을 확인할 수 있습니다.',
  schema: FinancialStatementsInputSchema,
  func: async (input) => {
    const corpCode = await getCorpCode(input.ticker);
    if (!corpCode) {
      return formatToolResult(
        { error: `종목코드 또는 회사명을 찾을 수 없습니다: ${input.ticker}` },
        []
      );
    }

    const year = input.year || getBusinessYear(0);
    const reprtCode = getReportCode(input.report_type);
    const fsDiv =
      input.fs_type === 'consolidated' ? FS_DIV.CONSOLIDATED : FS_DIV.SEPARATE;

    const { data, url } = await callDartApi<{ list: FinancialAccountItem[] }>(
      '/fnlttSinglAcnt.json',
      {
        corp_code: corpCode,
        bsns_year: year,
        reprt_code: reprtCode,
        fs_div: fsDiv,
      }
    );

    // 재무상태표 항목만 필터링 (BS)
    const balanceItems = filterByStatementType(data.list || [], 'BS');

    const formattedData = balanceItems.map((item) => ({
      계정명: item.account_nm,
      당기: formatAmount(item.thstrm_amount),
      전기: formatAmount(item.frmtrm_amount),
      전전기: formatAmount(item.bfefrmtrm_amount),
    }));

    return formatToolResult(
      {
        종목: input.ticker,
        사업연도: year,
        보고서: input.report_type,
        재무제표: input.fs_type,
        재무상태표: formattedData,
      },
      [url]
    );
  },
});

export const getCashFlowStatements = new DynamicStructuredTool({
  name: 'get_cash_flow_statements',
  description:
    '기업의 현금흐름표를 조회합니다. 영업/투자/재무 활동의 현금흐름을 확인할 수 있습니다.',
  schema: FinancialStatementsInputSchema,
  func: async (input) => {
    const corpCode = await getCorpCode(input.ticker);
    if (!corpCode) {
      return formatToolResult(
        { error: `종목코드 또는 회사명을 찾을 수 없습니다: ${input.ticker}` },
        []
      );
    }

    const year = input.year || getBusinessYear(0);
    const reprtCode = getReportCode(input.report_type);
    const fsDiv =
      input.fs_type === 'consolidated' ? FS_DIV.CONSOLIDATED : FS_DIV.SEPARATE;

    const { data, url } = await callDartApi<{ list: FinancialAccountItem[] }>(
      '/fnlttSinglAcnt.json',
      {
        corp_code: corpCode,
        bsns_year: year,
        reprt_code: reprtCode,
        fs_div: fsDiv,
      }
    );

    // 현금흐름표 항목만 필터링 (CF)
    const cashFlowItems = filterByStatementType(data.list || [], 'CF');

    const formattedData = cashFlowItems.map((item) => ({
      계정명: item.account_nm,
      당기: formatAmount(item.thstrm_amount),
      전기: formatAmount(item.frmtrm_amount),
      전전기: formatAmount(item.bfefrmtrm_amount),
    }));

    return formatToolResult(
      {
        종목: input.ticker,
        사업연도: year,
        보고서: input.report_type,
        재무제표: input.fs_type,
        현금흐름표: formattedData,
      },
      [url]
    );
  },
});

export const getAllFinancialStatements = new DynamicStructuredTool({
  name: 'get_all_financial_statements',
  description:
    '기업의 전체 재무제표(손익계산서, 재무상태표, 현금흐름표)를 한 번에 조회합니다. 종합적인 재무분석에 유용합니다.',
  schema: FinancialStatementsInputSchema,
  func: async (input) => {
    const corpCode = await getCorpCode(input.ticker);
    if (!corpCode) {
      return formatToolResult(
        { error: `종목코드 또는 회사명을 찾을 수 없습니다: ${input.ticker}` },
        []
      );
    }

    const year = input.year || getBusinessYear(0);
    const reprtCode = getReportCode(input.report_type);
    const fsDiv =
      input.fs_type === 'consolidated' ? FS_DIV.CONSOLIDATED : FS_DIV.SEPARATE;

    const { data, url } = await callDartApi<{ list: FullFinancialItem[] }>(
      '/fnlttSinglAcntAll.json',
      {
        corp_code: corpCode,
        bsns_year: year,
        reprt_code: reprtCode,
        fs_div: fsDiv,
      }
    );

    const items = data.list || [];

    // 재무제표 유형별로 그룹화
    const grouped: Record<string, FullFinancialItem[]> = {};
    for (const item of items) {
      const key = item.sj_nm || item.sj_div;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(item);
    }

    // 포맷팅
    const result: Record<
      string,
      Array<{ 계정명: string; 당기: string; 전기: string }>
    > = {};
    for (const [key, groupItems] of Object.entries(grouped)) {
      result[key] = groupItems.map((item) => ({
        계정명: item.account_nm,
        당기: formatAmount(item.thstrm_amount),
        전기: formatAmount(item.frmtrm_amount),
      }));
    }

    return formatToolResult(
      {
        종목: input.ticker,
        사업연도: year,
        보고서: input.report_type,
        재무제표: input.fs_type,
        ...result,
      },
      [url]
    );
  },
});

// ============================================================
// DS003 재무지표 API (추가)
// ============================================================

/**
 * 주요재무지표 응답 항목
 */
interface FinancialRatioItem {
  rcept_no: string;
  bsns_year: string;
  corp_code: string;
  sj_div: string;
  sj_nm: string;
  account_id: string;
  account_nm: string;
  account_detail: string;
  thstrm_nm: string;
  thstrm_dt: string;
  frmtrm_nm: string;
  frmtrm_dt: string;
  bfefrmtrm_nm: string;
  bfefrmtrm_dt: string;
}

const FinancialRatioInputSchema = z.object({
  ticker: z.string().describe('종목코드 (6자리) 또는 회사명'),
  year: z.string().optional().describe('사업연도 (YYYY). 생략시 최근 연도'),
  report_type: z
    .enum(['annual', 'q1', 'q2', 'q3'])
    .default('annual')
    .describe('보고서 유형'),
});

/**
 * DART 주요재무지표 조회
 */
export const getDartFinancialRatios = new DynamicStructuredTool({
  name: 'get_dart_financial_ratios',
  description: `DART 기준 주요재무지표를 조회합니다. ROE, ROA, 부채비율, 유동비율 등 핵심 지표.
사용 시점: DART 공식 재무지표, 투자지표 분석이 필요할 때
키워드: 재무지표, ROE, ROA, 부채비율, 유동비율, EPS, BPS, 영업이익률`,
  schema: FinancialRatioInputSchema,
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

    const { data, url } = await callDartApi<{ list: FinancialRatioItem[] }>(
      '/fnlttSinglIndx.json',
      {
        corp_code: corpCode,
        bsns_year: year,
        reprt_code: reprtCode,
        idx_cl_code: '0', // 전체
      }
    );

    const items = data.list || [];

    const ratios = items.map((item) => ({
      지표명: item.account_nm,
      지표상세: item.account_detail,
      당기: item.thstrm_dt,
      전기: item.frmtrm_dt,
      전전기: item.bfefrmtrm_dt,
    }));

    return formatToolResult(
      {
        종목: input.ticker,
        사업연도: year,
        보고서: input.report_type,
        주요재무지표: ratios,
      },
      [url]
    );
  },
});

const MultiCompanyRatioInputSchema = z.object({
  tickers: z.array(z.string()).describe('종목코드 배열 (최대 100개)'),
  year: z.string().optional().describe('사업연도 (YYYY)'),
  report_type: z
    .enum(['annual', 'q1', 'q2', 'q3'])
    .default('annual')
    .describe('보고서 유형'),
});

/**
 * 다중회사 주요재무지표 조회
 */
export const getMultiCompanyFinancialRatios = new DynamicStructuredTool({
  name: 'get_multi_company_financial_ratios',
  description: `여러 회사의 주요재무지표를 한 번에 조회합니다 (최대 100개).
사용 시점: 여러 기업 재무지표 비교, 동종업계 비교 분석이 필요할 때
키워드: 다중회사, 비교분석, 동종업계비교, 재무비교, 멀티컴퍼니`,
  schema: MultiCompanyRatioInputSchema,
  func: async (input) => {
    const tickers = input.tickers.slice(0, 100);
    const year = input.year || getBusinessYear(0);
    const reprtCode = getReportCode(input.report_type);

    // 종목코드 → 고유번호 변환
    const corpCodes: string[] = [];
    for (const ticker of tickers) {
      const code = await getCorpCode(ticker);
      if (code) {
        corpCodes.push(code);
      }
    }

    if (corpCodes.length === 0) {
      return formatToolResult({ error: '유효한 종목이 없습니다' }, []);
    }

    const { data, url } = await callDartApi<{ list: FinancialRatioItem[] }>(
      '/fnlttMultiIndx.json',
      {
        corp_code: corpCodes.join(','),
        bsns_year: year,
        reprt_code: reprtCode,
        idx_cl_code: '0',
      }
    );

    const items = data.list || [];

    // 회사별로 그룹화
    const grouped: Record<string, FinancialRatioItem[]> = {};
    for (const item of items) {
      if (!grouped[item.corp_code]) {
        grouped[item.corp_code] = [];
      }
      grouped[item.corp_code].push(item);
    }

    const result = Object.entries(grouped).map(([code, ratioItems]) => ({
      고유번호: code,
      지표: ratioItems.map((item) => ({
        지표명: item.account_nm,
        당기: item.thstrm_dt,
        전기: item.frmtrm_dt,
      })),
    }));

    return formatToolResult(
      {
        조회종목수: corpCodes.length,
        사업연도: year,
        보고서: input.report_type,
        회사별재무지표: result,
      },
      [url]
    );
  },
});
