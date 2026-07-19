"""빌드된 screener.json의 데이터 신선도를 검증한다 (워크플로 게이트).

이 스텝이 필요한 이유:
파이프라인은 '가장 최근에 데이터가 있는 기준일'을 찾아 쓰기 때문에, 공공데이터
API가 새 영업일 데이터를 아직 안 올렸으면 지난 기준일로 조용히 성공한다.
커밋 단계도 `git diff --quiet ||` 로 변경 없으면 넘어가므로 워크플로는 초록
체크로 끝난다. 그 결과 "실행은 성공했는데 앱 날짜가 그대로"인 상황이 며칠간
드러나지 않는다(2026-07-16~19 실제 발생).

그래서 여기서 기준일을 항상 잡 요약에 노출하고, 명백히 비정상인 지연일 때만
실패시킨다. 임계값을 넉넉히 둔 건 연휴로 인한 정상 지연을 빨간불로 만들지
않기 위해서다 — 잦은 오탐은 경고를 무시하게 만든다.

지연은 달력일로 잰다. 영업일로 재려면 한국 공휴일 달력이 필요한데, 검토 결과
도입하지 않았다: 특일정보 API는 별도 활용신청이 필요한 데다 검증 스텝이 외부
API 장애에 물리고(알림 장치가 알림 대상이 된다), holidays 라이브러리는 최근
입법(2026 제헌절 공휴일 복원)을 반영 못 할 수 있으며 공휴일 != KRX 휴장일이다.
불완전한데 정확하다는 착각을 주는 쪽이 더 나쁘다고 판단했다. 대신 임계값을
정상 최대 지연 위로 올리고, 판단 근거는 사람에게 넘긴다.

정상 지연(스케줄 실행 = 평일 14:30 KST. GitHub cron은 한국 공휴일을 모르므로
공휴일에도 실행된다):
  평시 화~금 = 1일, 평시 월 = 3일(금요일치)
  월 공휴일 → 화 실행 = 4일 / 월·화 공휴일 → 수 실행 = 5일
  설·추석 등 6~7일 연속 휴장 = 8~9일  ← 정상 최대
따라서 12일 초과라야 연휴로 설명되지 않는 진짜 이상이다.
"""

import datetime as dt
import json
import os
import subprocess
import sys

from config import OUTPUT_PATH, PRICE_CACHE_PATH

# 윈도우 콘솔 기본 코덱(cp949)은 이모지를 못 찍어 로컬 실행이 죽는다.
# Actions(리눅스/UTF-8)에선 무해하고, 로컬에선 깨져도 죽지는 않게 한다.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

KST = dt.timezone(dt.timedelta(hours=9))

# 이 일수를 넘게 뒤처지면 경고(주의 환기), 더 넘으면 실패(연휴로 설명 불가)
WARN_DAYS = 5
FAIL_DAYS = 12

# 요약에 찍을 최근 거래일 개수
RECENT_TRADING_DAYS = 6


def _read_base_date(raw: bytes) -> str | None:
    try:
        return json.loads(raw.decode("utf-8")).get("meta", {}).get("base_date")
    except (ValueError, AttributeError, UnicodeDecodeError):
        return None


def previous_base_date() -> str | None:
    """빌드 직전의 기준일.

    워크플로에서는 빌드 전에 기록해 둔 PREVIOUS_BASE_DATE를 쓴다(이 스텝은 커밋
    이후에 돌아서 HEAD가 이미 새 파일이다). 로컬 실행 등 환경변수가 없을 때만
    HEAD에서 읽는다.
    """
    from_env = os.environ.get("PREVIOUS_BASE_DATE")
    if from_env:
        return from_env

    repo_rel = os.path.relpath(
        OUTPUT_PATH, os.path.join(os.path.dirname(__file__), "..")
    ).replace(os.sep, "/")
    try:
        # text=True를 쓰면 파이썬이 로케일 코덱(윈도우 cp949)으로 디코딩해
        # UTF-8 종목명에서 터진다. 바이트로 받아 UTF-8로 직접 디코딩한다.
        raw = subprocess.run(
            ["git", "show", f"HEAD:{repo_rel}"],
            capture_output=True,
            check=True,
            cwd=os.path.join(os.path.dirname(__file__), ".."),
        ).stdout
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None  # 최초 커밋이거나 git 없음 — 비교를 건너뛴다
    return _read_base_date(raw)


