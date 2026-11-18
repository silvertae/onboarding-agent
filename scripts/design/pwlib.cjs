// PR용 화면 전·후 스크린샷 도우미(scripts/design/README.md). 호출마다 자기 브라우저를 띄우므로 여러 세션이 동시에 써도 섞이지 않는다.
// 설치: npm --prefix scripts/design ci
// 사용: const pw = require('<저장소>/scripts/design/pwlib.cjs')
//   await pw.withPage(async (page) => { await pw.login(page, BASE, '신입'); await pw.shot(page, OUT, 'S2') })
//   await pw.compare(SHOTS_DIR, [{ title, shot, clip: [x, y, w, h] }], OUT_DIR)  // SHOTS_DIR/before·after → cmp-1.png …
// 브라우저: 기본은 설치된 Chrome(channel 'chrome'). PW_CHANNEL= (빈 값)이면 Playwright 내장 Chromium(npx playwright install chromium 필요).
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

async function withPage(fn, { width = 1440, height = 900 } = {}) {
  const channel = process.env.PW_CHANNEL ?? 'chrome'
  const browser = await chromium.launch(channel ? { channel } : {})
  try {
    const page = await browser.newPage({ viewport: { width, height } })
    return await fn(page)
  } finally {
    await browser.close()
  }
}

// 개발 모드 로그인 화면의 데모 계정 버튼: '신입' | '교육 담당자' | '인사' | '총무' | '회계'
async function login(page, base, label) {
  await page.goto(`${base}/login`)
  await page.getByTestId('demo-accounts').getByRole('button', { name: label, exact: true }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 })
  await page.waitForTimeout(1500)
}

async function logout(page) {
  await page.getByRole('button', { name: '로그아웃' }).click()
  await page.waitForURL(/login/)
}

async function shot(page, dir, name, { fullPage = false } = {}) {
  fs.mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage })
}

// 수정 전·후를 위아래로 붙인 비교 이미지. clip은 원본 화면 좌표(px).
async function compare(shotsDir, spec, outDir) {
  fs.mkdirSync(outDir, { recursive: true })
  const pairs = spec
    .map((p, i) => {
      // clipBefore/clipAfter: 스크롤 위치가 달라 전·후 좌표가 다를 때
      const frame = (kind) => {
        const [x, y, w, h] = (kind === 'before' ? p.clipBefore : p.clipAfter) || p.clip
        return `<div class="lbl">${kind === 'before' ? '수정 전' : '수정 후'}</div><div class="crop" style="width:${w}px;height:${h}px"><img src="file://${path.join(shotsDir, kind, p.shot + '.png')}" style="left:-${x}px;top:-${y}px"></div>`
      }
      return `<section class="pair" id="p${i}"><h2>${p.title}</h2>${frame('before')}${frame('after')}</section>`
    })
    .join('\n')
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#e9e9ee;font-family:-apple-system,"Apple SD Gothic Neo",sans-serif}.pair{display:inline-flex;flex-direction:column;gap:6px;padding:16px;background:#fff;margin:12px}h2{margin:0 0 4px;font-size:15px}.lbl{font-size:12px;font-weight:600;color:#515154}.crop{position:relative;overflow:hidden;border:1px solid #d2d2d7;border-radius:6px}.crop img{position:absolute}</style>${pairs}`
  const file = path.join(outDir, 'compare.html')
  fs.writeFileSync(file, html)
  return withPage(
    async (page) => {
      await page.goto(`file://${file}`)
      await page.waitForLoadState('load')
      const out = []
      const n = await page.locator('.pair').count()
      for (let i = 0; i < n; i++) {
        const f = path.join(outDir, `cmp-${i + 1}.png`)
        await page.locator('.pair').nth(i).screenshot({ path: f })
        out.push(f)
      }
      return out
    },
    { width: 1600, height: 900 },
  )
}

module.exports = { withPage, login, logout, shot, compare }
