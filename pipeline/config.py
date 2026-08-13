"""공통 설정 — 공공데이터포털 API (SPEC 4장, 라이선스 검증 완료 소스만 사용)

⚠️ 아래 API는 공공누리 2유형(상업적 이용 금지)이므로 절대 추가하지 말 것:
  - 금융위원회_주식배당정보
  - 금융위원회_주식발행정보 (발행주식수가 있어도 금지 — 상장주식수는 시세 API의 lstgStCnt 사용)
  - 금융위원회_국제거래종목정보
  패턴: 원천이 한국예탁결제원인 API는 2유형일 가능성이 높음.
  새 API 추가 시 이용허락범위를 반드시 먼저 확인할 것.

API 키는 환경변수 DATA_GO_KR_API_KEY 로 주입한다 (GitHub Actions Secret).
"""

import os

# .env 로드: 로컬 실행 시 프로젝트 루트(토스 앱/.env) 또는 stock-screener/.env 를 찾아 읽는다.
# GitHub Actions에서는 Secret이 이미 os.environ에 주입되므로 override=False로 덮어쓰지 않는다.
try:
    from dotenv import load_dotenv

    _here = os.path.dirname(__file__)
    for _candidate in (
        os.path.join(_here, "..", "..", ".env"),  # 토스 앱/.env (바깥 루트)
        os.path.join(_here, "..", ".env"),  # stock-screener/.env
    ):
        if os.path.exists(_candidate):
            load_dotenv(_candidate, override=False)
except ImportError:
    pass  # python-dotenv 미설치 시 순수 환경변수만 사용

API_KEY = os.environ.get("DATA_GO_KR_API_KEY", "")

# 금융위원회_주식시세정보 (이용허락범위: 제한 없음)
PRICE_API = (
    "https://apis.data.go.kr/1160100/service/"
    "GetStockSecuritiesInfoService/getStockPriceInfo"
)

# 금융위원회_KRX상장종목정보 — 종목코드 ↔ 법인등록번호(crno) 매핑용
# TODO(검증): API 키 수령 후 실제 응답 필드명 확인 (SPEC 8장 Phase1-8)
LISTED_API = (
    "https://apis.data.go.kr/1160100/service/"
    "GetKrxListedInfoService/getItemInfo"
)

# 금융위원회_기업재무정보 — 요약재무제표 (자본총계/당기순이익 → BPS/EPS 산출)
# TODO(검증): 서비스명·오퍼레이션명·필드명을 실제 활용신청 문서와 대조할 것
FINANCE_API = (
    "https://apis.data.go.kr/1160100/service/"
    "GetFinaStatInfoService_V2/getSummFinaStat_V2"
)

# 파일 경로
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
PRICE_CACHE_PATH = os.path.join(DATA_DIR, "price_cache.json")
FINANCIALS_PATH = os.path.join(DATA_DIR, "financials.json")
# GitHub Pages(/docs)로 서빙 → VITE_SCREENER_URL로 연결
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "docs", "screener.json")

# 종가 캐시 보관 영업일 수. 3개월(~60영업일) 차트 + 볼린저밴드(20일 이평, SPEC.md
# 부록 A)를 60일 전체 구간에 그리려면 60+19=79일이 필요해 85로 확대한다
# (홀리데이 갭 대비 버퍼 6일 포함, 기존 "60+5" 산정과 동일 논리).
# ⚠️ 확대 후에도 RSI는 최근 RSI_WINDOW(30)일만 써서 기존 값과 100% 동일하게 유지한다
#    (build_json에서 rsi(closes[-RSI_WINDOW:]) — Wilder 평활 시드가 달라지는 회귀 방지).
CACHE_DAYS = 85
RSI_PERIOD = 14
# RSI 계산에 넣는 최근 종가 개수(캐시 확대와 무관하게 현행 RSI 값 보존용, 30일 유지)
RSI_WINDOW = 30

# 지표 테이블 확장 + 볼린저밴드(SPEC.md 부록 A, 2026-08-XX 승인) 관련 상수.
#
# WINDOW 값들은 삼성전자(005930) 실측 캐시로 window 크기별 결과를 비교해
# 정했다(RSI(14)=30일 창의 전례와 같은 문제: Wilder 평활은 시드가 길수록
# 값이 수렴하고, 짧으면 흔들린다). MFI·CCI는 Wilder 평활이 아니라 단순
# 이동평균/평균편차라 정확히 period(+1)개만 있으면 되므로 별도 WINDOW가 없다
# (indicators.py가 내부에서 자체적으로 슬라이싱한다).
RSI20_PERIOD = 20
# RSI(14)가 30일 창(2.14×period)을 쓰는 것과 같은 비율. 실측(window=40 vs 85:
# 42.8 vs 43.8, 40 미만은 더 크게 흔들림)으로 확인.
RSI20_WINDOW = 40
MFI_PERIOD = 14
CCI_PERIOD = 20
# ADX·ATR은 승인 요청에 기간이 명시되지 않아 Wilder 표준 기본값 14로 확정(사용자 확인 완료).
ADX_PERIOD = 14
ATR_PERIOD = 14
# ATR은 TR 한 단계 평활이라 RSI와 비슷하게 30일 창으로 이미 안정적
# (실측 window 30~85 사이 ATR 24,079~24,646원, 변동폭 2% 미만).
ATR_WINDOW = 30
# ADX는 DI 평활 → DX 평활, 이중 평활 구조라 30일 창으로는 부족했다(실측:
# window=30일 때 ADX 39.7, window=85일 때 26.9로 47% 차이). window≈45 이상부터
# 24.4~27.4 범위로 수렴해 60으로 넉넉히 잡는다.
ADX_WINDOW = 60
BB_PERIOD = 20
BB_STDDEV_MULT = 2.0

PAGE_SIZE = 1000
REQUEST_TIMEOUT = 30
