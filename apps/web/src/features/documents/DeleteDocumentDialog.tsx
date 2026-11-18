import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { PolicyDocument } from './documents'

type Props = {
  // 지울 문서. null이면 닫혀 있다.
  doc: PolicyDocument | null
  onOpenChange(open: boolean): void
  onConfirm(doc: PolicyDocument): void
}

// S14 지우기 확인. 조항은 문서와 함께 지워지고, 이 문서로 만든 지식은 남는다.
export function DeleteDocumentDialog({ doc, onOpenChange, onConfirm }: Props) {
  return (
    <AlertDialog open={doc !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lead font-semibold">{doc ? `'${doc.title}'을 지울까요?` : ''}</AlertDialogTitle>
          <AlertDialogDescription>
            {doc ? `조항 ${doc.clause_count}개가 함께 지워지고, 채팅은 더 이상 이 문서로 답하지 않아요. 이 문서로 만든 지식은 남아요.` : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="ghost">취소</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => doc && onConfirm(doc)}>
            지우기
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
