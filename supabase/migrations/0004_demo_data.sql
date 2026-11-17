-- 0004 데모 조직 데이터, 지식 시드, 데모 초기화.
-- 조직명은 회사 CI(Blueward). 팀 이름·사람·문구·수치는 가상이며 실제 사내 규정 원문이 아니다.
-- 다시 실행해도 중복을 만들지 않는다.

insert into public.orgs (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Blueward')
on conflict (id) do nothing;

insert into public.teams (id, org_id, name, org_line)
values ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'AI팀',
        '{AI팀,AI그룹,AI본부,AI부문,대표}')
on conflict (id) do nothing;

-- ── 과제 템플릿 31개 ────────────────────────────────────────────────
-- due_offset_days: day1=0, week1=5, month1=30
insert into public.task_templates
  (org_id, code, title, description, stage, department, team_id, kind, completion_mode,
   allow_na, requires_hq_access, prerequisite_codes, checklist, form_schema, due_offset_days, sort_order)
select '00000000-0000-0000-0000-000000000001'::uuid, v.code, v.title, v.description, v.stage::public.task_stage,
       v.department::public.ops_department,
       case when v.is_team then '00000000-0000-0000-0000-000000000002'::uuid end,
       v.kind::public.task_kind, v.mode::public.completion_mode, v.allow_na, v.hq, v.prereq, v.checklist, v.form,
       case v.stage when 'day1' then 0 when 'week1' then 5 else 30 end,
       v.sort_order
