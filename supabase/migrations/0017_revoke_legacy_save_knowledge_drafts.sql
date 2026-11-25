-- 0017 역할 기준 save_knowledge_drafts(jsonb)의 실행 권한을 회수한다.
-- 0013의 (jsonb) 함수는 범위를 호출자 역할로 정해, 초안 요청 뒤 계정이 바뀌면 다른 범위로 저장될 수 있었다.
-- 웹은 0016의 문서 기준 save_knowledge_drafts(uuid, jsonb)만 쓰고 에이전트는 이 함수를 부르지 않는다.
-- 마이그레이션은 추가만 하므로 함수는 남기고 실행 권한만 거둔다(postgres·service_role만 실행 가능).
revoke execute on function public.save_knowledge_drafts(jsonb) from authenticated;
