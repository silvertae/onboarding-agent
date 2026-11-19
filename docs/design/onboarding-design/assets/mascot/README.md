# 젤리 큐브 마스코트

온보딩 에이전트를 나타내는 캐릭터. 이미지가 아니라 CSS로 그린다.

| 파일 | 내용 |
|---|---|
| `jelly-mascot.html` | 원본 디자인(Leo). 색·질감·움직임의 기준 |
| `jelly-mascot-poses.html` | 원본 CSS에 크기 변수(`--size`, `--k`), 포즈(`is-wave`, `is-sit`), 움직임 켜기(`is-idle`)를 더한 견본. 포즈 3종 × 크기 단계 |
| `apps/web/public/favicon.svg` | 같은 디자인을 작은 크기용 SVG로 줄인 파비콘(Vite 기본 아이콘을 대체) |
| `apps/web/public/apple-touch-icon.png` | 180×180, 배경 `#eef3fa` |

- 포즈: `stand` 서 있음, `wave` 오른팔을 들어 흔듦, `sit` 몸을 내리고 발을 앞으로 모음.
- 반투명이라 뒤 배경이 비친다. 파란 면(채운 버튼 등) 위에서는 잘 안 보인다.
- 시안에서는 이 견본 CSS를 옮긴 `../ui.css`의 `.mascot`(크기 클래스 `s-20`~`s-160`)을 쓴다. 쓰는 자리·크기·색·모션 규칙은 `.interface-design/system.md` "마스코트".
