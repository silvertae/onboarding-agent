import { Plus, X } from 'lucide-react'
import { useId, useState } from 'react'
import { SegmentedRadio } from '@/components/SegmentedRadio'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { STAGE_LABEL } from '@/lib/labels'
import type { TaskStage, TaskTemplate } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import {
  CHECKLIST_ITEM_MAX,
  CHECKLIST_MAX,
  checklistMissing,
  DAYS_MAX,
  DESCRIPTION_MAX,
  PREREQUISITE_MAX,
  TITLE_MAX,
} from './templateInput'
import type { CompletionMode, TaskKind, TemplateInput } from './templates'

type Props = {
  value: TemplateInput
  onChange: (value: TemplateInput) => void
  // 사용 중(또는 보관)이라 제목·안내문 외 칸을 고칠 수 없다
  lockedFields: boolean
  // 평가 종류는 교육 담당자만
  allowAssessment: boolean
  // "이 신입에게 과제 추가" 대화 상자는 선행 과제를 두지 않는다
  showPrerequisites: boolean
  // 같은 담당 범위의 사용 중인 기본 과제(자기 자신 제외)
  prerequisiteOptions: TaskTemplate[]
}

const KIND_OPTIONS: { value: TaskKind; label: string }[] = [
  { value: 'ops', label: '안내' },
  { value: 'read', label: '읽기' },
  { value: 'practice', label: '실습' },
  { value: 'setup', label: '체크리스트' },
  { value: 'assessment', label: '평가' },
]
// 입력 양식(기본 과제)은 새로 고를 수 없고, 그 과제의 종류도 바꿀 수 없다
const INPUT_KIND_OPTION = { value: 'input' as TaskKind, label: '입력 양식', disabled: true }

const MODE_OPTIONS: { value: CompletionMode; label: string }[] = [
  { value: 'self', label: '신입이 완료' },
  { value: 'confirm', label: '담당자 확인' },
  { value: 'staff_only', label: '담당자만 처리' },
]

const STAGES = Object.keys(STAGE_LABEL) as TaskStage[]

const CHECKLIST_MISSING = '체크리스트 항목을 하나 이상 넣어 주세요.'

// 읽기 전용 칸(system.md): 흐리게 하지 않고 bg-muted 바탕에 글자는 그대로 둔다
const READ_ONLY = 'disabled:bg-muted disabled:text-foreground disabled:opacity-100'
const READ_ONLY_SELECT = '[&_select:disabled]:bg-muted [&_select:disabled]:text-foreground [&_select:disabled]:opacity-100'
// 체크박스는 막혀도 체크된 상태는 흐리지 않는다(고르지 않은 칸만 흐림, SegmentedRadio와 같은 기준)
const READ_ONLY_CHECK = 'disabled:aria-checked:opacity-100'
const LABEL = 'text-label font-semibold'
const LEGEND = 'mb-1.5 text-label font-semibold'
// 넓으면 두 칸, 좁으면 한 칸(시안 .form-grid)
const TWO_COLUMNS = 'grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-5'
const CHECK_LABEL = 'flex cursor-pointer items-center gap-2.5 text-sm has-[:disabled]:cursor-not-allowed'
// 세그먼트 칸은 같은 너비로 나누되 글자보다 좁아지지 않게 한다("체크리스트"가 줄바꿈되지 않게. 시안 .seg label flex:1)
const SEGMENT_FIT = 'auto-cols-[minmax(max-content,1fr)]'

