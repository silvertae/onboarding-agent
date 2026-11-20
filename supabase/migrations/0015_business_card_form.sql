-- 명함 신청(GA-07)을 실제 명함 신청 양식과 같은 5칸 입력으로 바꾼다(설계 2026-11-20-business-card-form-design.md).
-- 영문 이름·직급·부문(목록)·이메일 아이디·연락처. 부문 목록과 직급 영문표는 가상 값이다.
-- 데이터만 바꾼다(컬럼·테이블 변경 없음). 담당자는 form_schema를 고칠 수 없으므로 덮어쓰고,
-- 안내문은 담당자가 고치지 않았을 때(옛 시드 문구 그대로일 때)만 바꾼다. 시드 사본은 항상 새 값.

create function private.apply_business_card_form() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_org constant uuid := '00000000-0000-0000-0000-000000000001';
  v_old constant text := '명함에 들어갈 영문 이름을 입력해 주세요. 이름·직급·팀·메일은 프로필에서 자동으로 채워집니다.';
  v_new constant text := '명함에 들어갈 영문 이름·직급·부문·이메일 아이디·연락처를 입력해 주세요. 한글 이름은 프로필에서 채워집니다. 실제 신청 양식은 첨부한 엑셀을 참고하세요.';
  v_schema constant jsonb := $json${"fields":[
    {"key":"english_name","label":"영문 이름","type":"text","required":true,"placeholder":"Haneul Kim"},
    {"key":"job_title","label":"직급","type":"text","required":true,"placeholder":"사원","hint":"첨부 양식의 직급 표기를 따릅니다",
     "english":{"사원":"Associate","대리":"Assistant Manager","과장":"Manager","차장":"Deputy General Manager","부장":"General Manager","선임":"Senior Associate","책임":"Senior Manager","수석":"Principal","팀장":"Team Leader","그룹장":"Group Leader","본부장":"Head of Division","부문장":"Head of Sector","대표이사":"CEO"}},
    {"key":"division","label":"부문","type":"select","required":true,"options":[
     {"value":"공란","english":""},
     {"value":"AI 부문","english":"Artificial Intelligence Sector"},
     {"value":"AI 그룹 / AI본부","english":"Artificial Intelligence Group"},
     {"value":"플랫폼 본부","english":"Platform Division"},
     {"value":"클라우드 사업부 / 플랫폼본부","english":"Cloud Business Unit"},
     {"value":"데이터 사업부 / 플랫폼본부","english":"Data Business Unit"},
     {"value":"산업솔루션 본부","english":"Industrial Solution Division"},
     {"value":"스마트팩토리 사업부 / 산업솔루션본부","english":"Smart Factory Business Unit"},
     {"value":"전략컨설팅 본부","english":"Strategy Consulting Division"},
     {"value":"경영지원 본부","english":"Corporate Support Division"},
     {"value":"인사총무팀 / 경영지원본부","english":"HR & General Affairs Team"}]},
    {"key":"email_id","label":"이메일 아이디","type":"text","required":true,"placeholder":"haneul.kim","suffix":"@blueward.co.kr","format":"email_local"},
    {"key":"phone","label":"연락처","type":"text","required":true,"placeholder":"010-0000-0000","hint":"공개 데모라 가상 번호를 입력해 주세요","format":"tel"}
  ]}$json$::jsonb;
begin
  update public.task_templates
     set form_schema = v_schema,
         description = case when description = v_old then v_new else description end
   where org_id = v_org and code = 'GA-07';

  update private.task_template_seed s
     set form_schema = v_schema,
         description = v_new
    from public.task_templates t
   where t.id = s.template_id and t.org_id = v_org and t.code = 'GA-07';
end
$$;

revoke all on function private.apply_business_card_form() from public, anon, authenticated;

select private.apply_business_card_form();
