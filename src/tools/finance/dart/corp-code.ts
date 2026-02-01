/**
 * 종목코드 ↔ DART 고유번호 매핑
 * @see https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019018
 *
 * DART API는 종목코드(005930)가 아닌 고유번호(00126380)를 사용합니다.
 * 이 모듈은 DART에서 제공하는 기업코드 목록을 다운로드하여 매핑 테이블을 구축합니다.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

const BASE_URL = 'https://opendart.fss.or.kr/api';
const CACHE_FILE = path.join(__dirname, 'corp-code-cache.json');
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24시간

export interface CorpCodeEntry {
  /** DART 고유번호 (8자리) */
  corpCode: string;
  /** 회사명 */
  corpName: string;
  /** 종목코드 (6자리, 상장사만) */
  stockCode: string | null;
  /** 최종변경일자 */
  modifyDate: string;
}

interface CorpCodeCache {
  updatedAt: number;
  /** stockCode -> CorpCodeEntry */
  byStockCode: Record<string, CorpCodeEntry>;
  /** corpName -> CorpCodeEntry */
  byCorpName: Record<string, CorpCodeEntry>;
  /** corpCode -> CorpCodeEntry */
  byCorpCode: Record<string, CorpCodeEntry>;
}

let cache: CorpCodeCache | null = null;

/**
 * 캐시 로드 (파일에서)
 */
function loadCacheFromFile(): CorpCodeCache | null {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const content = fs.readFileSync(CACHE_FILE, 'utf-8');
      const data = JSON.parse(content) as CorpCodeCache;

      // TTL 확인
      if (Date.now() - data.updatedAt < CACHE_TTL) {
        return data;
      }
    }
  } catch {
    // 캐시 로드 실패 시 무시
  }
  return null;
}

/**
 * 캐시 저장 (파일로)
 */
function saveCacheToFile(data: CorpCodeCache): void {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data), 'utf-8');
  } catch {
    // 캐시 저장 실패 시 무시
  }
}

/**
 * DART에서 기업코드 목록 다운로드 및 파싱
 */
async function downloadCorpCodes(): Promise<CorpCodeEntry[]> {
  const apiKey = process.env.DART_API_KEY;

  if (!apiKey) {
    throw new Error('DART_API_KEY must be set');
  }

  const url = `${BASE_URL}/corpCode.xml?crtfc_key=${apiKey}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download corp codes: ${response.status}`);
  }

  // ZIP 파일로 응답됨
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // ZIP 압축 해제 (단일 XML 파일)
  const xmlContent = await unzipCorpCodeXml(buffer);

  // XML 파싱
  return parseCorpCodeXml(xmlContent);
}

/**
 * ZIP 압축 해제
 */
async function unzipCorpCodeXml(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    // DART의 corpCode.xml은 ZIP 형식으로 제공됨
    // 간단한 ZIP 파싱 (단일 파일)
    try {
      // ZIP 파일 시그니처 확인 (PK)
      if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
        // Local file header 파싱
        const compressedSize = buffer.readUInt32LE(18);
        const fileNameLength = buffer.readUInt16LE(26);
        const extraFieldLength = buffer.readUInt16LE(28);

        const dataStart = 30 + fileNameLength + extraFieldLength;
        const compressedData = buffer.slice(dataStart, dataStart + compressedSize);

        // Deflate 압축 해제
        zlib.inflateRaw(compressedData, (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result.toString('utf-8'));
          }
        });
      } else {
        // 압축되지 않은 경우
        resolve(buffer.toString('utf-8'));
      }
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * XML 파싱 (간단한 정규식 기반)
 */
function parseCorpCodeXml(xml: string): CorpCodeEntry[] {
  const entries: CorpCodeEntry[] = [];
  const listRegex = /<list>([\s\S]*?)<\/list>/g;

  let match;
  while ((match = listRegex.exec(xml)) !== null) {
    const item = match[1];

    const corpCode = extractXmlValue(item, 'corp_code');
    const corpName = extractXmlValue(item, 'corp_name');
    const stockCode = extractXmlValue(item, 'stock_code');
    const modifyDate = extractXmlValue(item, 'modify_date');

    if (corpCode && corpName) {
      entries.push({
        corpCode,
        corpName,
        stockCode: stockCode && stockCode.trim() ? stockCode.trim() : null,
        modifyDate: modifyDate || '',
      });
    }
  }

  return entries;
}

