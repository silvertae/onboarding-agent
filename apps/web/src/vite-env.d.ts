/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_AGENT_URL: string
  readonly VITE_ENV_LABEL?: 'local' | 'staging' | 'prod'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
