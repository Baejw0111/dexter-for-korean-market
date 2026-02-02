/**
 * 재무 스크리닝 도구
 * DART 다중회사 주요계정 API를 활용한 조건 기반 상장사 필터링
 * @see https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS003&apiId=2019017
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { callDartApi, REPORT_CODE, getBusinessYear } from './api.js';
import { getAllListedCorpCodes } from './listing.js';
import { formatToolResult } from '../../types.js';

/**
 * 다중회사 주요계정 API 응답 항목
 */
interface MultiCompanyAccountItem {
  rcept_no: string;
  bsns_year: string;
  stock_code: string;
  reprt_code: string;
  account_nm: string;
  fs_div: string;
  fs_nm: string;
  sj_div: string;
  sj_nm: string;
  thstrm_nm: string;
  thstrm_dt: string;
  thstrm_amount: string;
  thstrm_add_amount: string;
  frmtrm_nm: string;
  frmtrm_dt: string;
  frmtrm_amount: string;
  frmtrm_add_amount: string;
  bfefrmtrm_nm: string;
  bfefrmtrm_dt: string;
  bfefrmtrm_amount: string;
  ord: string;
  currency: string;
}

/**
 * 기업별 재무 데이터 (연도별)
 */
interface CompanyFinancials {
  corpCode: string;
  stockCode: string;
  corpName: string;
  // 연도별 데이터 (key: 연도)
  revenue: Record<string, number>; // 매출액
  operatingProfit: Record<string, number>; // 영업이익
  totalAssets: Record<string, number>; // 자산총계
  totalLiabilities: Record<string, number>; // 부채총계
  totalEquity: Record<string, number>; // 자본총계
}

/**
 * 스크리닝 결과 항목
 */
interface ScreeningResult {
  종목코드: string;
  회사명: string;
  매출_CAGR: string;
  최근_영업이익률: string;
  영업이익률_개선: string;
  부채비율: string;
  매출액_최근: string;
  영업이익_최근: string;
}

/**
 * 금액 문자열을 숫자로 변환
 */
function parseAmount(amount: string | undefined): number {
  if (!amount) {
    return 0;
  }
  const num = Number(amount.replace(/,/g, ''));
  return isNaN(num) ? 0 : num;
}

/**
 * CAGR 계산 (연평균 성장률)
 */
function calculateCAGR(
  startValue: number,
  endValue: number,
  years: number
): number | null {
  if (startValue <= 0 || endValue <= 0 || years <= 0) {
    return null;
  }
  return (Math.pow(endValue / startValue, 1 / years) - 1) * 100;
}

/**
 * 금액을 억원 단위로 포맷팅
 */
function formatBillions(amount: number): string {
  if (amount === 0) {
    return '-';
  }
  const billions = amount / 100000000;
  if (Math.abs(billions) >= 1) {
    return `${billions.toFixed(0)}억원`;
  }
  return `${(amount / 10000).toFixed(0)}만원`;
}

/**
 * 다중회사 주요계정 조회 (100개 제한)
 */
async function fetchMultiCompanyAccounts(
  corpCodes: string[],
  year: string
): Promise<MultiCompanyAccountItem[]> {
  if (corpCodes.length === 0) {
    return [];
  }

  // 최대 100개까지만 조회 가능
  const limitedCodes = corpCodes.slice(0, 100);
  const corpCodeParam = limitedCodes.join(',');

  try {
    const { data } = await callDartApi<{ list: MultiCompanyAccountItem[] }>(
      '/fnlttMultiAcnt.json',
      {
        corp_code: corpCodeParam,
        bsns_year: year,
        reprt_code: REPORT_CODE.ANNUAL,
      }
    );

    return data.list || [];
  } catch (error) {
    // API 에러 시 빈 배열 반환 (일부 실패 허용)
    console.error(`Failed to fetch for year ${year}:`, error);
    return [];
  }
}

/**
 * 배열을 청크로 분할
 */
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * 재무 데이터 수집 및 정리
 */
