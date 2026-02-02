/**
 * 공통 토큰 저장소
 * 파일 기반으로 토큰을 영속화하여 프로세스 재시작 시에도 유지
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

export interface StoredToken {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  expiresAt: number;
  issuedAt: number;
  raw?: Record<string, unknown>;
}

interface TokenStore {
  [provider: string]: StoredToken;
}

// 토큰 저장 경로
const TOKEN_DIR = join(process.cwd(), '.dexter');
const TOKEN_FILE = join(TOKEN_DIR, 'tokens.json');

// 메모리 캐시
let memoryCache: TokenStore = {};
let cacheLoaded = false;

/**
 * 토큰 디렉토리 생성
 */
function ensureTokenDir(): void {
  if (!existsSync(TOKEN_DIR)) {
    mkdirSync(TOKEN_DIR, { recursive: true });
  }
}

/**
 * 파일에서 토큰 로드
 */
function loadFromFile(): TokenStore {
  try {
    if (existsSync(TOKEN_FILE)) {
      const data = readFileSync(TOKEN_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch {
    // 파일 읽기 실패 시 빈 객체 반환
  }
  return {};
}

/**
 * 파일에 토큰 저장
 */
function saveToFile(store: TokenStore): void {
  ensureTokenDir();
  writeFileSync(TOKEN_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

/**
 * 캐시 초기화 (파일에서 로드)
 */
function ensureCacheLoaded(): void {
  if (!cacheLoaded) {
    memoryCache = loadFromFile();
    cacheLoaded = true;
  }
}

/**
 * 토큰 저장
 */
export function saveToken(provider: string, token: StoredToken): void {
  ensureCacheLoaded();
  memoryCache[provider] = token;
  saveToFile(memoryCache);
}

/**
 * 토큰 조회
 */
export function getToken(provider: string): StoredToken | null {
  ensureCacheLoaded();
  return memoryCache[provider] ?? null;
}

/**
 * 토큰 유효성 검증
 * @param bufferMs 만료 전 버퍼 시간 (기본: 5분)
 */
export function isTokenValid(provider: string, bufferMs: number = 5 * 60 * 1000): boolean {
  const token = getToken(provider);
  if (!token) {
    return false;
  }
  return Date.now() < (token.expiresAt - bufferMs);
}

/**
 * 토큰 삭제
 */
export function removeToken(provider: string): void {
  ensureCacheLoaded();
  delete memoryCache[provider];
  saveToFile(memoryCache);
}

/**
 * 모든 토큰 삭제
 */
export function clearAllTokens(): void {
  memoryCache = {};
  cacheLoaded = true;
  saveToFile(memoryCache);
}

/**
 * 토큰 정보 조회 (디버깅용)
 */
export function getTokenInfo(provider: string): {
  hasToken: boolean;
  expiresAt: number | null;
  isValid: boolean;
  remainingMs: number | null;
} {
  const token = getToken(provider);
  const now = Date.now();
  
  return {
    hasToken: token !== null,
    expiresAt: token?.expiresAt ?? null,
    isValid: isTokenValid(provider),
    remainingMs: token ? token.expiresAt - now : null,
  };
}

/**
 * 유효한 토큰 가져오기 또는 갱신
 * @param provider 프로바이더 식별자
 * @param refreshFn 토큰 갱신 함수
 * @param bufferMs 만료 전 버퍼 시간
 */
export async function getOrRefreshToken(
  provider: string,
  refreshFn: () => Promise<StoredToken>,
  bufferMs: number = 5 * 60 * 1000
): Promise<StoredToken> {
  if (isTokenValid(provider, bufferMs)) {
    return getToken(provider)!;
  }
  
  const newToken = await refreshFn();
  saveToken(provider, newToken);
  return newToken;
}