from (values
  -- 인사
  ('HR-02', '근태·결재 시스템 가입', '근태·결재 시스템에 회사 계정으로 가입하고 담당자에게 알려 주세요. 가입이 확인되어야 인사정보 업데이트와 근태 앱 과제가 열립니다.',
   'day1', 'hr', false, 'ops', 'confirm', false, false, '{}'::text[], null::jsonb, null::jsonb, 10),
  ('HR-03', '인사정보 업데이트', '근태·결재 시스템의 내 정보 화면에서 연락처와 비상 연락처를 입력한 뒤 제출해 주세요.',
   'week1', 'hr', false, 'ops', 'confirm', false, false, '{HR-02}', null, null, 20),
  ('HR-04', '근태 앱 설치와 기본 사용', '휴대폰에 근태 앱을 설치하고 출근·퇴근 기록을 한 번씩 해 보세요. 사용법은 채팅에서 물어볼 수 있어요.',
   'week1', 'hr', false, 'ops', 'self', false, false, '{HR-02}', null, null, 30),
  ('HR-05', '복리후생·위임결재 규정 열람', '사내 포털의 복리후생 안내와 위임결재 규정을 읽어 주세요. 궁금한 점은 채팅으로 물어보세요.',
   'day1', 'hr', false, 'read', 'self', false, false, '{}', null, null, 40),
  ('HR-06', '근로·연봉계약서 체결', '인사 담당자가 보낸 전자계약을 확인하고 서명한 뒤 제출해 주세요. 서류 파일은 이 서비스에 올리지 않습니다.',
   'week1', 'hr', false, 'ops', 'confirm', false, false, '{HR-02}', null, null, 50),
  ('HR-07', '피부양자 등록', '피부양자 등록이 필요하면 필요한 서류를 인사 담당자에게 직접 제출한 뒤 "제출"을 눌러 주세요. 대상이 없으면 "해당 없음"을 선택하세요.',
   'week1', 'hr', false, 'ops', 'confirm', true, false, '{}', null, null, 60),
  ('HR-08', '소득세 감면 신청', '감면 대상이면 신청서를 작성해 인사 담당자에게 직접 제출한 뒤 "제출"을 눌러 주세요. 대상이 아니면 "해당 없음"을 선택하세요.',
   'week1', 'hr', false, 'ops', 'confirm', true, false, '{}', null, null, 70),
  -- 총무
  ('GA-02', '지문 등록·출입 확인', '총무 담당자와 시간을 맞춰 본사 출입 등록을 합니다. 등록은 담당자가 처리합니다.',
   'day1', 'ga', false, 'ops', 'staff_only', false, true, '{}', null, null, 110),
  ('GA-03', '경비 설정·마지막 퇴근 교육', '마지막 퇴근자 경비 설정 방법을 총무 담당자에게 안내받습니다.',
   'week1', 'ga', false, 'ops', 'staff_only', false, true, '{GA-02}', null, null, 120),
  ('GA-04', '복지포인트 등록', '총무 담당자가 복지포인트를 등록합니다. 등록되면 복지카드 과제가 열립니다.',
   'week1', 'ga', false, 'ops', 'staff_only', false, false, '{}', null, null, 130),
  ('GA-05', '생일 포인트 등록', '총무 담당자가 생일 포인트를 등록합니다.',
   'week1', 'ga', false, 'ops', 'staff_only', false, false, '{}', null, null, 140),
  ('GA-06', '복지카드 수령·앱 확인', '총무팀에서 복지카드를 받고 복지 앱에서 포인트가 보이는지 확인한 뒤 제출해 주세요.',
   'week1', 'ga', false, 'ops', 'confirm', false, false, '{GA-04}', null, null, 150),
  ('GA-07', '명함 신청', '명함에 들어갈 영문 이름을 입력해 주세요. 이름·직급·팀·메일은 프로필에서 자동으로 채워집니다.',
   'week1', 'ga', false, 'input', 'confirm', false, false, '{}', null,
   '{"fields":[{"key":"english_name","label":"영문 이름","type":"text","required":true,"placeholder":"Haneul Kim"}]}', 160),
  ('GA-08', '웰컴키트 수령', '총무팀에서 웰컴키트를 받은 뒤 "제출"을 눌러 주세요.',
   'day1', 'ga', false, 'ops', 'confirm', false, false, '{}', null, null, 170),
  -- 회계
  ('AC-01', '법인카드 신청서 작성', '법인카드 신청서를 작성해 회계 담당자에게 전달한 뒤 제출해 주세요.',
   'week1', 'accounting', false, 'ops', 'confirm', false, false, '{}', null, null, 210),
  ('AC-02', '카드사 온라인 동의', '카드사에서 온 안내에 따라 온라인 동의를 마친 뒤 제출해 주세요.',
   'week1', 'accounting', false, 'ops', 'confirm', false, false, '{}', null, null, 220),
  ('AC-03', '법인카드 수령', '신청서와 카드사 동의가 확인되면 회계팀에서 법인카드를 받습니다.',
   'month1', 'accounting', false, 'ops', 'confirm', false, false, '{AC-01,AC-02}', null, null, 230),
  ('AC-04', '노트북 구입 기준 확인', '개인 노트북을 업무용으로 구입할 계획이면 구입 기준(가상 값: 200만 원 이하)을 확인하세요. 계획이 없으면 "해당 없음"을 선택하세요.',
   'week1', 'accounting', false, 'ops', 'self', true, false, '{}', null, null, 240),
  ('AC-05', '구매 증빙·경비 상신', '구매 영수증으로 결재 시스템에 경비를 상신하고 제출해 주세요. 증빙 파일은 결재 시스템에만 올립니다.',
   'month1', 'accounting', false, 'ops', 'confirm', true, false, '{AC-04}', null, null, 250),
  ('AC-06', '경비 정산 지급 확인', '회계 담당자가 정산 지급을 확인합니다.',
   'month1', 'accounting', false, 'ops', 'staff_only', true, false, '{AC-05}', null, null, 260),
  ('INFO-01', '카드 분실 대응 안내', '법인카드·복지카드를 잃어버렸을 때의 연락 순서를 읽어 주세요: 카드사 분실 신고 → 총무 담당자에게 알림 → 재발급 신청.',
   'month1', 'ga', false, 'read', 'self', false, false, '{}', null, null, 270),
  -- AI팀
  ('AI-01', '사무실 돌며 인사하기', '교육 담당자와 함께 층별로 돌며 인사합니다. 다녀오면 "완료"를 눌러 주세요.',
   'day1', null, true, 'practice', 'self', false, false, '{}', null, null, 310),
  ('AI-02', '팀 업무·팀원 소개', 'AI팀이 맡은 업무와 팀원 역할 소개 자료를 읽어 주세요.',
   'day1', null, true, 'read', 'self', false, false, '{}', null, null, 320),
  ('AI-03', '팀 기술스택', '팀이 쓰는 언어·프레임워크·배포 환경 소개를 읽어 주세요.',
   'day1', null, true, 'read', 'self', false, false, '{}', null, null, 330),
  ('AI-04', '기술스택·경력 조사', '교육 계획을 맞추기 위한 조사입니다. 써 본 기술과 경험을 자유롭게 적어 주세요.',
   'day1', null, true, 'input', 'self', false, false, '{}', null,
   '{"fields":[{"key":"stacks","label":"사용해 본 기술스택","type":"text","required":true,"placeholder":"예: JavaScript, Python"},{"key":"experience","label":"프로젝트 경험","type":"textarea","required":true},{"key":"career","label":"경력 요약","type":"textarea","required":false}]}',
   340),
  ('AI-05', '간단 코딩테스트', '교육 담당자가 일정을 잡아 종이로 푸는 간단한 코딩테스트를 진행합니다.',
   'week1', null, true, 'assessment', 'staff_only', false, false, '{}', null, null, 350),
  ('AI-06', '메일 서명 설정·메일 작성법', '팀 메일 서명 양식으로 서명을 설정하고, 사내 메일 작성 예시를 읽어 주세요.',
   'week1', null, true, 'practice', 'self', false, false, '{}', null, null, 360),
  ('AI-07', '프린터 사용', '층 프린터를 PC에 연결하고 테스트 페이지를 한 장 인쇄해 보세요.',
   'week1', null, true, 'practice', 'self', false, false, '{}', null, null, 370),
  ('AI-08', 'GitHub·GitLab 사용법', '팀 저장소 규칙(브랜치·PR·리뷰)을 읽고, 연습 저장소에 PR을 하나 올려 보세요.',
   'week1', null, true, 'practice', 'self', false, false, '{}', null, null, 380),
  ('AI-09', 'BTP 개발 초기 세팅', '아래 항목을 모두 준비하면 완료됩니다. 막히면 채팅으로 물어보세요.',
   'week1', null, true, 'setup', 'self', false, false, '{}', '["SAP 계정", "cf cli", "mbt", "cds cli"]', null, 390),
  ('AI-10', 'JS 자습 후 기본기 테스트', 'JavaScript 자습 후 교육 담당자가 종이 시험으로 기본기를 확인합니다.',
   'week1', null, true, 'assessment', 'staff_only', false, false, '{}', null, null, 400)
) as v(code, title, description, stage, department, is_team, kind, mode, allow_na, hq, prereq, checklist, form, sort_order)
on conflict (org_id, code) do nothing;

