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

# RSI 계산용 종가 보관 영업일 수
CACHE_DAYS = 30
RSI_PERIOD = 14

PAGE_SIZE = 1000
REQUEST_TIMEOUT = 30
