import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BusinessCard } from './BusinessCard'

describe('BusinessCard', () => {
  it('신입 화면·업무함이 같은 명함 모양(로고 이미지, 이름·직급·팀, 영문 이름, 메일)을 쓴다', () => {
    render(<BusinessCard name="김하늘" jobTitle="사원" teamName="AI팀" englishName="Haneul Kim" email="newhire@demo.test" />)
    expect(screen.getByRole('img', { name: 'Blueward' })).toBeInTheDocument()
    expect(screen.getByText('김하늘')).toBeInTheDocument()
    expect(screen.getByText('사원 · AI팀')).toBeInTheDocument()
    expect(screen.getByText('Haneul Kim')).toBeInTheDocument()
    expect(screen.getByText('newhire@demo.test')).toBeInTheDocument()
  })

  it('영문 이름이 비면 자리 표시 문구를 보인다', () => {
    render(<BusinessCard name="김하늘" englishName="  " />)
    expect(screen.getByText('영문 이름')).toBeInTheDocument()
  })
})