-- ── 지식 시드 ───────────────────────────────────────────────────────
-- 게시 지식 30개(회사 공통 20 + AI팀 10). 조직에 지식이 하나라도 있으면 아무것도 하지 않는다.
-- "동호회 가입비"는 일부러 넣지 않는다(미답변 시연용).
create function public.seed_demo_knowledge(p_org uuid) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_team uuid;
  v_count int;
begin
  if exists (select 1 from public.knowledge_items where org_id = p_org) then
    return 0;
  end if;
  select id into v_team from public.teams where org_id = p_org and name = 'AI팀' limit 1;

  insert into public.knowledge_items (org_id, scope, team_id, question, answer, category, status)
  select p_org, v.scope::public.knowledge_scope,
         case when v.scope = 'team' then v_team end,
         v.question, v.answer, v.category, 'published'
    from (values
      ('company', 'Teams에서 전사 공지는 어디서 봐?', 'Teams 왼쪽 "팀" 메뉴의 "전사 공지" 채널에서 봅니다. 채널 이름 옆 종 모양을 눌러 "모든 새 게시물" 알림을 켜 두면 놓치지 않아요.', '업무 도구'),
      ('company', '우리 조직 라인은 어떻게 돼?', 'AI팀 → AI그룹 → AI본부 → AI부문 → 대표 순서입니다. 결재와 보고도 이 순서를 따릅니다.', '조직'),
      ('company', '회의실 예약 어떻게 해?', 'Outlook 일정을 만들 때 "회의실 찾기"에서 층과 인원을 고르면 됩니다. 예약이 겹치면 먼저 잡은 일정이 우선이에요.', '사무실'),
      ('company', '사내 동호회에는 뭐가 있어?', '가상 목록: 러닝, 보드게임, 사진, 풋살 동호회가 있어요. 사내 포털 "동호회" 게시판에서 모임 일정을 볼 수 있습니다.', '복지'),
      ('company', '사우회는 뭐야?', '직원끼리 경조사를 돕는 모임입니다. 입사하면 자동으로 가입되고, 경조사가 있으면 인사 담당자에게 알려 주세요.', '복지'),
      ('company', '사무실 층별 안내 알려줘', '가상 배치: 3층 경영지원(인사·총무·회계), 4층 개발 조직(AI팀 포함), 5층 회의실과 라운지입니다.', '사무실'),
      ('company', '노트북 경비 계정과목이 뭐야?', '업무용 노트북 구입비는 "소모품비"로 처리합니다(가상 기준). 결재 시스템에서 경비를 상신할 때 계정과목을 "소모품비"로 고르세요.', '회계'),
      ('company', '연차는 어떻게 신청해?', '근태·결재 시스템의 "휴가 신청"에서 날짜를 고르고 팀장 결재를 올리면 됩니다. 반차도 같은 메뉴에서 신청해요.', '근태'),
      ('company', '출퇴근 기록을 깜빡했어', '근태·결재 시스템의 "근태 정정"에서 실제 시각과 사유를 적어 정정 요청을 올리세요.', '근태'),
      ('company', '복지포인트는 어디에 쓸 수 있어?', '복지 앱에 등록된 가맹점과 도서·건강·자기계발 항목에 쓸 수 있어요. 연간 금액은 가상 값으로 100만 원입니다.', '복지'),
      ('company', '경조사 지원은 어떻게 받아?', '경조사가 생기면 인사 담당자에게 알리고 근태·결재 시스템에서 경조 휴가를 신청하세요. 지원 내용은 복리후생 규정에 있어요.', '복지'),
      ('company', '비품은 어떻게 신청해?', '사내 포털 "비품 신청"에 품목과 수량을 적으면 총무팀이 확인 후 지급합니다.', '사무실'),
      ('company', '택배는 어디서 받아?', '회사로 온 택배는 3층 총무팀 옆 택배 보관함에 둡니다(가상 위치). 개인 택배는 가급적 집으로 받아 주세요.', '사무실'),
      ('company', '주차 등록은 어떻게 해?', '총무 담당자에게 차량 번호를 알려 주면 방문 주차가 아닌 정기 주차로 등록해 줍니다. 자리가 한정되어 대기가 있을 수 있어요.', '사무실'),
      ('company', '사내 와이파이 접속 방법은?', '업무용 와이파이는 회사 계정으로 로그인해 접속합니다. 손님용 와이파이 비밀번호는 총무팀에 문의하세요.', '업무 도구'),
      ('company', '보안 교육은 언제 들어?', '입사 첫 달 안에 사내 교육 사이트에서 정보보안 온라인 교육을 들어야 합니다. 수료하면 자동으로 기록돼요.', '보안'),
      ('company', '출장은 어떻게 신청해?', '결재 시스템의 "출장 신청"으로 일정과 목적을 올리고, 다녀온 뒤 경비를 상신합니다.', '회계'),
      ('company', '법인카드는 어디에 쓸 수 있어?', '업무 관련 식대·교통·소모품 결제에 씁니다. 사용 후 결재 시스템에서 사용 내역에 용도를 적어야 해요.', '회계'),
      ('company', '명함을 다시 만들고 싶어', '직급이나 팀이 바뀌면 총무 담당자에게 재발급을 요청하세요. 처음 신청은 온보딩의 "명함 신청" 과제로 합니다.', '사무실'),
      ('company', '재택근무 신청할 수 있어?', '팀장과 협의한 뒤 근태·결재 시스템에서 "재택근무" 일정으로 신청합니다. 온보딩 첫 주에는 출근을 권장해요.', '근태'),
      ('team', '층 프린터 연결은 어떻게 해?', '4층 복합기 이름은 "4F-PRINTER"(가상)입니다. Windows는 설정 → 프린터 추가에서, Mac은 시스템 설정 → 프린터에서 이름으로 찾아 추가하세요.', '업무 환경'),
      ('team', '메일 서명은 어떤 형식이야?', '이름 / 직급 / AI팀 / 회사 메일 / 사무실 전화 순서로 씁니다. 팀 위키의 "메일 서명" 페이지에 복사용 양식이 있어요.', '업무 환경'),
      ('team', '팀 저장소 브랜치 규칙이 뭐야?', 'main에 직접 푸시하지 않고 feat/·fix/ 브랜치에서 작업한 뒤 PR을 올립니다. 리뷰 승인 1명 이상, CI 통과 후 squash 머지해요.', '개발 규칙'),
      ('team', '코드 리뷰는 어떻게 요청해?', 'PR을 올리고 팀 채널에 링크를 남기면 당번이 리뷰합니다. 변경 이유와 테스트 방법을 PR 설명에 꼭 적어 주세요.', '개발 규칙'),
      ('team', '개발 서버 접속은 어떻게 해?', '사내 VPN에 접속한 뒤 팀 위키의 "개발 환경" 페이지 안내대로 접속합니다. 계정은 교육 담당자가 만들어 줍니다.', '업무 환경'),
      ('team', 'BTP 서브계정은 어떻게 받아?', '교육 담당자에게 SAP 계정 메일을 알려 주면 팀 서브계정에 초대해 줍니다. 초대 메일을 수락하면 cf cli로 로그인할 수 있어요.', '개발 환경'),
      ('team', '팀 회의는 언제야?', '매주 월요일 오전 10시 주간 회의, 매일 오후 5시 10분 짧은 공유가 있어요(가상 일정). 일정은 팀 캘린더에 있습니다.', '팀 생활'),
      ('team', '팀 기술 문서는 어디에 있어?', '팀 위키의 "기술 문서" 공간에 아키텍처, 배포 절차, 장애 대응 문서가 있습니다.', '개발 규칙'),
      ('team', '휴가 가면 팀에 어떻게 알려?', '근태 시스템에 휴가를 신청하고, 팀 캘린더에 일정을 올린 뒤 팀 채널에 한 줄 남겨 주세요.', '팀 생활'),
      ('team', '모르는 게 있으면 어디에 물어봐?', '먼저 이 채팅에 물어보고, 답이 없으면 팀 채널의 "질문" 스레드에 올리세요. 교육 담당자가 답을 지식으로 등록하면 다음부터 채팅이 답해요.', '팀 생활')
    ) as v(scope, question, answer, category)
   where v.scope = 'company' or v_team is not null;

  get diagnostics v_count = row_count;
  return v_count;
