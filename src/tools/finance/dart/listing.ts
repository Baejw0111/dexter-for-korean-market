/**
 * 상장사 목록 조회 도구
 * corp-code.ts의 캐시를 활용하여 전체 상장사 목록 반환
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../../types.js';

// corp-code.ts에서 캐시 관련 함수 import
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_FILE = path.join(__dirname, 'corp-code-cache.json');

interface CorpCodeEntry {
  corpCode: string;
  corpName: string;
  stockCode: string | null;
  modifyDate: string;
}

interface CorpCodeCache {
  updatedAt: number;
  byStockCode: Record<string, CorpCodeEntry>;
  byCorpName: Record<string, CorpCodeEntry>;
  byCorpCode: Record<string, CorpCodeEntry>;
}

/**
 * 캐시에서 상장사 목록 가져오기
 */
async function getListedCompaniesFromCache(): Promise<CorpCodeEntry[]> {
  // 캐시 파일이 없으면 corp-code.ts의 getCache 호출하여 생성
  if (!fs.existsSync(CACHE_FILE)) {
    // 동적 import로 순환 참조 방지
    const { getCacheStats } = await import('./corp-code.js');
    await getCacheStats(); // 캐시 초기화
  }

  const content = fs.readFileSync(CACHE_FILE, 'utf-8');
  const cache: CorpCodeCache = JSON.parse(content);

  // stockCode가 있는 항목만 반환 (상장사)
  return Object.values(cache.byStockCode);
}

/**
 * 종목코드로 시장 구분 (코스피/코스닥)
 * - 코스피: 000xxx ~ 099xxx (일부 예외 있음)
 * - 코스닥: 그 외
 * 참고: 완벽한 구분은 아니지만 대략적인 분류 가능
 */
function inferMarket(stockCode: string): 'kospi' | 'kosdaq' {
  const prefix = parseInt(stockCode.substring(0, 2), 10);
  // 일반적으로 코스피는 0으로 시작하는 6자리
  // 코스닥은 1~3으로 시작하는 경우가 많음
  if (prefix < 10) {
    return 'kospi';
  }
  return 'kosdaq';
}

const ListedCompaniesInputSchema = z.object({
  market: z
    .enum(['all', 'kospi', 'kosdaq'])
    .default('all')
    .describe('시장 구분 (all: 전체, kospi: 코스피, kosdaq: 코스닥)'),
  limit: z.number().optional().describe('반환할 최대 기업 수 (생략시 전체)'),
});

export const getListedCompanies = new DynamicStructuredTool({
  name: 'get_listed_companies',
  description:
    '국내 상장사(코스피/코스닥) 목록을 조회합니다. 전체 상장사 리스트나 시장별 기업 목록이 필요할 때 사용합니다.',
  schema: ListedCompaniesInputSchema,
  func: async (input) => {
    const companies = await getListedCompaniesFromCache();

    // 시장 필터링
    let filtered = companies;
    if (input.market !== 'all') {
      filtered = companies.filter((c) => {
        if (!c.stockCode) {
          return false;
        }
        return inferMarket(c.stockCode) === input.market;
      });
    }

    // 정렬 (종목코드 기준)
    filtered.sort((a, b) =>
      (a.stockCode || '').localeCompare(b.stockCode || '')
    );

    // limit 적용
    if (input.limit && input.limit > 0) {
      filtered = filtered.slice(0, input.limit);
    }

    const result = filtered.map((c) => ({
      종목코드: c.stockCode,
      회사명: c.corpName,
      시장: c.stockCode ? inferMarket(c.stockCode) : 'unknown',
    }));

    return formatToolResult(
      {
        시장: input.market,
        총_상장사_수: companies.length,
        조회_결과_수: result.length,
        상장사_목록: result,
      },
      ['https://opendart.fss.or.kr']
    );
  },
});

/**
 * 상장사 corpCode 목록 반환 (내부 사용)
 */
export async function getAllListedCorpCodes(): Promise<
  Array<{ corpCode: string; stockCode: string; corpName: string }>
> {
  const companies = await getListedCompaniesFromCache();
  return companies
    .filter((c) => c.stockCode && c.corpCode)
    .map((c) => ({
      corpCode: c.corpCode,
      stockCode: c.stockCode!,
      corpName: c.corpName,
    }));
}
