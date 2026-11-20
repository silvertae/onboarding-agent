-- 명함 신청(GA-07) 5칸 입력 테스트. 칸 정의·시드 사본·안내문 조건부 갱신·초기화 후 유지를 확인하고 롤백한다.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

create function pg_temp.ga07() returns public.task_templates language sql as $$
  select * from public.task_templates
   where org_id = '00000000-0000-0000-0000-000000000001' and code = 'GA-07'
$$;
create function pg_temp.ga07_seed() returns private.task_template_seed language sql as $$
  select s.* from private.task_template_seed s where s.template_id = (pg_temp.ga07()).id
$$;

-- ── 칸 정의 ─────────────────────────────────────────────────────────
select is(jsonb_array_length((pg_temp.ga07()).form_schema -> 'fields'), 5, 'GA-07 칸 5개');
select is(array(select f ->> 'key' from jsonb_array_elements((pg_temp.ga07()).form_schema -> 'fields') f),
  '{english_name,job_title,division,email_id,phone}'::text[], '칸 순서와 키');
select is((pg_temp.ga07()).form_schema -> 'fields' -> 2 ->> 'type', 'select', '부문은 select');
select is(jsonb_array_length((pg_temp.ga07()).form_schema -> 'fields' -> 2 -> 'options'), 11, '부문 선택지 11개(공란 포함)');
select is((pg_temp.ga07()).form_schema -> 'fields' -> 2 -> 'options' -> 0 ->> 'value', '공란', '첫 선택지는 공란');
select is((pg_temp.ga07()).form_schema -> 'fields' -> 3 ->> 'suffix', '@blueward.co.kr', '이메일 도메인 고정');
select is((pg_temp.ga07()).form_schema -> 'fields' -> 1 -> 'english' ->> '사원', 'Associate', '직급 영문 대응표');

-- ── 시드 사본 ───────────────────────────────────────────────────────
select is((pg_temp.ga07_seed()).form_schema, (pg_temp.ga07()).form_schema, '시드 사본의 칸 정의도 같다');
select is((pg_temp.ga07_seed()).description,
  '명함에 들어갈 영문 이름·직급·부문·이메일 아이디·연락처를 입력해 주세요. 한글 이름은 프로필에서 채워집니다. 실제 신청 양식은 첨부한 엑셀을 참고하세요.',
  '시드 사본은 새 안내문');

-- ── 안내문: 옛 시드 문구면 새 문구로, 담당자가 고쳤으면 그대로 ──────
-- 공유 로컬 DB에서 다른 세션이 고쳤을 수 있으므로 옛 시드 문구로 맞춘 뒤 적용한다.
update public.task_templates
   set description = '명함에 들어갈 영문 이름을 입력해 주세요. 이름·직급·팀·메일은 프로필에서 자동으로 채워집니다.'
 where id = (pg_temp.ga07()).id;
select private.apply_business_card_form();
select is((pg_temp.ga07()).description, (pg_temp.ga07_seed()).description, '옛 시드 안내문은 새 안내문으로 바뀐다');

update public.task_templates set description = '담당자가 고친 안내' where id = (pg_temp.ga07()).id;
select private.apply_business_card_form();
select is((pg_temp.ga07()).description, '담당자가 고친 안내', '다시 적용해도 담당자가 고친 안내문은 남는다');
select is(jsonb_array_length((pg_temp.ga07()).form_schema -> 'fields'), 5, '다시 적용해도 칸 5개(멱등)');

-- ── 데모 초기화 뒤에도 새 칸 정의 ───────────────────────────────────
insert into auth.users (id, email) values ('ab000000-0000-0000-0000-000000000401', 'admin@card.test');
insert into public.profiles (id, org_id, email, full_name, role) values
  ('ab000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000001', 'admin@card.test', '관리', 'admin');
set local role authenticated;
set local request.jwt.claim.sub = 'ab000000-0000-0000-0000-000000000401';
select public.reset_demo();
reset role;
select is(jsonb_array_length((pg_temp.ga07()).form_schema -> 'fields'), 5, '초기화 뒤에도 칸 5개');

select * from finish();
rollback;
