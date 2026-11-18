import { Plus } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { DIFFICULTY_LABEL, EXAM_STATUS_LABEL, useExams } from './exams'

export function ExamListPage() {
  const exams = useExams()

  return (
    <main className="mx-auto grid max-w-[1376px] gap-6 p-6 lg:p-8">
      <PageHeader
        title="시험 출제"
        description="주제와 난이도를 넣으면 문제·모범 답안·채점 기준 초안을 만들어 드려요."
        actions={
          <Link to="/team/exams/new" className={cn(buttonVariants({ size: 'lg' }), 'text-white hover:text-white')}>
            <Plus />
            새 시험 만들기
          </Link>
        }
      />

      <section className="rounded-[18px] border border-border bg-card">
        {exams.isLoading ? (
          <p role="status" className="px-6 py-12 text-center text-sm text-muted-foreground">불러오는 중…</p>
        ) : exams.isError ? (
          <p role="alert" className="px-6 py-12 text-center text-sm text-destructive">시험 목록을 불러오지 못했어요.</p>
        ) : !exams.data?.length ? (
          <p className="px-6 py-12 text-center text-sm text-muted-foreground">아직 만든 시험이 없어요. "새 시험 만들기"로 시작해 보세요.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">제목</TableHead>
                <TableHead>주제</TableHead>
                <TableHead>난이도</TableHead>
                <TableHead>문항 수</TableHead>
                <TableHead className="pr-6">상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exams.data.map((exam) => (
                <TableRow key={exam.id}>
                  <TableCell className="pl-6 font-medium">
                    <Link to={`/team/exams/${exam.id}`}>{exam.title}</Link>
                  </TableCell>
                  <TableCell>{exam.topic}</TableCell>
                  <TableCell>{DIFFICULTY_LABEL[exam.difficulty]}</TableCell>
                  <TableCell>{exam.question_count}</TableCell>
                  <TableCell className="pr-6">
                    <Badge variant={exam.status === 'final' ? 'done' : 'todo'}>{EXAM_STATUS_LABEL[exam.status]}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </main>
  )
}
