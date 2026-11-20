import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BusinessCard } from './BusinessCard'

describe('BusinessCard', () => {
  it('신입 화면·업무함이 같은 명함 모양(로고, 이름·직급, 영문 이름·직급, 부문, 메일·연락처)을 쓴다', () => {
    render(
      <BusinessCard
        name="김하늘"
        jobTitle="사원"
        englishName="Haneul Kim"
        englishTitle="Associate"
        division="AI 그룹 / AI본부"
        englishDivision="Artificial Intelligence Group"
        email="haneul.kim@blueward.co.kr"
        phone="010-0000-0000"
      />,
    )
    expect(screen.getByRole('img', { name: 'Blueward' })).toBeInTheDocument()
    expect(screen.getByText('김하늘')).toBeInTheDocument()
    expect(screen.getByText('사원')).toBeInTheDocument()
    expect(screen.getByText('Haneul Kim')).toBeInTheDocument()
    expect(screen.getByText('Associate')).toBeInTheDocument()
    expect(screen.getByText('AI 그룹 / AI본부')).toBeInTheDocument()
    expect(screen.getByText('Artificial Intelligence Group')).toBeInTheDocument()
    expect(screen.getByText('haneul.kim@blueward.co.kr')).toBeInTheDocument()
    expect(screen.getByText('010-0000-0000')).toBeInTheDocument()
  })

  it('부문이 없으면 부문 줄을 그리지 않는다', () => {
    render(<BusinessCard name="김하늘" englishName="Haneul Kim" division={null} />)
    expect(screen.queryByTestId('card-division')).not.toBeInTheDocument()
  })

  it('영문 이름이 비면 자리 표시 문구를 보인다', () => {
    render(<BusinessCard name="김하늘" englishName="  " />)
    expect(screen.getByText('영문 이름')).toBeInTheDocument()
  })
})
