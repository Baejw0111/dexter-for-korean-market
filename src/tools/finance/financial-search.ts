import {
  DynamicStructuredTool,
  StructuredToolInterface,
} from '@langchain/core/tools';
import { AIMessage, ToolCall } from '@langchain/core/messages';
import { z } from 'zod';
import { callLlm } from '../../model/llm.js';
import { formatToolResult } from '../types.js';
import { getCurrentDate } from '../../agent/prompts.js';

// === 한국 시장 도구 Import ===

// KIS 주가 조회
import { getPriceSnapshot, getPrices } from './kis/prices.js';
// KIS 시장 정보
import { getTopGainers, getTopLosers, getVolumeRanking } from './kis/market.js';
// KIS 순위/랭킹
import {
  getMarketCapRanking,
  getTradingValueRanking,
  getNewHighLowRanking,
  getDisparityRanking,
  getVolumePowerRanking,
  getQuoteBalanceRanking,
  getOvertimeFluctRanking,
  getOvertimeVolumeRanking,
  getExpectedPriceRanking,
  getPerRanking,
  getPbrRanking,
} from './kis/ranking.js';
// KIS 시세/호가/체결
import {
  getPriceDetail,
  getAskingPrice,
  getConclusions,
  getTimeChart,
  getOvertimePrice,
  getOvertimeAskingPrice,
  getExpectedPrice,
  getMarketStatus,
  getViStatus,
  getMultiPrice,
  getDailyTradeVolume,
  getHolidays,
} from './kis/quotes.js';
// KIS 재무/기업정보
import {
  getKisBalanceSheet,
  getKisIncomeStatement,
  getFinancialRatio,
  getProfitRatio,
  getStabilityRatio,
  getGrowthRatio,
  getStockInfo,
  searchStocks,
} from './kis/fundamentals.js';
// KIS 투자자동향/수급
import {
  getInvestorDailyByMarket,
  getInvestorTimeByMarket,
  getForeignInstitutionTotal,
  getForeignTradingTrend,
  getMemberTrading,
  getMemberDaily,
  getInvestorEstimate,
} from './kis/investor.js';
// KIS 기업이벤트/KSD
import {
  getKsdDividend,
  getKsdBonusIssue,
  getKsdRightsIssue,
  getKsdCapitalDecrease,
  getKsdMergerSplit,
  getKsdShareholderMeeting,
  getKsdListingInfo,
  getDividendYieldRanking,
  getPeriodRights,
} from './kis/corporate-events.js';
// KIS 지수
import {
  getIndexPrice,
  getIndexDailyPrice,
  getIndexTimePrice,
  getSectorPriceList,
  getSectorDailyChart,
  getIndexProgramTrading,
  getMarketIndices,
} from './kis/index-prices.js';
// KIS 한국 특화
import {
  getInvestorTrends,
  getCreditBalance,
  getShortSelling,
  getProgramTrading,
} from './kis/korea-specific.js';

// DART 재무제표
import {
  getIncomeStatements,
  getBalanceSheets,
  getCashFlowStatements,
  getAllFinancialStatements,
  getDartFinancialRatios,
  getMultiCompanyFinancialRatios,
} from './dart/fundamentals.js';
// DART 공시
import { getDisclosures, getCompanyInfo } from './dart/disclosures.js';
// DART 내부자 거래
import { getInsiderTrades, getMajorShareholder } from './dart/insider.js';
// DART 상장사 목록
import { getListedCompanies } from './dart/listing.js';
// DART 재무 스크리닝
import { screenFinancials } from './dart/screening.js';
// DART 정기보고서 주요정보 (DS002)
import {
  getCapitalChange,
  getDividendInfo,
  getTreasuryStock,
  getLargestShareholder,
  getLargestShareholderChange,
  getMinorityShareholder,
  getTotalShares,
  getExecutives,
  getEmployees,
  getOutsideDirectors,
  getExecutiveCompensationTotal,
  getExecutiveCompensationIndividual,
  getAuditorOpinion,
  getSubsidiaryInvestment,
} from './dart/periodic-report.js';