end
$$;

revoke execute on function public.seed_demo_knowledge(uuid) from public, anon, authenticated;
grant execute on function public.seed_demo_knowledge(uuid) to service_role;

select public.seed_demo_knowledge('00000000-0000-0000-0000-000000000001');

-- ── 데모 초기화 (관리자만) ──────────────────────────────────────────
-- 호출자 조직의 시험·미답변·지식을 지우고 지식 시드를 다시 넣는다.
-- 기본 계정 신입(is_seed)은 과제를 지우고 입사일을 오늘로 바꿔 온보딩을 다시 시작한다.
-- 관리자가 만든 계정(is_seed = false)과 그 과제는 건드리지 않는다.
create function public.reset_demo() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid := (select private.my_org());
  v_hire uuid;
begin
  if (select private.my_role()) is distinct from 'admin' then
    raise exception '관리자만 데모 데이터를 초기화할 수 있습니다' using errcode = '42501';
  end if;

  delete from public.exams where org_id = v_org;
  delete from public.unanswered_questions where org_id = v_org;
  delete from public.knowledge_items where org_id = v_org;
  perform public.seed_demo_knowledge(v_org);

  for v_hire in
    select id from public.profiles
     where org_id = v_org and role = 'new_hire' and is_seed
     order by id
  loop
    perform pg_advisory_xact_lock(private.hire_lock_key(v_hire));
    delete from public.task_instances where new_hire_id = v_hire;
    update public.profiles set hire_date = (now() at time zone 'Asia/Seoul')::date where id = v_hire;
    perform public._start_onboarding(v_hire);
  end loop;
end
$$;

revoke execute on function public.reset_demo() from public, anon;
grant execute on function public.reset_demo() to authenticated, service_role;
