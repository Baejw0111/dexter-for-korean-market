/**
 * DART 내부자 거래(지분공시) 도구
 * @see https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS004&apiId=2020003
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { callDartApi, DartListResponse } from './api.js';
import { getCorpCode } from './corp-code.js';
import { formatToolResult } from '../../types.js';

/**
 * 임원/주요주주 소유보고 응답 항목
 */
interface ExecutiveShareItem {
  /** 접수번호 */
  rcept_no: string;
  /** 접수일자 */
  rcept_dt: string;
  /** 회사코드 */
  corp_code: string;
  /** 회사명 */
  corp_name: string;
  /** 보고자 */
  repror: string;
  /** 임원여부 */
  isu_exctv_yn: string;
  /** 직위 */
  isu_exctv_rgist_at: string;
  /** 주요주주여부 */
  isu_main_shrholdr: string;
  /** 특정증권등 소유주식수 */
  sp_stock_lmp_cnt: string;
  /** 특정증권등 소유비율 */
  sp_stock_lmp_irds_cnt: string;
  /** 특정증권등 소유 전 주식수 */
  sp_stock_lmp_rate: string;
  /** 특정증권등 소유 전 비율 */
  sp_stock_lmp_irds_rate: string;
}

/**
 * 대량보유 상황보고 응답 항목
 */
interface MajorShareholderItem {
  /** 접수번호 */
  rcept_no: string;
  /** 접수일자 */
  rcept_dt: string;
  /** 회사코드 */
  corp_code: string;
  /** 회사명 */
  corp_name: string;
  /** 보고자 */
  repror: string;
  /** 보유주식수 */
  stkqy: string;
  /** 보유비율 */
  stkrt: string;
  /** 보유주식수 증감 */
  stkqy_irds: string;
  /** 보유비율 증감 */
  stkrt_irds: string;
  /** 보고사유 */
  ctr_stkqy: string;
  /** 취득/처분 */
  ctr_stkrt: string;
  /** 보고구분 */
  report_resn: string;
}

const InsiderTradesInputSchema = z.object({
  ticker: z.string().describe('종목코드 (6자리) 또는 회사명'),
});

export const getInsiderTrades = new DynamicStructuredTool({
  name: 'get_insider_trades',
  description:
    '임원 및 주요주주의 주식 소유 변동 내역을 조회합니다. 미국 SEC Form 4에 해당합니다. 내부자의 매수/매도 동향을 파악할 수 있습니다.',
  schema: InsiderTradesInputSchema,
  func: async (input) => {
    const corpCode = await getCorpCode(input.ticker);
    if (!corpCode) {
      return formatToolResult({ error: `종목코드 또는 회사명을 찾을 수 없습니다: ${input.ticker}` }, []);
    }

    const { data, url } = await callDartApi<DartListResponse<ExecutiveShareItem>>('/elestock.json', {
      corp_code: corpCode,
    });

    const trades = (data.list || []).map((item) => ({
      접수일자: item.rcept_dt,
      보고자: item.repror,
      임원여부: item.isu_exctv_yn === 'Y' ? '임원' : '-',
      주요주주: item.isu_main_shrholdr === 'Y' ? '주요주주' : '-',
      직위: item.isu_exctv_rgist_at || '-',
      소유주식수: item.sp_stock_lmp_cnt,
      소유비율: `${item.sp_stock_lmp_rate}%`,
      변동주식수: item.sp_stock_lmp_irds_cnt,
      변동비율: `${item.sp_stock_lmp_irds_rate}%`,
      링크: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${item.rcept_no}`,
    }));

    return formatToolResult(
      {
        종목: input.ticker,
        총건수: data.total_count || trades.length,
        내부자거래내역: trades,
      },
      [url]
    );
  },
});

export const getMajorShareholder = new DynamicStructuredTool({
  name: 'get_major_shareholder',
  description:
    '대량보유(5% 이상) 상황보고 내역을 조회합니다. 주요 주주의 지분 변동 및 보유 목적을 파악할 수 있습니다.',
  schema: InsiderTradesInputSchema,
  func: async (input) => {
    const corpCode = await getCorpCode(input.ticker);
    if (!corpCode) {
      return formatToolResult({ error: `종목코드 또는 회사명을 찾을 수 없습니다: ${input.ticker}` }, []);
    }

    const { data, url } = await callDartApi<DartListResponse<MajorShareholderItem>>('/majorstock.json', {
      corp_code: corpCode,
    });

    const shareholders = (data.list || []).map((item) => ({
      접수일자: item.rcept_dt,
      보고자: item.repror,
      보유주식수: Number(item.stkqy || 0).toLocaleString('ko-KR'),
      보유비율: `${item.stkrt}%`,
      증감주식수: item.stkqy_irds,
      증감비율: `${item.stkrt_irds}%`,
      보고사유: item.report_resn || '-',
      링크: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${item.rcept_no}`,
    }));

    return formatToolResult(
      {
        종목: input.ticker,
        총건수: data.total_count || shareholders.length,
        대량보유현황: shareholders,
      },
      [url]
    );
  },
});