// 한국 시장용 금융 도구 목록
const FINANCE_TOOLS: StructuredToolInterface[] = [
  // === 주가 (KIS) ===
  getPriceSnapshot,
  getPrices,
  // === 시장 정보 (KIS) ===
  getTopGainers,
  getTopLosers,
  getVolumeRanking,
  // === 순위/랭킹 (KIS) ===
  getMarketCapRanking,
  getTradingValueRanking,
  getNewHighLowRanking,
  getDisparityRanking,
  getVolumePowerRanking,
  getQuoteBalanceRanking,
  getOvertimeFluctRanking,
  getOvertimeVolumeRanking,
  getExpectedPriceRanking,
  getPerRanking,
  getPbrRanking,
  // === 시세/호가/체결 (KIS) ===
  getPriceDetail,
  getAskingPrice,
  getConclusions,
  getTimeChart,
  getOvertimePrice,
  getOvertimeAskingPrice,
  getExpectedPrice,
  getMarketStatus,
  getViStatus,
  getMultiPrice,
  getDailyTradeVolume,
  getHolidays,
  // === 재무/기업정보 (KIS) ===
  getKisBalanceSheet,
  getKisIncomeStatement,
  getFinancialRatio,
  getProfitRatio,
  getStabilityRatio,
  getGrowthRatio,
  getStockInfo,
  searchStocks,
  // === 투자자동향/수급 (KIS) ===
  getInvestorDailyByMarket,
  getInvestorTimeByMarket,
  getForeignInstitutionTotal,
  getForeignTradingTrend,
  getMemberTrading,
  getMemberDaily,
  getInvestorEstimate,
  // === 기업이벤트/KSD (KIS) ===
  getKsdDividend,
  getKsdBonusIssue,
  getKsdRightsIssue,
  getKsdCapitalDecrease,
  getKsdMergerSplit,
  getKsdShareholderMeeting,
  getKsdListingInfo,
  getDividendYieldRanking,
  getPeriodRights,
  // === 지수 (KIS) ===
  getIndexPrice,
  getIndexDailyPrice,
  getIndexTimePrice,
  getSectorPriceList,
  getSectorDailyChart,
  getIndexProgramTrading,
  getMarketIndices,
  // === 한국 특화 (KIS) ===
  getInvestorTrends,
  getCreditBalance,
  getShortSelling,
  getProgramTrading,
  // === 재무제표 (DART) ===
  getIncomeStatements,
  getBalanceSheets,
  getCashFlowStatements,
  getAllFinancialStatements,
  getDartFinancialRatios,
  getMultiCompanyFinancialRatios,
  // === 공시 (DART) ===
  getDisclosures,
  getCompanyInfo,
  // === 내부자 거래 (DART) ===
  getInsiderTrades,
  getMajorShareholder,
  // === 상장사 목록 및 스크리닝 (DART) ===
  getListedCompanies,
  screenFinancials,
  // === 정기보고서 주요정보 (DART DS002) ===
  getCapitalChange,
  getDividendInfo,
  getTreasuryStock,
  getLargestShareholder,
  getLargestShareholderChange,
  getMinorityShareholder,
  getTotalShares,
  getExecutives,
  getEmployees,
  getOutsideDirectors,
  getExecutiveCompensationTotal,
  getExecutiveCompensationIndividual,
  getAuditorOpinion,
  getSubsidiaryInvestment,
];

// Create a map for quick tool lookup by name
const FINANCE_TOOL_MAP = new Map(FINANCE_TOOLS.map((t) => [t.name, t]));

/**
 * 동적으로 도구 목록을 생성하여 라우터 프롬프트 빌드
 * 도구의 description에서 자동으로 가이드 생성
 */
