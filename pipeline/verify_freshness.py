"""빌드된 screener.json의 데이터 신선도를 검증한다 (워크플로 게이트).

이 스텝이 필요한 이유:
파이프라인은 '가장 최근에 데이터가 있는 기준일'을 찾아 쓰기 때문에, 공공데이터
API가 새 영업일 데이터를 아직 안 올렸으면 지난 기준일로 조용히 성공한다.
커밋 단계도 `git diff --quiet ||` 로 변경 없으면 넘어가므로 워크플로는 초록
체크로 끝난다. 그 결과 "실행은 성공했는데 앱 날짜가 그대로"인 상황이 며칠간
드러나지 않는다(2026-07-16~19 실제 발생: 업스트림이 07-15에서 멈춤).

그래서 여기서 기준일을 항상 잡 요약에 노출하고, 명백히 비정상인 지연일 때만
실패시킨다. 임계값을 넉넉히 둔 건 연휴로 인한 정상 지연을 빨간불로 만들지
않기 위해서다 — 잦은 오탐은 경고를 무시하게 만든다.

정상 지연(스케줄 실행 기준 평일 14:30 KST):
  화~금 = 1일, 월 = 3일(금요일치), 연휴가 끼면 +연휴일수.
  설·추석 연휴까지 감안해 6일까지는 정상 범위로 본다.
"""

import datetime as dt
import json
import os
import subprocess
import sys

from config import OUTPUT_PATH

# 윈도우 콘솔 기본 코덱(cp949)은 이모지를 못 찍어 로컬 실행이 죽는다.
# Actions(리눅스/UTF-8)에선 무해하고, 로컬에선 깨져도 죽지는 않게 한다.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

KST = dt.timezone(dt.timedelta(hours=9))

# 이 일수를 넘게 뒤처지면 경고(주의 환기), 더 넘으면 실패(업스트림 이상 확정)
WARN_DAYS = 3
FAIL_DAYS = 6


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

    if prev == base_date:
        # 같은 날 재실행이면 정상이고, 업스트림 정체면 비정상이다. 둘을 구분할
        # 근거가 파이프라인 안에 없으므로 사실만 알리고 판단은 지연일수에 맡긴다.
        emit(f"- ⚠️ 기준일이 직전 배포와 동일 — 새 영업일 데이터가 추가되지 않았습니다.")
        print(f"::warning::기준일이 {base_date}에서 갱신되지 않았습니다.")

    if stale_days > FAIL_DAYS:
        emit(f"- ❌ 기준일이 {stale_days}일 뒤처졌습니다 (허용 {FAIL_DAYS}일).")
        print(
            f"::error::기준일 {base_date}이 {stale_days}일 뒤처졌습니다. "
            "공공데이터포털이 신규 영업일 시세를 발행하지 않았을 가능성이 큽니다 "
            "— 파이프라인 코드보다 업스트림 상태를 먼저 확인하세요."
        )
        sys.exit(1)

    if stale_days > WARN_DAYS:
        emit(f"- ⚠️ 기준일이 {stale_days}일 뒤처졌습니다 (연휴가 아니면 업스트림 확인 필요).")
        print(f"::warning::기준일이 {stale_days}일 뒤처졌습니다.")
    else:
        emit(f"- ✅ 정상 범위")


if __name__ == "__main__":
    main()