/**
 * XML 태그 값 추출
 */
function extractXmlValue(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}><!\\[CDATA\\[([^\\]]*?)\\]\\]><\\/${tag}>|<${tag}>([^<]*)<\\/${tag}>`);
  const match = regex.exec(xml);
  return match ? (match[1] || match[2] || null) : null;
}

/**
 * 캐시 초기화 및 빌드
 */
async function buildCache(): Promise<CorpCodeCache> {
  // 파일 캐시 확인
  const fileCache = loadCacheFromFile();
  if (fileCache) {
    return fileCache;
  }

  // DART에서 다운로드
  const entries = await downloadCorpCodes();

  const byStockCode: Record<string, CorpCodeEntry> = {};
  const byCorpName: Record<string, CorpCodeEntry> = {};
  const byCorpCode: Record<string, CorpCodeEntry> = {};

  for (const entry of entries) {
    byCorpCode[entry.corpCode] = entry;
    byCorpName[entry.corpName] = entry;

    if (entry.stockCode) {
      byStockCode[entry.stockCode] = entry;
    }
  }

  const newCache: CorpCodeCache = {
    updatedAt: Date.now(),
    byStockCode,
    byCorpName,
    byCorpCode,
  };

  // 파일에 저장
  saveCacheToFile(newCache);

  return newCache;
}

/**
 * 캐시 획득 (필요시 빌드)
 */
async function getCache(): Promise<CorpCodeCache> {
  if (!cache) {
    cache = await buildCache();
  }
  return cache;
}

/**
 * 종목코드로 DART 고유번호 조회
 * @param stockCode 종목코드 (6자리, 예: "005930")
 */
export async function getCorpCodeByStockCode(stockCode: string): Promise<string | null> {
  const c = await getCache();
  return c.byStockCode[stockCode]?.corpCode ?? null;
}

/**
 * 회사명으로 DART 고유번호 조회
 * @param corpName 회사명 (예: "삼성전자")
 */
export async function getCorpCodeByName(corpName: string): Promise<string | null> {
  const c = await getCache();
  return c.byCorpName[corpName]?.corpCode ?? null;
}

/**
 * DART 고유번호로 종목코드 조회
 * @param corpCode DART 고유번호 (8자리)
 */
export async function getStockCodeByCorpCode(corpCode: string): Promise<string | null> {
  const c = await getCache();
  return c.byCorpCode[corpCode]?.stockCode ?? null;
}

/**
 * 종목코드 또는 회사명으로 DART 고유번호 조회
 * @param identifier 종목코드 또는 회사명
 */
export async function getCorpCode(identifier: string): Promise<string | null> {
  const c = await getCache();

  // 6자리 숫자면 종목코드로 간주
  if (/^\d{6}$/.test(identifier)) {
    return c.byStockCode[identifier]?.corpCode ?? null;
  }

  // 그 외는 회사명으로 검색
  return c.byCorpName[identifier]?.corpCode ?? null;
}

/**
 * 캐시 새로고침
 */
export async function refreshCache(): Promise<void> {
  cache = null;
  // 파일 캐시 삭제
  try {
    if (fs.existsSync(CACHE_FILE)) {
      fs.unlinkSync(CACHE_FILE);
    }
  } catch {
    // 무시
  }
  await getCache();
}

/**
 * 캐시 통계
 */
export async function getCacheStats(): Promise<{
  totalCompanies: number;
  listedCompanies: number;
  updatedAt: Date;
}> {
  const c = await getCache();
  return {
    totalCompanies: Object.keys(c.byCorpCode).length,
    listedCompanies: Object.keys(c.byStockCode).length,
    updatedAt: new Date(c.updatedAt),
  };
}
