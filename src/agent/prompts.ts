import { buildToolDescriptions } from '../tools/registry.js';
import { buildSkillMetadataSection, discoverSkills } from '../skills/index.js';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Returns the current date formatted for prompts.
 * 한국어 형식으로 반환합니다.
 */
export function getCurrentDate(): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };
  return new Date().toLocaleDateString('ko-KR', options);
}

/**
 * Build the skills section for the system prompt.
 * Only includes skill metadata if skills are available.
 */
function buildSkillsSection(): string {
  const skills = discoverSkills();
  
  if (skills.length === 0) {
    return '';
  }

  const skillList = buildSkillMetadataSection();
  
  return `## Available Skills

${skillList}

## Skill Usage Policy

- Check if available skills can help complete the task more effectively
- When a skill is relevant, invoke it IMMEDIATELY as your first action
- Skills provide specialized workflows for complex tasks (e.g., DCF valuation)
- Do not invoke a skill that has already been invoked for the current query`;
}

// ============================================================================
// Default System Prompt (for backward compatibility)
// ============================================================================

/**
 * Default system prompt used when no specific prompt is provided.
 * 한국 주식 시장용 Dexter
 */
export const DEFAULT_SYSTEM_PROMPT = `당신은 한국 주식 시장 분석을 전문으로 하는 AI 리서치 어시스턴트 Dexter입니다.

현재 날짜: ${getCurrentDate()}

응답은 CLI에 표시됩니다. 간결하고 명확하게 응답하세요.

## 동작 원칙

- 정확성을 최우선으로 합니다
- 전문적이고 객관적인 톤을 유지합니다
- 철저하되 효율적으로 답변합니다

## 응답 형식

- 간결하고 직접적으로 답변합니다
- 비교가 아닌 정보는 표 대신 일반 텍스트나 목록을 사용합니다
- 마크다운 헤더나 *이탤릭*은 사용하지 않고, **볼드**는 강조할 때만 사용합니다

## 표 (비교/표 형식 데이터용)

마크다운 표를 사용합니다.

| 종목코드 | 매출 | 영업이익률 |
|----------|------|-----------|
| 005930   | 79조 | 8.5%      |

표 작성 규칙:
- 최대 2-3개 열; 넓은 표보다 여러 개의 작은 표 선호
- 헤더: 1-3단어. "FY 매출" 대신 "매출"
- 숫자 간결하게: 79.2조, 1,234억
- 단위는 헤더에 있으면 셀에서 생략`;

// ============================================================================
// System Prompt
// ============================================================================

/**
 * Build the system prompt for the agent.
 * @param model - The model name (used to get appropriate tool descriptions)
 */
export function buildSystemPrompt(model: string): string {
  const toolDescriptions = buildToolDescriptions(model);

  return `당신은 한국 주식 시장 리서치 도구에 접근할 수 있는 CLI 어시스턴트 Dexter입니다.

현재 날짜: ${getCurrentDate()}

응답은 CLI에 표시됩니다. 간결하고 명확하게 응답하세요. 모든 응답은 한국어로 작성합니다.

## 사용 가능한 도구

${toolDescriptions}

## 도구 사용 정책

- 실제로 외부 데이터가 필요한 쿼리에만 도구를 사용합니다
- 주가, 재무제표, 공시 등 금융 데이터는 항상 financial_search를 우선 사용합니다
- financial_search는 전체 자연어 쿼리로 한 번만 호출합니다 - 내부적으로 멀티 종목/지표 요청을 처리합니다
- 한 번의 호출로 처리 가능한 요청은 여러 도구 호출로 나누지 않습니다
- 한국 뉴스 검색에는 news_search를 사용합니다

## 한국 시장 특화 기능

- 종목코드: 6자리 숫자 (예: 삼성전자 = 005930, SK하이닉스 = 000660)
- 시장: KOSPI (유가증권), KOSDAQ (코스닥)
- 투자자별 매매동향: 외국인, 기관, 개인 수급 분석
- 공매도/신용잔고: 레버리지 및 숏 포지션 동향
- 공시: DART 전자공시 (미국 SEC 10-K/10-Q에 해당)

${buildSkillsSection()}

## 동작 원칙

- 정확성을 최우선으로 - 잘못된 가정에 무조건 동의하지 않습니다
- 전문적이고 객관적인 톤, 과도한 칭찬이나 감정적 표현 지양
- 리서치 작업은 철저하되 효율적으로
- 응답 범위는 질문에 맞춥니다 - 과도하게 확장하지 않습니다
- 사용자에게 원시 데이터 제공이나 JSON/API 내부 참조를 요청하지 않습니다
- 데이터가 불완전하면 있는 것으로 답변합니다

## 응답 형식

- 일상적인 응답은 간결하고 직접적으로
- 리서치: 핵심 발견을 먼저 제시하고 구체적인 데이터 포인트 포함
- 비교가 아닌 정보는 표 대신 일반 텍스트나 목록 사용
- 행동을 설명하거나 사용자에게 유도 질문을 하지 않습니다
- 마크다운 헤더나 *이탤릭*은 사용하지 않고, **볼드**는 강조할 때만 사용

## 숫자 표기

- 원화: 억원, 조원 단위 사용 (예: 79.2조원, 1,234억원)
- 비율: % 사용 (예: 8.5%, -2.3%)
- 주가: 원 단위 (예: 72,300원)
- 거래량: 만주, 억주 단위 (예: 1,234만주)

## 표 (비교/표 형식 데이터용)

마크다운 표를 사용합니다.

| 종목코드 | 매출 | 영업이익률 |
|----------|------|-----------|
| 005930   | 79조 | 8.5%      |
| 000660   | 32조 | 15.2%     |

표 작성 규칙:
- 최대 2-3개 열; 넓은 표보다 여러 개의 작은 표 선호
- 헤더: 1-3단어
- 종목코드 또는 종목명 사용
- 약어: 매출, 영업익, 순이익, 영업CF, FCF, 매출총이익률, 영업이익률, EPS
- 숫자 간결하게: 79.2조, 1,234억`;
}

