# 데이터 파이프라인 (Phase 1)

한국 주식 전종목의 D-1 종가·시총·등락률·RSI·PBR·PER를 `docs/screener.json`으로 생성합니다.
GitHub Pages(`/docs`)로 서빙하고, 미니앱은 `VITE_SCREENER_URL`로 이 파일을 읽습니다.

## 구성

| 파일 | 역할 |
|---|---|
| `fetch_prices.py` | 주식시세정보 API 전종목 D-1 조회 (페이지네이션) |
| `price_cache.py` | 일별 종가 누적 캐시 (30영업일 유지, RSI용) |
| `indicators.py` | RSI(14) Wilder 방식 계산 |
| `fetch_financials.py` | KRX상장종목정보(crno 매핑) + 기업재무정보 → 자본총계/순이익 (분기 1회) |
| `build_json.py` | 메인 엔트리 — PBR/PER 산출 + screener.json 생성 |

## 사용 방법

1. [공공데이터포털](https://www.data.go.kr)에서 아래 API 활용신청 (자동승인)
   - 금융위원회_주식시세정보 ✅ 제한 없음
   - 금융위원회_KRX상장종목정보 ✅ 제한 없음 (crno 매핑 브리지)
   - 금융위원회_기업재무정보 ✅ 제한 없음

   **⛔ 사용 금지 — 공공누리 2유형(상업적 이용 금지), SPEC 4장:**
   - 금융위원회_주식배당정보
   - 금융위원회_주식발행정보 — 발행주식수가 있지만 쓰지 말 것.
     상장주식수는 주식시세정보의 `lstgStCnt`, 시가총액은 `mrktTotAmt`를 사용
   - 금융위원회_국제거래종목정보
   - (패턴) 원천이 한국예탁결제원인 API는 2유형일 가능성이 높음 —
     새 API 추가 시 이용허락범위를 반드시 먼저 확인하고 보고할 것
2. 로컬 실행:
   ```bash
   pip install -r requirements.txt
   set DATA_GO_KR_API_KEY=발급받은키    # PowerShell: $env:DATA_GO_KR_API_KEY="..."
   python fetch_financials.py   # 최초 1회 + 분기 1회
   python build_json.py         # 매일
   ```
3. GitHub 저장소에 푸시 후:
   - Settings → Secrets → `DATA_GO_KR_API_KEY` 등록
   - Settings → Pages → Source: `main` 브랜치 `/docs` 폴더
   - `.github/workflows/screener.yml`이 평일 14:30 KST에 자동 실행
4. 미니앱 프로젝트 루트에 `.env` 생성:
   ```
   VITE_SCREENER_URL=https://<username>.github.io/<repo>/screener.json
   ```

## ⚠️ API 키 수령 후 반드시 검증할 것 (SPEC 8장 Phase1-8)

- [ ] 주식시세정보 실제 응답 필드명 (`srtnCd`, `clpr`, `fltRt`, `mrktTotAmt`, `lstgStCnt`, `mrktCtg`)
- [ ] 기업재무정보 오퍼레이션/필드명 (`getSummFinaStat_V2`, `enpTcptAmt`, `enpCrtmNpf`, `fnclDcd`)
- [ ] 결측률 측정 (재무 미제출 종목 수)
- [ ] screener.json 용량 (목표 ~200KB)
- [ ] RSI는 캐시가 15영업일 이상 쌓여야 계산됨 — 초기 2~3주는 null (프론트에서 "—" 표시 및 필터 시 제외 처리 완료)
