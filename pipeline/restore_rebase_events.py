"""data/rebase_events.json 일회성 복원 — price_cache.json의 git 이력에서 추출.

연속한 두 커밋 사이에 같은 날짜 행의 종가가 바뀐 종목은 그 사이 리베이스된 것이다
(append_prices는 과거 행 종가를 오직 리베이스로만 바꾼다). 이벤트 일자는 새 커밋에서
그 종목의 마지막 행 날짜 = 분할이 반영된 첫 거래일.
임계값을 쓰지 않는다. 사용: python restore_rebase_events.py (pipeline 폴더, git 저장소 안)
"""

import json
import subprocess

from price_cache import load_events, record_event, save_events

PATH = "data/price_cache.json"


def _load(commit: str) -> dict:
    return json.loads(subprocess.check_output(["git", "show", f"{commit}:{PATH}"]))


def main() -> None:
    log = subprocess.check_output(
        ["git", "log", "--format=%h", "--", PATH], text=True
    ).split()[::-1]
    events = load_events()
    added = 0
    prev = _load(log[0])
    for commit in log[1:]:
        cur = _load(commit)
        for code, rows in cur.items():
            old = {r[0]: r[1] for r in prev.get(code, [])}
            if any(r[0] in old and old[r[0]] != r[1] for r in rows):
                added += record_event(events, code, rows[-1][0])
        prev = cur
    save_events(events)
    print(f"커밋 {len(log)}개 → 이벤트 {added}건, 종목 {len(events)}개")


if __name__ == "__main__":
    main()