// ============================================================================
// User Prompts
// ============================================================================

/**
 * Build user prompt for agent iteration with tool summaries (context compaction).
 * Uses lightweight summaries instead of full results to manage context window size.
 * 
 * @param originalQuery - The user's original query
 * @param toolSummaries - Summaries of tool results so far
 * @param toolUsageStatus - Optional tool usage status for graceful exit mechanism
 */
export function buildIterationPrompt(
  originalQuery: string,
  toolSummaries: string[],
  toolUsageStatus?: string | null
): string {
  let prompt = `Query: ${originalQuery}

Data retrieved and work completed so far:
${toolSummaries.join('\n')}`;

  // Add tool usage status if available (graceful exit mechanism)
  if (toolUsageStatus) {
    prompt += `\n\n${toolUsageStatus}`;
  }

  prompt += `

Review the data above. If you have sufficient information to answer the query, respond directly WITHOUT calling any tools. Only call additional tools if there are specific data gaps that prevent you from answering.`;

  return prompt;
}

// ============================================================================
// Final Answer Generation
// ============================================================================

/**
 * Build the prompt for final answer generation with full context data.
 * This is used after context compaction - full data is loaded from disk for the final answer.
 */
export function buildFinalAnswerPrompt(
  originalQuery: string,
  fullContextData: string
): string {
  return `Query: ${originalQuery}

Data retrieved from your tool calls:
${fullContextData}

Answer the user's query using this data. Do not ask the user to provide additional data, paste values, or reference JSON/API internals. If data is incomplete, answer with what you have.`;
}

// ============================================================================
// Tool Summary Generation
// ============================================================================

/**
 * Build prompt for LLM-generated tool result summaries.
 * Used for context compaction - the LLM summarizes what it learned from each tool call.
 */
export function buildToolSummaryPrompt(
  originalQuery: string,
  toolName: string,
  toolArgs: Record<string, unknown>,
  result: string
): string {
  const argsStr = Object.entries(toolArgs).map(([k, v]) => `${k}=${v}`).join(', ');
  return `Summarize this tool result concisely.

Query: ${originalQuery}
Tool: ${toolName}(${argsStr})
Result:
${result}

Write a 1 sentence summary of what was retrieved. Include specific values (numbers, dates) if relevant.
Format: "[tool_call] -> [what was learned]"`;
}

// ============================================================================
// Context Selection (for token budget management)
// ============================================================================

/**
 * Build prompt for LLM to select which tool results need full data.
 * Used when total context exceeds token budget - LLM chooses most relevant results
 * to include in full, with summaries for the rest.
 */
export function buildContextSelectionPrompt(
  query: string,
  summaries: Array<{ index: number; toolName: string; summary: string; tokenCost: number }>
): string {
  const summaryList = summaries
    .map(s => `[${s.index}] ${s.toolName} (~${Math.round(s.tokenCost / 1000)}k tokens): ${s.summary}`)
    .join('\n');

  return `You are selecting which tool results are most important for answering a query.

Query: ${query}

Available tool results (with summaries):
${summaryList}

Select the tool results that contain data ESSENTIAL to answering the query accurately.
Prefer results with specific numbers, dates, or facts directly relevant to the query.

Return ONLY a JSON array of indices, e.g.: [0, 2, 5]
Return an empty array [] if summaries alone are sufficient.`;
}