async function collectFinancialData(
  companies: Array<{ corpCode: string; stockCode: string; corpName: string }>,
  years: string[]
): Promise<Map<string, CompanyFinancials>> {
  const financialMap = new Map<string, CompanyFinancials>();

  // 초기화
  for (const company of companies) {
    financialMap.set(company.stockCode, {
      corpCode: company.corpCode,
      stockCode: company.stockCode,
      corpName: company.corpName,
      revenue: {},
      operatingProfit: {},
      totalAssets: {},
      totalLiabilities: {},
      totalEquity: {},
    });
  }

  // 100개씩 배치로 조회
  const corpCodes = companies.map((c) => c.corpCode);
  const batches = chunkArray(corpCodes, 100);

  // 연도별로 조회
  for (const year of years) {
    // 배치 병렬 처리 (동시 3개로 제한 - rate limit 고려)
    const CONCURRENT_LIMIT = 3;

    for (let i = 0; i < batches.length; i += CONCURRENT_LIMIT) {
      const batchPromises = batches
        .slice(i, i + CONCURRENT_LIMIT)
        .map((batch) => fetchMultiCompanyAccounts(batch, year));

      const results = await Promise.all(batchPromises);

      for (const items of results) {
        for (const item of items) {
          const financial = financialMap.get(item.stock_code);
          if (!financial) {
            continue;
          }

          // 연결재무제표 우선 (CFS), 없으면 별도재무제표 (OFS)
          const isConsolidated = item.fs_div === 'CFS';
          const existingValue = getExistingValue(
            financial,
            item.account_nm,
            year
          );

          // 연결재무제표 데이터가 있으면 우선 사용
          if (existingValue !== undefined && !isConsolidated) {
            continue;
          }

          const amount = parseAmount(item.thstrm_amount);

          // 계정명에 따라 분류
          if (
            item.account_nm.includes('매출액') ||
            item.account_nm.includes('수익(매출액)')
          ) {
            financial.revenue[year] = amount;
          } else if (
            item.account_nm.includes('영업이익') &&
            !item.account_nm.includes('손실')
          ) {
            financial.operatingProfit[year] = amount;
          } else if (item.account_nm === '자산총계') {
            financial.totalAssets[year] = amount;
          } else if (item.account_nm === '부채총계') {
            financial.totalLiabilities[year] = amount;
          } else if (item.account_nm === '자본총계') {
            financial.totalEquity[year] = amount;
          }
        }
      }
    }
  }

  return financialMap;
}

/**
 * 기존 값 확인 (연결재무제표 우선을 위해)
 */
function getExistingValue(
  financial: CompanyFinancials,
  accountName: string,
  year: string
): number | undefined {
  if (accountName.includes('매출액')) {
    return financial.revenue[year];
  }
  if (accountName.includes('영업이익')) {
    return financial.operatingProfit[year];
  }
  if (accountName === '자산총계') {
    return financial.totalAssets[year];
  }
  if (accountName === '부채총계') {
    return financial.totalLiabilities[year];
  }
  if (accountName === '자본총계') {
    return financial.totalEquity[year];
  }
  return undefined;
}

const ScreenFinancialsInputSchema = z.object({
  min_revenue_cagr: z
    .number()
    .optional()
    .describe('최소 매출 CAGR (%, 예: 0은 플러스 성장)'),
  min_operating_margin: z.number().optional().describe('최소 영업이익률 (%)'),
  require_margin_improvement: z
    .boolean()
    .default(false)
    .describe('영업이익률 개선 필수 여부'),
  max_debt_ratio: z.number().optional().describe('최대 부채비율 (%)'),
  min_debt_ratio: z.number().optional().describe('최소 부채비율 (%)'),
  limit: z.number().default(20).describe('반환할 최대 기업 수'),
  sort_by: z
    .enum(['revenue_cagr', 'operating_margin', 'debt_ratio'])
    .default('revenue_cagr')
    .describe('정렬 기준'),
});

