import os

# 앱 모듈을 import하기 전에 시작 시 필수 환경변수를 채운다(로컬 테스트용 가짜 값).
os.environ.setdefault("SUPABASE_URL", "http://127.0.0.1:54321")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
