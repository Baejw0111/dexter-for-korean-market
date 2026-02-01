/**
 * 한국투자증권 OAuth 인증 모듈
 * @see https://apiportal.koreainvestment.com/apiservice/oauth2#L_fa778c98-f68d-451e-8fff-b1c6bfe5cd30
 */

interface KISToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  access_token_token_expired: string;
  expires_at: number;
}

interface KISTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  access_token_token_expired: string;
}

// 토큰 캐시 (메모리)
let cachedToken: KISToken | null = null;

/**
 * 환경에 따른 Base URL 반환
 */
export function getBaseUrl(): string {
  const env = process.env.KIS_ENV || 'prod';
  if (env === 'vps') {
    return 'https://openapivts.koreainvestment.com:29443';
  }
  return 'https://openapi.koreainvestment.com:9443';
}

/**
 * Access Token 발급
 */
async function issueToken(): Promise<KISToken> {
  const baseUrl = getBaseUrl();
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;

  if (!appKey || !appSecret) {
    throw new Error('KIS_APP_KEY and KIS_APP_SECRET must be set');
  }

  const response = await fetch(`${baseUrl}/oauth2/tokenP`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: appKey,
      appsecret: appSecret,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`KIS token issue failed: ${response.status} ${errorText}`);
  }

  const data: KISTokenResponse = await response.json();

  // 만료 시간 계산 (현재 시간 + expires_in - 5분 버퍼)
  const expiresAt = Date.now() + (data.expires_in - 300) * 1000;

  return {
    ...data,
    expires_at: expiresAt,
  };
}

/**
 * 토큰이 유효한지 확인
 */
function isTokenValid(token: KISToken | null): boolean {
  if (!token) {
    return false;
  }
  // 만료 시간 5분 전에 갱신
  return Date.now() < token.expires_at;
}

/**
 * Access Token 획득 (캐시 사용)
 */
export async function getAccessToken(): Promise<string> {
  if (!isTokenValid(cachedToken)) {
    cachedToken = await issueToken();
  }
  return cachedToken!.access_token;
}

/**
 * 토큰 캐시 초기화 (테스트용)
 */
export function clearTokenCache(): void {
  cachedToken = null;
}

/**
 * 현재 토큰 정보 반환 (디버깅용)
 */
export function getTokenInfo(): { hasToken: boolean; expiresAt: number | null } {
  return {
    hasToken: cachedToken !== null,
    expiresAt: cachedToken?.expires_at ?? null,
  };
}
