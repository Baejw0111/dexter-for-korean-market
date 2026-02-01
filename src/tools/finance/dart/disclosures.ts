/**
 * DART 공시 검색 도구
 * @see https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { callDartApi, DartListResponse, formatDartDate, DISCLOSURE_TYPE } from './api.js';
import { getCorpCode } from './corp-code.js';
import { formatToolResult } from '../../types.js';

/**
 * 공시 목록 응답 항목
 */
interface DisclosureItem {
  /** 회사코드 */
  corp_code: string;
  /** 회사명 */
  corp_name: string;
  /** 종목코드 */
  stock_code: string;
  /** 회사명(영문) */
  corp_cls: string;
  /** 보고서명 */
  report_nm: string;
  /** 접수번호 */
  rcept_no: string;
  /** 공시제출인명 */
  flr_nm: string;
  /** 접수일자 */
  rcept_dt: string;
  /** 비고 */
  rm: string;
}

/**
 * 기업 개황 응답
 */
interface CompanyInfoResponse {
  status: string;
  message: string;
  /** 회사코드 */
  corp_code: string;
  /** 회사명 */
  corp_name: string;
  /** 회사명(영문) */
  corp_name_eng: string;
  /** 종목명 */
  stock_name: string;
  /** 종목코드 */
  stock_code: string;
  /** 대표자명 */
  ceo_nm: string;
  /** 법인구분 */
  corp_cls: string;
  /** 법인등록번호 */
  jurir_no: string;
  /** 사업자등록번호 */
  bizr_no: string;
  /** 주소 */
  adres: string;
  /** 홈페이지 */
  hm_url: string;
  /** IR홈페이지 */
  ir_url: string;
  /** 전화번호 */
  phn_no: string;
  /** 팩스번호 */
  fax_no: string;
  /** 업종코드 */
  induty_code: string;
  /** 설립일 */
  est_dt: string;
  /** 결산월 */
  acc_mt: string;
}

const DisclosureSearchInputSchema = z.object({
  ticker: z
    .string()
    .optional()
    .describe('종목코드 (6자리) 또는 회사명. 생략시 전체 공시 검색'),
  start_date: z
    .string()
    .optional()
    .describe('검색 시작일 (YYYYMMDD). 생략시 최근 1개월'),
  end_date: z
    .string()
    .optional()
    .describe('검색 종료일 (YYYYMMDD). 생략시 오늘'),
  disclosure_type: z
    .enum(['all', 'regular', 'major', 'share', 'other'])
    .default('all')
    .describe('공시 유형 (all: 전체, regular: 정기공시, major: 주요사항, share: 지분공시, other: 기타)'),
  page: z.number().default(1).describe('페이지 번호'),
  count: z.number().default(20).describe('페이지당 결과 수 (최대 100)'),
});

/**
 * 공시 유형 코드 변환
 */
function getDisclosureTypeCode(type: string): string | undefined {
  switch (type) {
    case 'regular':
      return DISCLOSURE_TYPE.REGULAR;
    case 'major':
      return DISCLOSURE_TYPE.MAJOR;
    case 'share':
      return DISCLOSURE_TYPE.SHARE;
    case 'other':
      return DISCLOSURE_TYPE.OTHER;
    default:
      return undefined;
  }
}

export const getDisclosures = new DynamicStructuredTool({
  name: 'get_disclosures',
  description:
    '기업의 공시 목록을 검색합니다. 정기공시(사업보고서, 분기보고서), 주요사항보고, 지분공시 등을 조회할 수 있습니다. 미국 SEC의 10-K, 10-Q, 8-K에 해당합니다.',
  schema: DisclosureSearchInputSchema,
  func: async (input) => {
    // 종목코드가 있으면 DART 고유번호로 변환
    let corpCode: string | undefined;
    if (input.ticker) {
      corpCode = (await getCorpCode(input.ticker)) || undefined;
      if (!corpCode) {
        return formatToolResult({ error: `종목코드 또는 회사명을 찾을 수 없습니다: ${input.ticker}` }, []);
      }
    }

    // 기본 날짜 설정 (최근 1개월)
    const today = new Date();
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    const endDate = input.end_date || formatDartDate(today);
    const startDate = input.start_date || formatDartDate(monthAgo);

    const pblntfTy = getDisclosureTypeCode(input.disclosure_type);

    const { data, url } = await callDartApi<DartListResponse<DisclosureItem>>('/list.json', {
      corp_code: corpCode,
      bgn_de: startDate,
      end_de: endDate,
      pblntf_ty: pblntfTy,
      page_no: input.page,
      page_count: Math.min(input.count, 100),
    });

    const disclosures = (data.list || []).map((item) => ({
      회사명: item.corp_name,
      종목코드: item.stock_code || '-',
      보고서명: item.report_nm,
      접수일자: item.rcept_dt,
      접수번호: item.rcept_no,
      비고: item.rm || '-',
      링크: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${item.rcept_no}`,
    }));

    return formatToolResult(
      {
        검색조건: {
          종목: input.ticker || '전체',
          기간: `${startDate} ~ ${endDate}`,
          유형: input.disclosure_type,
        },
        총건수: data.total_count,
        현재페이지: data.page_no,
        전체페이지: data.total_page,
        공시목록: disclosures,
      },
      [url]
    );
  },
});

const CompanyInfoInputSchema = z.object({
  ticker: z.string().describe('종목코드 (6자리) 또는 회사명'),
});

export const getCompanyInfo = new DynamicStructuredTool({
  name: 'get_company_info',
  description:
    '기업의 기본 정보(개황)를 조회합니다. 대표자, 주소, 업종, 설립일, 결산월 등을 확인할 수 있습니다.',
  schema: CompanyInfoInputSchema,
  func: async (input) => {
    const corpCode = await getCorpCode(input.ticker);
    if (!corpCode) {
      return formatToolResult({ error: `종목코드 또는 회사명을 찾을 수 없습니다: ${input.ticker}` }, []);
    }

    const { data, url } = await callDartApi<CompanyInfoResponse>('/company.json', {
      corp_code: corpCode,
    });

    const info = {
      회사명: data.corp_name,
      영문명: data.corp_name_eng || '-',
      종목명: data.stock_name || '-',
      종목코드: data.stock_code || '-',
      대표자: data.ceo_nm,
      주소: data.adres,
      홈페이지: data.hm_url || '-',
      전화번호: data.phn_no || '-',
      업종코드: data.induty_code,
      설립일: data.est_dt,
      결산월: `${data.acc_mt}월`,
    };

    return formatToolResult(info, [url]);
  },
});
