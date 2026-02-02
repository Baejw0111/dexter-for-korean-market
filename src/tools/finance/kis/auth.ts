/**
 * 한국투자증권 OAuth 인증 모듈
 * @see https://apiportal.koreainvestment.com/apiservice/oauth2#L_fa778c98-f68d-451e-8fff-b1c6bfe5cd30
 */

import {
  getOrRefreshToken,
  getTokenInfo as getStoredTokenInfo,
  removeToken,
  type StoredToken,
} from '../../../utils/token-store.js';

const PROVIDER_ID = 'kis';

interface KISTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  access_token_token_expired: string;
}

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
async function issueToken(): Promise<StoredToken> {
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
  const now = Date.now();

  return {
    accessToken: data.access_token,
    tokenType: data.token_type,
    expiresIn: data.expires_in,
    expiresAt: now + data.expires_in * 1000,
    issuedAt: now,
    raw: {
      access_token_token_expired: data.access_token_token_expired,
    },
  };
}

/**
 * Access Token 획득 (파일 캐시 사용)
 */
export async function getAccessToken(): Promise<string> {
  const token = await getOrRefreshToken(PROVIDER_ID, issueToken);
  return token.accessToken;
}

/**
 * 토큰 캐시 초기화 (테스트용)
 */
export function clearTokenCache(): void {
  removeToken(PROVIDER_ID);
}

/**
 * 현재 토큰 정보 반환 (디버깅용)
 */
export function getTokenInfo(): {
  hasToken: boolean;
  expiresAt: number | null;
  isValid: boolean;
  remainingMs: number | null;
} {
  return getStoredTokenInfo(PROVIDER_ID);
}
