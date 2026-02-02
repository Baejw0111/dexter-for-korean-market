/**
 * API 통신 로거
 * 요청/응답/에러 로깅 및 민감 정보 마스킹
 */

import { logger } from './logger.js';

export type ApiProvider = 'KIS' | 'DART' | 'NAVER' | 'OLLAMA' | 'UNKNOWN';

export interface ApiRequestLog {
  provider: ApiProvider;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface ApiResponseLog {
  provider: ApiProvider;
  url: string;
  status: number;
  statusText: string;
  durationMs: number;
  data?: unknown;
}

export interface ApiErrorLog {
  provider: ApiProvider;
  url: string;
  status?: number;
  statusText?: string;
  durationMs?: number;
  error: string;
}

// 마스킹할 헤더/파라미터 키
const SENSITIVE_KEYS = [
  'authorization',
  'appkey',
  'appsecret',
  'crtfc_key',
  'x-naver-client-id',
  'x-naver-client-secret',
  'access_token',
  'api_key',
  'apikey',
  'secret',
  'password',
  'token',
];

/**
 * 민감 정보 마스킹
 */
function maskSensitiveValue(value: string): string {
  if (value.length <= 8) {
    return '***';
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

/**
 * 객체 내 민감 정보 마스킹
 */
function maskSensitiveData(data: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.some((k) => lowerKey.includes(k))) {
      masked[key] = maskSensitiveValue(value);
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

/**
 * URL 내 민감 정보 마스킹
 */
function maskUrlSensitiveParams(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of parsed.searchParams.keys()) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.some((k) => lowerKey.includes(k))) {
        const value = parsed.searchParams.get(key);
        if (value) {
          parsed.searchParams.set(key, maskSensitiveValue(value));
        }
      }
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * 요청 데이터 요약
 */
function summarizeData(data: unknown, maxLength: number = 200): string {
  if (data === undefined || data === null) {
    return '';
  }
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  if (str.length <= maxLength) {
    return str;
  }
  return `${str.slice(0, maxLength)}... (${str.length} chars)`;
}

class ApiLogger {
  private requestStartTimes: Map<string, number> = new Map();

  /**
   * 요청 ID 생성
   */
  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  /**
   * API 요청 시작 로깅
   */
  logRequest(req: ApiRequestLog): string {
    const requestId = this.generateRequestId();
    this.requestStartTimes.set(requestId, Date.now());

    const maskedUrl = maskUrlSensitiveParams(req.url);
    const maskedHeaders = req.headers ? maskSensitiveData(req.headers) : undefined;

    logger.info(`[${req.provider}] ${req.method} ${maskedUrl}`, {
      requestId,
      provider: req.provider,
      method: req.method,
      url: maskedUrl,
      headers: maskedHeaders,
      body: req.body ? summarizeData(req.body) : undefined,
    });

    return requestId;
  }

  /**
   * API 응답 로깅
   */
  logResponse(requestId: string, res: ApiResponseLog): void {
    this.requestStartTimes.delete(requestId);

    const maskedUrl = maskUrlSensitiveParams(res.url);
    const level = res.status >= 400 ? 'warn' : 'info';

    logger[level](`[${res.provider}] ${res.status} ${res.statusText} (${res.durationMs}ms)`, {
      requestId,
      provider: res.provider,
      url: maskedUrl,
      status: res.status,
      statusText: res.statusText,
      durationMs: res.durationMs,
      data: res.data ? summarizeData(res.data) : undefined,
    });
  }

  /**
   * API 에러 로깅
   */
  logError(requestId: string, err: ApiErrorLog): void {
    this.requestStartTimes.delete(requestId);

    const maskedUrl = maskUrlSensitiveParams(err.url);

    logger.error(`[${err.provider}] Error: ${err.error}`, {
      requestId,
      provider: err.provider,
      url: maskedUrl,
      status: err.status,
      statusText: err.statusText,
      durationMs: err.durationMs,
      error: err.error,
    });
  }

  /**
   * 경과 시간 계산
   */
  getDurationMs(requestId: string): number {
    const startTime = this.requestStartTimes.get(requestId);
    if (!startTime) {
      return 0;
    }
    return Date.now() - startTime;
  }
}

// Singleton instance
export const apiLogger = new ApiLogger();

/**
 * fetch 래퍼 - 자동 로깅 포함
 */
export async function fetchWithLogging(
  provider: ApiProvider,
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const method = options.method || 'GET';

  const requestId = apiLogger.logRequest({
    provider,
    method,
    url,
    headers: options.headers as Record<string, string>,
    body: options.body,
  });

  const startTime = Date.now();

  try {
    const response = await fetch(url, options);
    const durationMs = Date.now() - startTime;

    apiLogger.logResponse(requestId, {
      provider,
      url,
      status: response.status,
      statusText: response.statusText,
      durationMs,
    });

    return response;
  } catch (error) {
    const durationMs = Date.now() - startTime;

    apiLogger.logError(requestId, {
      provider,
      url,
      durationMs,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}