function buildRouterPrompt(): string {
  // 도구 목록을 카테고리별로 그룹화
  const toolDescriptions = FINANCE_TOOLS.map(
    (tool) => `- ${tool.name}: ${tool.description}`
  ).join('\n');

  return `당신은 한국 주식 시장 금융 데이터 라우팅 어시스턴트입니다.
현재 날짜: ${getCurrentDate()}

사용자의 자연어 쿼리를 분석하여 적절한 금융 도구를 호출하세요.

## 종목코드 변환

한국 주식은 6자리 숫자 종목코드를 사용합니다:
- 삼성전자 → 005930
- SK하이닉스 → 000660
- 현대차 → 005380
- 기아 → 000270
- NAVER → 035420
- 카카오 → 035720
- LG화학 → 051910
- 삼성SDI → 006400
- 현대모비스 → 012330
- 셀트리온 → 068270
- 포스코홀딩스 → 005490
- KB금융 → 105560
- 신한지주 → 055550
- 삼성바이오로직스 → 207940
- LG에너지솔루션 → 373220

## 날짜 변환

상대 날짜를 YYYYMMDD 형식으로 변환:
- "최근 1개월" → start_date 30일 전
- "최근 분기" → start_date 3개월 전
- "올해" → start_date 1월 1일
- "작년" → 전년도

## 사용 가능한 도구

${toolDescriptions}

적절한 도구를 호출하세요. 질문에 가장 적합한 도구를 선택하고, 필요한 파라미터를 추론하세요.`;
}

// Input schema for the financial_search tool
const FinancialSearchInputSchema = z.object({
  query: z.string().describe('금융 데이터에 대한 자연어 질의'),
});

/**
 * 한국 주식 시장용 financial_search 도구 생성
 * LLM 도구 호출을 사용하여 적절한 금융 도구로 라우팅
 */
export function createFinancialSearch(model: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'financial_search',
    description: `한국 주식 시장 금융 데이터를 위한 지능형 검색 도구입니다. 자연어 질의를 받아 적절한 금융 데이터 도구로 자동 라우팅합니다. 용도:
- 주가 (현재가, 과거 시세)
- 재무제표 (손익계산서, 재무상태표, 현금흐름표)
- 공시 (사업보고서, 분기보고서, 주요사항보고)
- 내부자 거래 (임원/주요주주 지분 변동)
- 시장 순위 (상승률, 하락률, 거래량)
- 한국 특화 (외국인/기관 매매동향, 공매도, 신용잔고)`,
    schema: FinancialSearchInputSchema,
    func: async (input) => {
      // 1. Call LLM with finance tools bound (native tool calling)
      const response = (await callLlm(input.query, {
        model,
        systemPrompt: buildRouterPrompt(),
        tools: FINANCE_TOOLS,
      })) as AIMessage;

      // 2. Check for tool calls
      const toolCalls = response.tool_calls as ToolCall[];
      if (!toolCalls || toolCalls.length === 0) {
        return formatToolResult({ error: 'No tools selected for query' }, []);
      }

      // 3. Execute tool calls in parallel
      const results = await Promise.all(
        toolCalls.map(async (tc) => {
          try {
            const tool = FINANCE_TOOL_MAP.get(tc.name);
            if (!tool) {
              throw new Error(`Tool '${tc.name}' not found`);
            }
            const rawResult = await tool.invoke(tc.args);
            const result =
              typeof rawResult === 'string'
                ? rawResult
                : JSON.stringify(rawResult);
            const parsed = JSON.parse(result);
            return {
              tool: tc.name,
              args: tc.args,
              data: parsed.data,
              sourceUrls: parsed.sourceUrls || [],
              error: null,
            };
          } catch (error) {
            return {
              tool: tc.name,
              args: tc.args,
              data: null,
              sourceUrls: [],
              error: error instanceof Error ? error.message : String(error),
            };
          }
        })
      );

      // 4. Combine results
      const successfulResults = results.filter((r) => r.error === null);
      const failedResults = results.filter((r) => r.error !== null);

      // Collect all source URLs
      const allUrls = results.flatMap((r) => r.sourceUrls);

      // Build combined data structure
      const combinedData: Record<string, unknown> = {};

      for (const result of successfulResults) {
        // Use tool name as key, or tool_ticker for multiple calls to same tool
        const ticker = (result.args as Record<string, unknown>).ticker as
          | string
          | undefined;
        const key = ticker ? `${result.tool}_${ticker}` : result.tool;
        combinedData[key] = result.data;
      }

      // Add errors if any
      if (failedResults.length > 0) {
        combinedData._errors = failedResults.map((r) => ({
          tool: r.tool,
          args: r.args,
          error: r.error,
        }));
      }

      return formatToolResult(combinedData, allUrls);
    },
  });
}