def recent_trading_days(limit: int = RECENT_TRADING_DAYS) -> list[str]:
    """종가 캐시에 실제로 쌓인 거래일을 최신순 limit개 반환한다.

    공휴일 달력 대신 쓰는 진단 보조 자료다. 캐시에 날짜가 있다는 건 그날 API에
    시세가 있었다는 뜻이므로, 공휴일이든 임시휴장이든 '실제 KRX 휴장'이 그대로
    반영된다 — 어떤 달력보다 정확하다. 다만 과거만 알 뿐 '오늘 발행이 예정돼
    있었는지'는 모르므로 판정에는 쓰지 않고 사람이 볼 근거로만 노출한다.
    """
    try:
        with open(PRICE_CACHE_PATH, encoding="utf-8") as f:
            cache = json.load(f)
    except (OSError, ValueError):
        return []
    # 종목마다 상장일이 달라 시리즈 길이가 제각각이라 전 종목의 날짜를 합집합한다.
    dates = {row[0] for series in cache.values() for row in series if row}
    return sorted(dates)[-limit:]


def format_trading_days(days: list[str]) -> str:
    """'07-09 → 07-10 → 07-13(+3) → ...' 형태로. 간격이 1일 초과면 휴장 표시."""
    parts = []
    for i, d in enumerate(days):
        label = d[5:]  # MM-DD
        if i:
            gap = (dt.date.fromisoformat(d) - dt.date.fromisoformat(days[i - 1])).days
            if gap > 1:
                label += f"(+{gap})"
        parts.append(label)
    return " → ".join(parts)


def emit(line: str) -> None:
    """GitHub Actions 잡 요약에 남긴다. 로컬 실행이면 stdout만."""
    print(line)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write(line + "\n")


def main() -> None:
    with open(OUTPUT_PATH, encoding="utf-8") as f:
        meta = json.load(f)["meta"]

    base_date = meta["base_date"]
    today = dt.datetime.now(KST).date()
    stale_days = (today - dt.date.fromisoformat(base_date)).days
    prev = previous_base_date()

    emit(f"### 데이터 신선도")
    emit("")
    emit(f"- 기준일(base_date): **{base_date}** (오늘 {today} 기준 {stale_days}일 전)")
    emit(f"- 직전 배포 기준일: {prev or '(없음)'}")
    emit(f"- 종목 수: {meta.get('count')}")

    days = recent_trading_days()
    if days:
        emit(f"- 최근 실제 거래일: {format_trading_days(days)}  _(+N = 그만큼 휴장)_")

    if prev == base_date:
        # 연휴 중 실행이나 같은 날 재실행이면 정상이고, 업스트림 정체면 비정상이다.
        # 둘을 구분할 근거가 파이프라인 안에 없다. 어노테이션으로 띄우면 연휴마다
        # 울려 노이즈가 되므로, 사실만 요약에 남기고 판단은 지연일수에 맡긴다.
        emit("- 기준일이 직전 배포와 동일 — 새 영업일 데이터가 추가되지 않았습니다.")

    if stale_days > FAIL_DAYS:
        emit(f"- ❌ 기준일이 {stale_days}일 뒤처졌습니다 (허용 {FAIL_DAYS}일).")
        print(
            f"::error::기준일 {base_date}이 {stale_days}일 뒤처졌습니다. "
            f"공휴일 연휴로 설명되는 최대치(약 9일)를 넘었습니다 — 연휴 여부를 먼저 "
            "확인하고, 연휴가 아니면 공공데이터포털 발행 상태를 점검하세요. "
            "파이프라인 코드보다 업스트림이 먼저입니다."
        )
        sys.exit(1)

    if stale_days > WARN_DAYS:
        emit(
            f"- ⚠️ 기준일이 {stale_days}일 뒤처졌습니다 — **먼저 공휴일 연휴인지 "
            "확인하세요**(연휴면 정상). 연휴가 아니면 업스트림 발행 상태를 확인하세요."
        )
        print(
            f"::warning::기준일이 {stale_days}일 뒤처졌습니다. "
            "먼저 공휴일 연휴인지 확인하세요(연휴면 정상)."
        )
    else:
        emit("- ✅ 정상 범위")


if __name__ == "__main__":
    main()
