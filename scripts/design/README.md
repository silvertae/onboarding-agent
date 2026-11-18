# 화면 전·후 스크린샷 도구

UI를 바꾸는 PR에는 바뀐 부분의 **수정 전 → 수정 후** 비교 이미지를 넣는다(CLAUDE.md "UI 작업"). 이 폴더의 도구로 찍고, 붙이고, 올린다.

| 파일 | 하는 일 |
|---|---|
| `pwlib.cjs` | Playwright 도우미. `withPage`(브라우저 열기), `login`(개발 모드 데모 계정 버튼), `logout`, `shot`(캡처), `compare`(전·후를 위아래로 붙인 비교 이미지) |
| `push-shots.sh` | 이미지를 이미지 전용 브랜치 `pr-screenshots`에 올리고, PR 본문에 붙일 마크다운 줄을 출력한다 |

웹 앱 의존성과 섞지 않으려고 Playwright를 이 폴더에만 설치한다. 브라우저는 기본으로 설치된 Chrome을 쓴다(`PW_CHANNEL=` 빈 값이면 Playwright 내장 Chromium. 이때는 `npx --prefix scripts/design playwright install chromium`이 필요하다).

## 순서

```bash
npm --prefix scripts/design ci          # 처음 한 번
supabase start && npm run dev:web       # 로컬 웹(개발 모드라 로그인 화면에 데모 계정 버튼이 있다)
```

1. **수정 전**을 `main` 상태에서 찍는다. 코드를 바꾸기 전에 먼저 찍는다.
2. 코드를 바꾸고 같은 화면을 **수정 후**로 찍는다.
3. `compare`로 바뀐 부분만 잘라 붙인다.
4. `push-shots.sh`로 올리고, 출력된 마크다운 줄을 PR 본문 "화면 비교" 절에 붙인다.

```js
// capture.cjs — 저장소 밖 임시 폴더에 두고 `node capture.cjs before`·`node capture.cjs after`로 실행
const pw = require('/절대경로/저장소/scripts/design/pwlib.cjs')
const BASE = 'http://localhost:5173'
const kind = process.argv[2] // 'before' | 'after'
const OUT = `/tmp/shots/${kind}`

pw.withPage(async (page) => {
  await pw.login(page, BASE, '신입') // '신입' | '교육 담당자' | '인사' | '총무' | '회계'
  await pw.shot(page, OUT, 'S2')
  await page.setViewportSize({ width: 390, height: 844 }) // 신입 화면은 모바일 폭도
  await pw.shot(page, OUT, 'S2-mobile')
})
```

```js
// 둘 다 찍은 뒤: 바뀐 부분 좌표(1440×900 화면 기준)를 잘라 붙인다
pw.compare('/tmp/shots', [
  { title: 'S2 신입 홈 — 무엇이 바뀌었는지 한 줄', shot: 'S2', clip: [40, 80, 900, 240] },
  // 스크롤 위치가 달라 전·후 좌표가 다르면 clipBefore·clipAfter
  { title: '모바일', shot: 'S2-mobile', clipBefore: [0, 290, 390, 200], clipAfter: [0, 110, 390, 200] },
], '/tmp/shots/cmp')
```

```bash
bash scripts/design/push-shots.sh <브랜치-이름> /tmp/shots/cmp/cmp-*.png
# → ![cmp-1](https://raw.githubusercontent.com/<owner>/<repo>/<sha>/<브랜치-이름>/cmp-1.png) …
```

## 주의

- 화면의 사람·데이터는 가상이지만 저장소가 공개이므로, 비밀번호 입력 화면이나 토큰이 보이는 화면은 찍지 않는다. 관리자 계정이 필요하면 그 화면 캡처는 건너뛰고 PR에 적는다.
- 시연 데이터에 없는 상태(진행률, 확인 대기, 오류)는 `page.route`로 **브라우저가 받는 응답만** 바꿔 보여 준다. DB에 쓰지 않는다. 그렇게 찍었으면 PR에 적는다.
- 여러 세션이 동시에 찍을 때는 Playwright MCP(브라우저 하나를 같이 씀) 대신 이 도우미를 쓴다. 호출마다 자기 브라우저를 띄운다. 개발 서버도 세션마다 다른 포트로 띄운다(`npm --prefix apps/web run dev -- --port 5174 --strictPort`를 `scripts/with-local-env.sh`로 감싸서).
- `pr-screenshots` 브랜치는 이미지 전용이다. `main`에 머지하지 않고 지우지 않는다(지나간 PR의 이미지 주소가 이 브랜치의 커밋을 가리킨다).
