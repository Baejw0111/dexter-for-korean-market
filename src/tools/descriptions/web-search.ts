/**
 * Rich description for the web_search tool.
 * Used in the system prompt to guide the LLM on when and how to use this tool.
 */
export const WEB_SEARCH_DESCRIPTION = `
일반 웹 검색 도구입니다. 다양한 주제에 대한 최신 정보를 검색하여 URL과 콘텐츠 스니펫을 반환합니다.

## 사용 시기

- 기업, 인물, 단체에 대한 일반적인 사실 확인 (상장/비상장 여부, 현 경영진 등)
- 최신 트렌드, 기술 동향, 신제품 발표
- 해외 뉴스, 글로벌 시장 동향, 영어권 정보
- 금융 데이터 외의 일반 리서치 (산업 분석, 경쟁사 동향 등)
- 비상장 기업 정보
- 개념/정의 질문 ("PER이란?", "DCF 분석 방법")

## 사용하지 않을 때

- 주가, 재무제표, 투자자 동향 등 정형 금융 데이터 → financial_search 사용
- DART 공시, 사업보고서, 대주주 현황 → financial_search 사용
- 한국 뉴스 검색 → news_search 사용 (네이버 뉴스 API 기반, 더 정확)

## 사용 참고사항

- 구체적이고 명확한 검색어 사용 권장
- 최대 5개 결과 반환 (URL + 콘텐츠 스니펫)
- financial_search가 커버하지 않는 영역의 보조 리서치용
`.trim();
