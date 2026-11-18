-- 0007 데모 문제은행 시드와 데모 초기화 갱신.
-- 시드 문항은 종이로 풀 수 있는 공개 JavaScript 기초 지식이며 가상 내용이다.

-- ── 문제은행 시드 ───────────────────────────────────────────────────
-- AI팀 "JavaScript 기초" 입문 8개. 조직에 은행 문항이 하나라도 있으면 아무것도 하지 않는다.
create function public.seed_demo_bank(p_org uuid) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_team uuid;
  v_count int;
begin
  if exists (select 1 from public.question_bank_items where org_id = p_org) then
    return 0;
  end if;
  select id into v_team from public.teams where org_id = p_org and name = 'AI팀' limit 1;
  if v_team is null then
    return 0;
  end if;

  insert into public.question_bank_items
    (org_id, team_id, topic, difficulty, prompt, model_answer, rubric, points, source)
  select p_org, v_team, 'JavaScript 기초', 'beginner', v.prompt, v.model_answer, v.rubric, 10, 'seed'
    from (values
      ('let과 const로 선언한 변수의 차이를 값을 다시 할당할 수 있는지를 중심으로 설명하시오.',
       'let으로 선언한 변수는 값을 다시 할당할 수 있고, const로 선언한 변수는 다시 할당할 수 없다. 둘 다 블록 스코프를 가진다. 단, const로 선언한 객체나 배열은 안쪽 값을 바꿀 수 있다.',
       '재할당 가능 여부를 맞게 설명하면 6점, 블록 스코프나 const 객체의 안쪽 값 변경을 함께 설명하면 4점.'),
      ('== 와 === 의 차이를 쓰고, 0 == ''0'' 과 0 === ''0'' 의 결과를 각각 쓰시오.',
       '==는 타입을 맞춘 뒤 값을 비교하고, ===는 타입과 값을 모두 비교한다. 0 == ''0''은 true, 0 === ''0''은 false다.',
       '두 연산자의 차이를 맞게 설명하면 4점, 두 결과가 각각 맞으면 3점씩.'),
      ('다음 코드를 실행하면 콘솔에 무엇이 출력되는지 쓰시오. const result = [1, 2, 3].map(n => n * 2); console.log(result);',
       '[2, 4, 6]이 출력된다. map은 각 요소에 함수를 적용한 새 배열을 돌려주고 원래 배열은 바꾸지 않는다.',
       '출력이 맞으면 7점, map이 새 배열을 돌려준다는 설명이 있으면 3점.'),
      ('다음 코드를 실행하면 콘솔에 출력되는 값을 차례대로 쓰시오. function makeCounter() { let count = 0; return function () { count += 1; return count; }; } const next = makeCounter(); console.log(next()); console.log(next());',
       '1, 2가 차례로 출력된다. 안쪽 함수가 바깥 함수의 count 변수를 기억하므로(클로저) 부를 때마다 같은 count가 1씩 늘어난다.',
       '두 출력이 모두 맞으면 6점, 클로저로 count가 유지된다는 설명이 있으면 4점.'),
      ('typeof null 과 typeof undefined 의 결과를 각각 쓰시오.',
       'typeof null은 ''object'', typeof undefined는 ''undefined''다.',
       '결과 하나당 5점.'),
      ('다음 코드를 실행하면 콘솔에 무엇이 출력되는지 쓰시오. const evens = [1, 2, 3, 4, 5].filter(n => n % 2 === 0); console.log(evens);',
       '[2, 4]가 출력된다. filter는 조건 함수가 true를 돌려준 요소만 담은 새 배열을 만든다.',
       '출력이 맞으면 7점, filter 동작 설명이 맞으면 3점.'),
      ('다음 코드를 실행하면 무엇이 출력되는지 쓰고, var 대신 let을 쓰면 어떻게 되는지 쓰시오. console.log(x); var x = 5;',
       'undefined가 출력된다. var 선언은 호이스팅되어 선언만 먼저 처리되고 값은 아직 할당되지 않았기 때문이다. let을 쓰면 선언 전에 접근하므로 ReferenceError가 난다.',
       'var 결과가 맞으면 5점, let일 때 ReferenceError를 쓰면 5점.'),
      ('다음 코드를 실행하면 콘솔에 무엇이 출력되는지 쓰시오. const { title, count = 1 } = { title: ''책'' }; console.log(title, count);',
       '책 1이 출력된다. 구조 분해 할당으로 title에는 ''책''이 들어가고, count는 객체에 없으므로 기본값 1이 들어간다.',
       'title 값이 맞으면 4점, count 기본값이 맞으면 6점.')
    ) as v(prompt, model_answer, rubric);

  get diagnostics v_count = row_count;
  return v_count;
end
$$;

revoke execute on function public.seed_demo_bank(uuid) from public, anon, authenticated;
grant execute on function public.seed_demo_bank(uuid) to service_role;

select public.seed_demo_bank('00000000-0000-0000-0000-000000000001');

-- ── 데모 초기화 (관리자만) ──────────────────────────────────────────
-- 0004 본문 그대로에 문제은행 초기화를 더한다. 시험을 먼저 지우므로 문항·응시 기록은 cascade로 지워진다.
create or replace function public.reset_demo() returns void
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
  delete from public.question_bank_items where org_id = v_org;
  perform public.seed_demo_bank(v_org);

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
