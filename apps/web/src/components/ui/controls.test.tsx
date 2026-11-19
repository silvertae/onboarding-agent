import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Badge } from './badge'
import { Button } from './button'
import { Checkbox } from './checkbox'
import { AlertDialogFooter } from './alert-dialog'
import { DialogFooter } from './dialog'
import { Input } from './input'
import { NativeSelect } from './native-select'
import { Tabs, TabsList, TabsTrigger } from './tabs'
import { Textarea } from './textarea'

// system.md "버튼·입력 크기": 입력 40, 로그인·신입 양식은 44. 모든 입력은 카드 흰 바탕.
describe('폼 컨트롤 크기', () => {
  it('Input은 기본 40px, size="lg"면 44px', () => {
    render(
      <>
        <Input aria-label="기본" />
        <Input aria-label="큰" size="lg" />
      </>,
    )
    expect(screen.getByLabelText('기본')).toHaveClass('h-10', 'bg-card')
    expect(screen.getByLabelText('큰')).toHaveClass('h-11')
    expect(screen.getByLabelText('큰')).not.toHaveClass('h-10')
  })

  it('NativeSelect는 Input과 같은 높이·바탕에 화살표 아이콘을 그린다', () => {
    const { container } = render(
      <NativeSelect aria-label="입사자" className="w-40">
        <option value="">전체</option>
      </NativeSelect>,
    )
    const select = screen.getByRole('combobox', { name: '입사자' })
    expect(select).toHaveClass('h-10', 'bg-card', 'appearance-none')
    expect(select.parentElement).toHaveClass('w-40')
    expect(container.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument()
  })

  // system.md "표 머리의 거르기 select": 탭 묶음과 같은 회색 상자·높이 38, 라벨을 안에 두고 테두리 없음
  it('NativeSelect variant="filter"는 회색 상자 안에 라벨을 두고, 그 라벨이 접근 이름이다', () => {
    render(
      <NativeSelect variant="filter" label="입사자">
        <option value="">전체</option>
      </NativeSelect>,
    )
    const select = screen.getByRole('combobox', { name: '입사자' })
    const box = select.closest('[data-slot="native-select"]')
    expect(box).toHaveClass('bg-secondary', 'rounded-[10px]', 'h-9.5')
    expect(box).toHaveTextContent('입사자')
    expect(select).toHaveClass('font-semibold', 'appearance-none')
    expect(select).not.toHaveClass('h-10', 'bg-card')
  })

  // Chrome은 select를 마우스로 눌러도 :focus-visible로 본다. 고른 뒤 링이 남지 않게 마우스로 누른 동안은 링 클래스를 뗀다.
  it('NativeSelect variant="filter"의 포커스 링은 마우스로 누른 뒤에는 없고, 키를 누르면 다시 생긴다', () => {
    render(
      <NativeSelect variant="filter" label="입사자">
        <option value="">전체</option>
        <option value="h1">김하늘</option>
      </NativeSelect>,
    )
    const select = screen.getByRole('combobox', { name: '입사자' })
    const box = select.closest('[data-slot="native-select"]')
    expect(box).toHaveClass('has-[select:focus-visible]:ring-2')

    fireEvent.pointerDown(select)
    expect(box).not.toHaveClass('has-[select:focus-visible]:ring-2')

    fireEvent.keyDown(select, { key: 'ArrowDown' })
    expect(box).toHaveClass('has-[select:focus-visible]:ring-2')

    fireEvent.pointerDown(select)
    fireEvent.blur(select)
    expect(box).toHaveClass('has-[select:focus-visible]:ring-2')
  })

  it('NativeSelect size="lg"는 44px', () => {
    render(
      <NativeSelect aria-label="팀" size="lg">
        <option>AI팀</option>
      </NativeSelect>,
    )
    expect(screen.getByRole('combobox', { name: '팀' })).toHaveClass('h-11')
  })

  it('Textarea는 흰 바탕에 세로로만 늘린다', () => {
    render(<Textarea aria-label="사유" />)
    expect(screen.getByLabelText('사유')).toHaveClass('bg-card', 'resize-y')
  })

  it('Checkbox는 라벨로 이름이 붙고 눌러서 켠다', async () => {
    render(
      <label>
        <Checkbox /> SAP 계정
      </label>,
    )
    const box = screen.getByRole('checkbox', { name: 'SAP 계정' })
    expect(box).not.toBeChecked()
    await userEvent.click(box)
    expect(box).toBeChecked()
  })

  it('비활성 주 버튼은 흐린 파랑이 아니라 회색이다(시안 .btn[disabled])', () => {
    render(<Button disabled>완료</Button>)
    expect(screen.getByRole('button', { name: '완료' })).toHaveClass('disabled:bg-track', 'disabled:text-disabled-foreground')
  })
})

// system.md "모션": 이름 붙인 속성만 150ms 커스텀 ease-out으로 바꾸고, 누르면 0.97로 줄어든다.
describe('모션', () => {
  it('Button은 transition-all 대신 이름 붙인 속성만 전환하고 누르면 scale 0.97', () => {
    render(<Button>저장</Button>)
    const button = screen.getByRole('button', { name: '저장' })
    expect(button.className).not.toMatch(/\btransition-all\b/)
    expect(button.className).not.toContain('translate-y-px')
    expect(button).toHaveClass(
      'transition-[background-color,border-color,color,box-shadow,scale]',
      'duration-150',
      'ease-out-ui',
      'active:not-aria-[haspopup]:scale-[0.97]',
      'motion-reduce:transition-none',
      'motion-reduce:active:not-aria-[haspopup]:scale-100',
    )
  })

  it('Badge도 transition-all을 쓰지 않는다', () => {
    render(<Badge variant="todo">할 일</Badge>)
    const badge = screen.getByText('할 일')
    expect(badge.className).not.toMatch(/\btransition-all\b/)
    expect(badge).toHaveClass('duration-150', 'ease-out-ui', 'motion-reduce:transition-none')
  })
})

// system.md "대화 상자 버튼 줄": 회색 띠는 위아래 12(36 버튼 → 60)로 낮게 둔다.
describe('대화 상자 버튼 줄', () => {
  it('Dialog·AlertDialog footer는 좌우 16, 위아래 12', () => {
    render(
      <>
        <DialogFooter data-testid="dialog" />
        <AlertDialogFooter data-testid="alert" />
      </>,
    )
    for (const id of ['dialog', 'alert']) {
      expect(screen.getByTestId(id)).toHaveClass('px-4', 'py-3', '-mb-4', 'bg-muted/50')
      expect(screen.getByTestId(id)).not.toHaveClass('p-4')
    }
  })
})

describe('좁은 화면', () => {
  it('세그먼트 탭 목록은 패널보다 넓으면 줄이지 않고 가로로 넘겨 본다(스크롤바 숨김)', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList aria-label="보기">
          <TabsTrigger value="a">확인 대기</TabsTrigger>
          <TabsTrigger value="b">전체</TabsTrigger>
        </TabsList>
      </Tabs>,
    )
    expect(screen.getByRole('tablist')).toHaveClass('max-w-full', 'overflow-x-auto', '[scrollbar-width:none]')
    expect(screen.getByRole('tab', { name: '확인 대기' })).toHaveClass('shrink-0', 'whitespace-nowrap')
  })
})
