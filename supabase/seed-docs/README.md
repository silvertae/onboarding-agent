# 가상 시드 문서

규정 문서 검색(조항 색인) 시연용 파일이다. 회사·금액·내용은 모두 가상이며 실제 문서가 아니다. 사람 이름은 없다.

| 파일 | 제목 | 내용 |
|---|---|---|
| `welfare-policy.docx` | 복리후생 규정(가상) | 제1~16조. 제8조 경조금(표 포함), 제9조 조위금, 제12조 복지포인트, 제14조 야근 식대 |
| `work-rules.pdf` | 취업규칙 발췌(가상) | 근무시간, 제21조 연차휴가, 제30조 재택근무 등 |

동호회 가입비와 출장비는 일부러 적지 않았다(데모에서 미답변으로 남기는 질문).

## 다시 만들기

내용은 `services/agent/scripts/make_seed_docs.py`에 텍스트로 있다. 고친 뒤 아래 순서로 다시 만든다. 새 Python 의존성은 없다.

1. 저장소 루트에서 docx와 PDF 원문(HTML)을 만든다. HTML은 저장소 밖 임시 경로에 둔다.

   ```bash
   cd services/agent
   uv run python scripts/make_seed_docs.py /tmp/work-rules.html
   ```

2. PDF는 헤드리스 Chrome으로 한 번 인쇄한다(`npm --prefix scripts/design ci`로 Playwright를 먼저 설치한다). 스크립트는 저장소 밖에 둔다.

   ```js
   const { chromium } = require('<저장소 경로>/scripts/design/node_modules/playwright');
   (async () => {
     const b = await chromium.launch({ channel: 'chrome' });
     const p = await b.newPage();
     await p.setContent(require('fs').readFileSync('/tmp/work-rules.html', 'utf8'));
     await p.pdf({ path: '<저장소 경로>/supabase/seed-docs/work-rules.pdf', format: 'A4',
       margin: { top: '20mm', bottom: '20mm', left: '18mm', right: '18mm' } });
     await b.close();
   })();
   ```

3. `cd services/agent && uv run pytest tests/test_seed_docs.py -q`로 확인한다. docx는 생성기 결과와 글자가 같아야 한다.