export const screenFinancials = new DynamicStructuredTool({
  name: 'screen_financials',
  description: `국내 상장사를 재무 조건으로 스크리닝합니다. 전체 상장사 중 조건에 맞는 기업을 필터링할 때 사용합니다.
지원 조건:
- 매출 CAGR (3년 연평균 성장률)
- 영업이익률 및 개선 여부
- 부채비율 범위
예: "매출 성장하고 영업이익률 개선되는 기업", "부채비율 100% 미만인 고성장 기업"`,
  schema: ScreenFinancialsInputSchema,
  func: async (input) => {
    // 1. 상장사 목록 가져오기
    const companies = await getAllListedCorpCodes();

    // 샘플링: 전체 조회 시 시간이 오래 걸리므로 상위 500개만 조회
    // TODO: 전체 조회 옵션 추가 고려
    const sampledCompanies = companies.slice(0, 500);

    // 2. 최근 3년 연도 계산
    const currentYear = parseInt(getBusinessYear(0), 10);
    const years = [
      String(currentYear - 2),
      String(currentYear - 1),
      String(currentYear),
    ];

    // 3. 재무 데이터 수집
    const financialMap = await collectFinancialData(sampledCompanies, years);

    // 4. 스크리닝 조건 적용
    const results: ScreeningResult[] = [];
    const [year0, year1, year2] = years; // 과거 → 현재

    for (const [, financial] of financialMap) {
      // 매출 CAGR 계산
      const revenue0 = financial.revenue[year0];
      const revenue2 = financial.revenue[year2];
      const revenueCAGR = calculateCAGR(revenue0, revenue2, 2);

      // 영업이익률 계산
      const opProfit1 = financial.operatingProfit[year1] || 0;
      const opProfit2 = financial.operatingProfit[year2] || 0;
      const rev1 = financial.revenue[year1] || 0;
      const rev2 = financial.revenue[year2] || 0;

      const opMargin1 = rev1 > 0 ? (opProfit1 / rev1) * 100 : null;
      const opMargin2 = rev2 > 0 ? (opProfit2 / rev2) * 100 : null;
      const marginImproved =
        opMargin1 !== null && opMargin2 !== null && opMargin2 > opMargin1;

      // 부채비율 계산
      const totalLiabilities = financial.totalLiabilities[year2] || 0;
      const totalEquity = financial.totalEquity[year2] || 0;
      const debtRatio =
        totalEquity > 0 ? (totalLiabilities / totalEquity) * 100 : null;

      // 조건 필터링
      if (
        input.min_revenue_cagr !== undefined &&
        (revenueCAGR === null || revenueCAGR < input.min_revenue_cagr)
      ) {
        continue;
      }
      if (
        input.min_operating_margin !== undefined &&
        (opMargin2 === null || opMargin2 < input.min_operating_margin)
      ) {
        continue;
      }
      if (input.require_margin_improvement && !marginImproved) {
        continue;
      }
      if (
        input.max_debt_ratio !== undefined &&
        (debtRatio === null || debtRatio > input.max_debt_ratio)
      ) {
        continue;
      }
      if (
        input.min_debt_ratio !== undefined &&
        (debtRatio === null || debtRatio < input.min_debt_ratio)
      ) {
        continue;
      }

      // 필수 데이터가 있는 경우만 포함
      if (revenueCAGR === null || opMargin2 === null) {
        continue;
      }

      results.push({
        종목코드: financial.stockCode,
        회사명: financial.corpName,
        매출_CAGR: `${revenueCAGR.toFixed(1)}%`,
        최근_영업이익률: `${opMargin2.toFixed(1)}%`,
        영업이익률_개선: marginImproved ? 'Y' : 'N',
        부채비율: debtRatio !== null ? `${debtRatio.toFixed(1)}%` : '-',
        매출액_최근: formatBillions(revenue2),
        영업이익_최근: formatBillions(opProfit2),
      });
    }

    // 5. 정렬
    results.sort((a, b) => {
      if (input.sort_by === 'revenue_cagr') {
        return parseFloat(b.매출_CAGR) - parseFloat(a.매출_CAGR);
      }
      if (input.sort_by === 'operating_margin') {
        return parseFloat(b.최근_영업이익률) - parseFloat(a.최근_영업이익률);
      }
      if (input.sort_by === 'debt_ratio') {
        const aRatio = a.부채비율 === '-' ? Infinity : parseFloat(a.부채비율);
        const bRatio = b.부채비율 === '-' ? Infinity : parseFloat(b.부채비율);
        return aRatio - bRatio; // 낮은 부채비율 우선
      }
      return 0;
    });

    // 6. limit 적용
    const limitedResults = results.slice(0, input.limit);

    return formatToolResult(
      {
        조회_기간: `${year0}~${year2}`,
        조건: {
          최소_매출_CAGR:
            input.min_revenue_cagr !== undefined
              ? `${input.min_revenue_cagr}%`
              : '없음',
          최소_영업이익률:
            input.min_operating_margin !== undefined
              ? `${input.min_operating_margin}%`
              : '없음',
          영업이익률_개선_필수: input.require_margin_improvement ? 'Y' : 'N',
          부채비율_범위: `${input.min_debt_ratio ?? '-'}% ~ ${
            input.max_debt_ratio ?? '-'
          }%`,
        },
        조회_대상_기업수: sampledCompanies.length,
        조건_충족_기업수: results.length,
        반환_기업수: limitedResults.length,
        정렬_기준: input.sort_by,
        스크리닝_결과: limitedResults,
      },
      ['https://opendart.fss.or.kr']
    );
  },
});
