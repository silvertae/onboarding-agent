// 표의 선택·강조 행(시안 .tbl tr.sel td).
// 자동 표 배치는 칸 너비가 소수점(예: 915.27px)이 되고, Chrome은 행 배경을 칸마다 따로 그리면서 경계 픽셀을
// 반만 칠한다. 그래서 tr에 배경을 주면(칸에 줘도) 칸 사이에 밝은 1px 세로줄이 남는다.
// 배경은 칸(td)에 칠하고, 오른쪽으로 1px 그림자를 같은 색으로 깔아 이음새를 덮는다.
export const ROW_SELECTED = '[&>td]:bg-accent [&>td]:shadow-[1px_0_0_var(--accent)]'

// 선택되지 않은 행에만 쓴다(선택 행에 같이 주면 hover가 선택 색을 덮는다).
export const ROW_HOVER = 'hover:[&>td]:bg-surface-subtle hover:[&>td]:shadow-[1px_0_0_var(--surface-subtle)]'

// 키보드 포커스는 선택과 같은 색(S9 업무함 행)
export const ROW_FOCUS = 'focus-visible:outline-none focus-visible:[&>td]:bg-accent focus-visible:[&>td]:shadow-[1px_0_0_var(--accent)]'