// S12 편집 칸. S12 화면과 "이 신입에게 과제 추가" 대화 상자가 함께 쓴다. 저장·동작 버튼은 쓰는 쪽이 둔다.
export function TemplateForm({ value, onChange, lockedFields, allowAssessment, showPrerequisites, prerequisiteOptions }: Props) {
  const id = useId()
  const [newItem, setNewItem] = useState('')
  const set = (patch: Partial<TemplateInput>) => onChange({ ...value, ...patch })

  function changeKind(kind: TaskKind) {
    set({
      kind,
      // 평가는 담당자만 처리로 고정, 체크리스트 항목은 체크리스트일 때만 둔다
      completionMode: kind === 'assessment' ? 'staff_only' : value.completionMode,
      checklist: kind === 'setup' ? (value.checklist ?? []) : null,
    })
  }

  const kindOptions =
    value.kind === 'input'
      ? [INPUT_KIND_OPTION]
      : KIND_OPTIONS.filter((o) => o.value !== 'assessment' || allowAssessment || value.kind === 'assessment').map((o) => ({
          ...o,
          disabled: lockedFields,
        }))
  const modeLocked = lockedFields || value.kind === 'assessment'

  const items = value.checklist ?? []
  const missing = checklistMissing(value)
  function setItem(index: number, text: string) {
    set({ checklist: items.map((item, i) => (i === index ? text : item)) })
  }
  function addItem() {
    const text = newItem.trim()
    if (!text || items.length >= CHECKLIST_MAX) return
    set({ checklist: [...items, text] })
    setNewItem('')
  }

  const daysInvalid = !Number.isInteger(value.daysInStage) || value.daysInStage < 0 || value.daysInStage > DAYS_MAX

  function togglePrerequisite(code: string, checked: boolean) {
    set({
      prerequisiteCodes: checked ? [...value.prerequisiteCodes, code] : value.prerequisiteCodes.filter((c) => c !== code),
    })
  }
  const prerequisitesFull = value.prerequisiteCodes.length >= PREREQUISITE_MAX

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-title`} className={LABEL}>
          제목
        </Label>
        <Input
          id={`${id}-title`}
          value={value.title}
          maxLength={TITLE_MAX}
          className={READ_ONLY}
          onChange={(e) => set({ title: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-description`} className={LABEL}>
          안내문
        </Label>
        <Textarea
          id={`${id}-description`}
          value={value.description}
          maxLength={DESCRIPTION_MAX}
          className={READ_ONLY}
          onChange={(e) => set({ description: e.target.value })}
        />
      </div>

      <div className={TWO_COLUMNS}>
        <fieldset className="min-w-0">
          <legend className={LEGEND}>종류</legend>
          <SegmentedRadio name={`${id}-kind`} options={kindOptions} value={value.kind} onChange={changeKind} className={SEGMENT_FIT} />
        </fieldset>
        <fieldset className="min-w-0">
          <legend className={LEGEND}>완료 방식</legend>
          <SegmentedRadio
            name={`${id}-mode`}
            options={MODE_OPTIONS.map((o) => ({ ...o, disabled: modeLocked }))}
            value={value.completionMode}
            onChange={(completionMode) => set({ completionMode })}
            className={SEGMENT_FIT}
          />
        </fieldset>
      </div>

      <div className={TWO_COLUMNS}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-stage`} className={LABEL}>
            단계
          </Label>
          <NativeSelect
            id={`${id}-stage`}
            value={value.stage}
            disabled={lockedFields}
            className={READ_ONLY_SELECT}
            onChange={(e) => set({ stage: e.target.value as TaskStage })}
          >
            {STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {STAGE_LABEL[stage]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-days`} className={LABEL}>
            기한
          </Label>
          <div className="flex items-center gap-2 text-sm whitespace-nowrap">
            <span>단계 시작 후</span>
            <Input
              id={`${id}-days`}
              type="number"
              inputMode="numeric"
              min={0}
              max={DAYS_MAX}
              step={1}
              value={Number.isNaN(value.daysInStage) ? '' : value.daysInStage}
              disabled={lockedFields}
              aria-invalid={daysInvalid || undefined}
              className={cn('w-22 tabular-nums', READ_ONLY)}
              onChange={(e) => set({ daysInStage: e.target.value === '' ? Number.NaN : Number(e.target.value) })}
            />
            <span>일</span>
          </div>
        </div>
      </div>

      <label className={cn(CHECK_LABEL, 'w-fit')}>
        <Checkbox
          checked={value.allowNa}
          disabled={lockedFields}
          className={READ_ONLY_CHECK}
          onCheckedChange={(checked) => set({ allowNa: checked === true })}
        />
        해당 없음 허용
      </label>

      {value.kind === 'setup' && (
        <fieldset className="min-w-0">
          <legend className={LEGEND}>체크리스트 항목</legend>
          <div className="flex flex-col gap-2">
            {items.map((item, index) => (
              <div key={index} className="flex items-center gap-1.5">
                <Input
                  aria-label={`항목 ${index + 1}`}
                  value={item}
                  maxLength={CHECKLIST_ITEM_MAX}
                  disabled={lockedFields}
                  className={READ_ONLY}
                  onChange={(e) => setItem(index, e.target.value)}
                />
                {!lockedFields && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title="지우기"
                    aria-label={`${item.trim() || `항목 ${index + 1}`} 지우기`}
                    className="text-[var(--text-secondary)] hover:bg-alert-err-bg hover:text-destructive"
                    onClick={() => set({ checklist: items.filter((_, i) => i !== index) })}
                  >
                    <X aria-hidden />
                  </Button>
                )}
              </div>
            ))}
            {!lockedFields && items.length < CHECKLIST_MAX && (
              <div className="flex items-center gap-1.5">
                <Input
                  aria-label="새 항목"
                  value={newItem}
                  maxLength={CHECKLIST_ITEM_MAX}
                  aria-invalid={missing || undefined}
                  aria-describedby={missing ? `${id}-checklist-error` : undefined}
                  onChange={(e) => setNewItem(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
                    e.preventDefault()
                    addItem()
                  }}
                />
                <Button type="button" variant="ghost" disabled={!newItem.trim()} onClick={addItem}>
                  <Plus aria-hidden />
                  추가
                </Button>
              </div>
            )}
            {missing && (
              <p id={`${id}-checklist-error`} className="text-sm text-destructive">
                {CHECKLIST_MISSING}
              </p>
            )}
          </div>
        </fieldset>
      )}

      {showPrerequisites && prerequisiteOptions.length > 0 && (
        <fieldset className="min-w-0">
          <legend className={LEGEND}>
            선행 과제 <span className="text-xs font-normal text-muted-foreground">최대 {PREREQUISITE_MAX}개</span>
          </legend>
          <div className="flex max-h-52 flex-col overflow-y-auto rounded-lg border border-input">
            {prerequisiteOptions.map((t) => {
              const checked = value.prerequisiteCodes.includes(t.code)
              return (
                <label key={t.id} className={cn(CHECK_LABEL, 'border-b border-border px-3 py-2.5 last:border-b-0')}>
                  <Checkbox
                    checked={checked}
                    disabled={lockedFields || (!checked && prerequisitesFull)}
                    className={READ_ONLY_CHECK}
                    onCheckedChange={(next) => togglePrerequisite(t.code, next === true)}
                  />
                  <span className="w-11 shrink-0 text-xs text-muted-foreground tabular-nums">{t.code}</span>{' '}
                  <span className="min-w-0">{t.title}</span>
                </label>
              )
            })}
          </div>
        </fieldset>
      )}
    </div>
  )
}
