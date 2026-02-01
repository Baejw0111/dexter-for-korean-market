/**
 * 네이버 검색 API 클라이언트
 * @see https://developers.naver.com/docs/serviceapi/search/news/news.md
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z, type ZodType } from 'zod';
import { formatToolResult } from '../types.js';

// Input schema 정의
const NaverNewsInputSchema = z.object({
  query: z.string().describe('검색어 (기업명, 종목명, 키워드 등)'),
  display: z.number().default(10).describe('결과 개수 (최대 100)'),
  sort: z.enum(['sim', 'date']).default('date').describe('정렬 방식 (sim: 유사도순, date: 최신순)'),
});

type NaverNewsInput = z.infer<typeof NaverNewsInputSchema>;

const BASE_URL = 'https://openapi.naver.com/v1/search';

interface NaverNewsItem {
  title: string;
  originallink: string;
  link: string;
  description: string;
  pubDate: string;
}

interface NaverNewsResponse {
  lastBuildDate: string;
  total: number;
  start: number;
  display: number;
  items: NaverNewsItem[];
}

/**
 * 네이버 뉴스 검색 API 호출
 */
async function searchNaverNews(
  query: string,
  display: number = 10,
  sort: 'sim' | 'date' = 'date'
): Promise<NaverNewsResponse> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('NAVER_CLIENT_ID and NAVER_CLIENT_SECRET must be set');
  }

  const url = new URL(`${BASE_URL}/news.json`);
  url.searchParams.append('query', query);
  url.searchParams.append('display', String(Math.min(display, 100)));
  url.searchParams.append('sort', sort);

  const response = await fetch(url.toString(), {
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
  });

  if (!response.ok) {
    throw new Error(`Naver API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * HTML 태그 제거
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/**
 * 뉴스 검색 결과 포맷팅
 */
function formatNewsResults(response: NaverNewsResponse): { parsed: string; urls: string[] } {
  const urls: string[] = [];
  const lines: string[] = [];

  lines.push(`총 ${response.total}건 중 ${response.items.length}건 표시\n`);

  for (const item of response.items) {
    const title = stripHtml(item.title);
    const description = stripHtml(item.description);
    const date = new Date(item.pubDate).toLocaleDateString('ko-KR');
    const url = item.originallink || item.link;

    lines.push(`[${date}] ${title}`);
    lines.push(`${description}`);
    lines.push(`URL: ${url}\n`);

    urls.push(url);
  }

  return {
    parsed: lines.join('\n'),
    urls,
  };
}

/**
 * 네이버 뉴스 검색 도구
 */
export const naverNewsSearch = new DynamicStructuredTool({
  name: 'news_search',
  description:
    '한국 뉴스를 검색합니다. 기업, 종목, 경제 관련 최신 뉴스를 찾을 때 사용합니다. 한국어 검색에 최적화되어 있습니다.',
  schema: NaverNewsInputSchema,
  func: async (input: NaverNewsInput) => {
    const response = await searchNaverNews(input.query, input.display, input.sort);
    const { parsed, urls } = formatNewsResults(response);
    return formatToolResult(parsed, urls);
  },
});

/**
 * 네이버 API 사용 가능 여부 확인
 */
export function isNaverApiAvailable(): boolean {
  return !!(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
}
