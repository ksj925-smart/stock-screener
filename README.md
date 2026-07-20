# stock-screener

Apps in Toss 프로젝트입니다.

## 시작하기

```bash
npm run dev
```

## 배포하기

- 앱인토스 배포 API 키는 [앱인토스 콘솔](https://apps-in-toss.toss.im/) > 워크스페이스 > API 키 > 콘솔 API 키 에서 발급받을 수 있어요.

```bash
npm run build
npm run deploy
```

## 운영 메모

### 스케줄 자동 비활성화 (60일 무활동)

공개 리포에서 **60일간 커밋이 없으면** GitHub이 스케줄 워크플로를 자동으로
끕니다. 워크플로가 실행되는 것 자체는 '활동'으로 집계되지 않고, **커밋만**
집계됩니다.

평상시엔 파이프라인이 거래일마다 `chore: update screener.json`을 커밋하므로
공백은 최장 9일(설·추석 연휴) 수준이라 도달하지 않습니다. 다만 업스트림
장애 등으로 커밋이 오래 끊기면 발생할 수 있습니다.

**증상**: 스케줄 실행이 전혀 생기지 않고, 앱의 기준일이 며칠째 그대로.

**확인**

```bash
gh api repos/ksj925-smart/stock-screener/actions/workflows \
  -q '.workflows[] | "\(.name): \(.state)"'
# active 가 아니라 disabled_inactivity 면 이 케이스
```

**재활성화** (Actions 탭 배너 클릭 또는)

```bash
gh api -X PUT repos/ksj925-smart/stock-screener/actions/workflows/314264133/enable
```

GitHub이 비활성화 시 알림을 보내므로, 메일을 받으면 위 명령 한 번으로
복구됩니다.

## 유용한 링크

- [앱인토스 콘솔](https://apps-in-toss.toss.im/)
- [앱인토스 개발자센터](https://developers-apps-in-toss.toss.im/)
- [앱인토스 개발자 커뮤니티](https://techchat-apps-in-toss.toss.im/)

AI를 사용하시는 경우 [여기](https://developers-apps-in-toss.toss.im/development/llms.html)를 확인해보세요.
