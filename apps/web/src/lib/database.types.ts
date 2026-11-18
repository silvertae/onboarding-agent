export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      exam_questions: {
        Row: {
          bank_item_id: string | null;
          exam_id: string;
          id: string;
          model_answer: string;
          org_id: string;
          points: number;
          position: number;
          prompt: string;
          rubric: string;
        };
        ComputedFields: never;
        Insert: {
          bank_item_id?: string | null;
          exam_id: string;
          id?: string;
          model_answer: string;
          org_id: string;
          points: number;
          position: number;
          prompt: string;
          rubric: string;
        };
        Update: {
          bank_item_id?: string | null;
          exam_id?: string;
          id?: string;
          model_answer?: string;
          org_id?: string;
          points?: number;
          position?: number;
          prompt?: string;
          rubric?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exam_questions_bank_item_id_fkey";
            columns: ["bank_item_id"];
            isOneToOne: false;
            referencedRelation: "question_bank_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exam_questions_exam_id_fkey";
            columns: ["exam_id"];
            isOneToOne: false;
            referencedRelation: "exams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exam_questions_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      exam_sittings: {
        Row: {
          assigned_by: string | null;
          bank_item_ids: string[];
          created_at: string;
          exam_id: string;
          id: string;
          org_id: string;
          task_instance_id: string;
        };
        ComputedFields: never;
        Insert: {
          assigned_by?: string | null;
          bank_item_ids?: string[];
          created_at?: string;
          exam_id: string;
          id?: string;
          org_id: string;
          task_instance_id: string;
        };
        Update: {
          assigned_by?: string | null;
          bank_item_ids?: string[];
          created_at?: string;
          exam_id?: string;
          id?: string;
          org_id?: string;
          task_instance_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exam_sittings_assigned_by_fkey";
            columns: ["assigned_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exam_sittings_exam_id_fkey";
            columns: ["exam_id"];
            isOneToOne: false;
            referencedRelation: "exams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exam_sittings_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exam_sittings_task_instance_id_fkey";
            columns: ["task_instance_id"];
            isOneToOne: false;
            referencedRelation: "task_instances";
            referencedColumns: ["id"];
          },
        ];
      };
      exams: {
        Row: {
          created_at: string;
          created_by: string | null;
          difficulty: Database["public"]["Enums"]["exam_difficulty"];
          id: string;
          org_id: string;
          status: Database["public"]["Enums"]["exam_status"];
          team_id: string;
          title: string;
          topic: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          difficulty: Database["public"]["Enums"]["exam_difficulty"];
          id?: string;
          org_id: string;
          status?: Database["public"]["Enums"]["exam_status"];
          team_id: string;
          title: string;
          topic: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          difficulty?: Database["public"]["Enums"]["exam_difficulty"];
          id?: string;
          org_id?: string;
          status?: Database["public"]["Enums"]["exam_status"];
          team_id?: string;
          title?: string;
          topic?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exams_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exams_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exams_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      knowledge_items: {
        Row: {
          answer: string;
          category: string;
          id: string;
          org_id: string;
          question: string;
          scope: Database["public"]["Enums"]["knowledge_scope"];
          status: Database["public"]["Enums"]["knowledge_status"];
          team_id: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          answer: string;
          category?: string;
          id?: string;
          org_id: string;
          question: string;
          scope: Database["public"]["Enums"]["knowledge_scope"];
          status?: Database["public"]["Enums"]["knowledge_status"];
          team_id?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          answer?: string;
          category?: string;
          id?: string;
          org_id?: string;
          question?: string;
          scope?: Database["public"]["Enums"]["knowledge_scope"];
          status?: Database["public"]["Enums"]["knowledge_status"];
          team_id?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "knowledge_items_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "knowledge_items_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "knowledge_items_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      orgs: {
        Row: {
          id: string;
          name: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          name: string;
        };
        Update: {
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          department: Database["public"]["Enums"]["ops_department"] | null;
          email: string;
          full_name: string;
          hire_date: string | null;
          id: string;
          is_seed: boolean;
          job_title: string;
          needs_hq_access: boolean;
          org_id: string;
          role: Database["public"]["Enums"]["user_role"];
          team_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          department?: Database["public"]["Enums"]["ops_department"] | null;
          email: string;
          full_name: string;
          hire_date?: string | null;
          id: string;
          is_seed?: boolean;
          job_title?: string;
          needs_hq_access?: boolean;
          org_id: string;
          role: Database["public"]["Enums"]["user_role"];
          team_id?: string | null;
        };
        Update: {
          created_at?: string;
          department?: Database["public"]["Enums"]["ops_department"] | null;
          email?: string;
          full_name?: string;
          hire_date?: string | null;
          id?: string;
          is_seed?: boolean;
          job_title?: string;
          needs_hq_access?: boolean;
          org_id?: string;
          role?: Database["public"]["Enums"]["user_role"];
          team_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profiles_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      question_bank_items: {
        Row: {
          created_at: string;
          created_by: string | null;
          difficulty: Database["public"]["Enums"]["exam_difficulty"];
          id: string;
          model_answer: string;
          org_id: string;
          points: number;
          prompt: string;
          prompt_key: string | null;
          rubric: string;
          source: Database["public"]["Enums"]["bank_item_source"];
          status: Database["public"]["Enums"]["bank_item_status"];
          team_id: string;
          topic: string;
          topic_key: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          difficulty: Database["public"]["Enums"]["exam_difficulty"];
          id?: string;
          model_answer: string;
          org_id: string;
          points: number;
          prompt: string;
          prompt_key?: never;
          rubric: string;
          source: Database["public"]["Enums"]["bank_item_source"];
          status?: Database["public"]["Enums"]["bank_item_status"];
          team_id: string;
          topic: string;
          topic_key?: never;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          difficulty?: Database["public"]["Enums"]["exam_difficulty"];
          id?: string;
          model_answer?: string;
          org_id?: string;
          points?: number;
          prompt?: string;
          prompt_key?: never;
          rubric?: string;
          source?: Database["public"]["Enums"]["bank_item_source"];
          status?: Database["public"]["Enums"]["bank_item_status"];
          team_id?: string;
          topic?: string;
          topic_key?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "question_bank_items_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "question_bank_items_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "question_bank_items_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      task_instances: {
        Row: {
          assessment_note: string | null;
          assessment_result: Database["public"]["Enums"]["assessment_result"] | null;
          confirmed_at: string | null;
          confirmed_by: string | null;
          due_date: string | null;
          id: string;
          location: string | null;
          na_reason: string | null;
          new_hire_id: string;
          org_id: string;
          result: Json | null;
          rework_reason: string | null;
          scheduled_at: string | null;
          status: Database["public"]["Enums"]["task_status"];
          submitted_at: string | null;
          template_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          assessment_note?: string | null;
          assessment_result?: Database["public"]["Enums"]["assessment_result"] | null;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          due_date?: string | null;
          id?: string;
          location?: string | null;
          na_reason?: string | null;
          new_hire_id: string;
          org_id: string;
          result?: Json | null;
          rework_reason?: string | null;
          scheduled_at?: string | null;
          status: Database["public"]["Enums"]["task_status"];
          submitted_at?: string | null;
          template_id: string;
          updated_at?: string;
        };
        Update: {
          assessment_note?: string | null;
          assessment_result?: Database["public"]["Enums"]["assessment_result"] | null;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          due_date?: string | null;
          id?: string;
          location?: string | null;
          na_reason?: string | null;
          new_hire_id?: string;
          org_id?: string;
          result?: Json | null;
          rework_reason?: string | null;
          scheduled_at?: string | null;
          status?: Database["public"]["Enums"]["task_status"];
          submitted_at?: string | null;
          template_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_instances_confirmed_by_fkey";
            columns: ["confirmed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_instances_new_hire_id_fkey";
            columns: ["new_hire_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_instances_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_instances_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "task_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      task_template_files: {
        Row: {
          created_at: string;
          file_name: string;
          id: string;
          is_seed: boolean;
          org_id: string;
          size_bytes: number;
          storage_path: string;
          template_id: string;
          uploaded_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          file_name: string;
          id?: string;
          is_seed?: boolean;
          org_id: string;
          size_bytes: number;
          storage_path: string;
          template_id: string;
          uploaded_by?: string | null;
        };
        Update: {
          created_at?: string;
          file_name?: string;
          id?: string;
          is_seed?: boolean;
          org_id?: string;
          size_bytes?: number;
          storage_path?: string;
          template_id?: string;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "task_template_files_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_template_files_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "task_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_template_files_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      task_templates: {
        Row: {
          allow_na: boolean;
          archived_at: string | null;
          assigned_to: string | null;
          checklist: Json | null;
          code: string;
          completion_mode: Database["public"]["Enums"]["completion_mode"];
          created_by: string | null;
          department: Database["public"]["Enums"]["ops_department"] | null;
          description: string;
          due_offset_days: number;
          form_schema: Json | null;
          id: string;
          is_seed: boolean;
          kind: Database["public"]["Enums"]["task_kind"];
          org_id: string;
          prerequisite_codes: string[];
          requires_hq_access: boolean;
          sort_order: number;
          stage: Database["public"]["Enums"]["task_stage"];
          team_id: string | null;
          title: string;
        };
        ComputedFields: never;
        Insert: {
          allow_na?: boolean;
          archived_at?: string | null;
          assigned_to?: string | null;
          checklist?: Json | null;
          code: string;
          completion_mode: Database["public"]["Enums"]["completion_mode"];
          created_by?: string | null;
          department?: Database["public"]["Enums"]["ops_department"] | null;
          description?: string;
          due_offset_days?: number;
          form_schema?: Json | null;
          id?: string;
          is_seed?: boolean;
          kind?: Database["public"]["Enums"]["task_kind"];
          org_id: string;
          prerequisite_codes?: string[];
          requires_hq_access?: boolean;
          sort_order?: number;
          stage: Database["public"]["Enums"]["task_stage"];
          team_id?: string | null;
          title: string;
        };
        Update: {
          allow_na?: boolean;
          archived_at?: string | null;
          assigned_to?: string | null;
          checklist?: Json | null;
          code?: string;
          completion_mode?: Database["public"]["Enums"]["completion_mode"];
          created_by?: string | null;
          department?: Database["public"]["Enums"]["ops_department"] | null;
          description?: string;
          due_offset_days?: number;
          form_schema?: Json | null;
          id?: string;
          is_seed?: boolean;
          kind?: Database["public"]["Enums"]["task_kind"];
          org_id?: string;
          prerequisite_codes?: string[];
          requires_hq_access?: boolean;
          sort_order?: number;
          stage?: Database["public"]["Enums"]["task_stage"];
          team_id?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_templates_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_templates_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_templates_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_templates_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      teams: {
        Row: {
          id: string;
          name: string;
          org_id: string;
          org_line: string[];
          task_code_prefix: string | null;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          name: string;
          org_id: string;
          org_line?: string[];
          task_code_prefix?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          org_id?: string;
          org_line?: string[];
          task_code_prefix?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "teams_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      unanswered_questions: {
        Row: {
          asked_by: string;
          created_at: string;
          id: string;
          org_id: string;
          question: string;
          resolved_knowledge_id: string | null;
          status: Database["public"]["Enums"]["unanswered_status"];
          team_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          asked_by: string;
          created_at?: string;
          id?: string;
          org_id: string;
          question: string;
          resolved_knowledge_id?: string | null;
          status?: Database["public"]["Enums"]["unanswered_status"];
          team_id?: string | null;
        };
        Update: {
          asked_by?: string;
          created_at?: string;
          id?: string;
          org_id?: string;
          question?: string;
          resolved_knowledge_id?: string | null;
          status?: Database["public"]["Enums"]["unanswered_status"];
          team_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "unanswered_questions_asked_by_fkey";
            columns: ["asked_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "unanswered_questions_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "unanswered_questions_resolved_knowledge_id_fkey";
            columns: ["resolved_knowledge_id"];
            isOneToOne: false;
            referencedRelation: "knowledge_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "unanswered_questions_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      usage_counters: {
        Row: {
          count: number;
          day: string;
          kind: string;
          org_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          count?: number;
          day: string;
          kind: string;
          org_id: string;
          user_id: string;
        };
        Update: {
          count?: number;
          day?: string;
          kind?: string;
          org_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "usage_counters_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "usage_counters_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      _start_onboarding: { Args: { p_new_hire: string }; Returns: number };
      add_task_for_hire: {
        Args: {
          p_allow_na: boolean;
          p_checklist: Json;
          p_completion_mode: Database["public"]["Enums"]["completion_mode"];
          p_days_in_stage: number;
          p_description: string;
          p_kind: Database["public"]["Enums"]["task_kind"];
          p_new_hire: string;
          p_stage: Database["public"]["Enums"]["task_stage"];
          p_title: string;
        };
        Returns: {
          assessment_note: string | null;
          assessment_result: Database["public"]["Enums"]["assessment_result"] | null;
          confirmed_at: string | null;
          confirmed_by: string | null;
          due_date: string | null;
          id: string;
          location: string | null;
          na_reason: string | null;
          new_hire_id: string;
          org_id: string;
          result: Json | null;
          rework_reason: string | null;
          scheduled_at: string | null;
          status: Database["public"]["Enums"]["task_status"];
          submitted_at: string | null;
          template_id: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "task_instances";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      archive_task_template: {
        Args: { p_id: string };
        Returns: {
          allow_na: boolean;
          archived_at: string | null;
          assigned_to: string | null;
          checklist: Json | null;
          code: string;
          completion_mode: Database["public"]["Enums"]["completion_mode"];
          created_by: string | null;
          department: Database["public"]["Enums"]["ops_department"] | null;
          description: string;
          due_offset_days: number;
          form_schema: Json | null;
          id: string;
          is_seed: boolean;
          kind: Database["public"]["Enums"]["task_kind"];
          org_id: string;
          prerequisite_codes: string[];
          requires_hq_access: boolean;
          sort_order: number;
          stage: Database["public"]["Enums"]["task_stage"];
          team_id: string | null;
          title: string;
        };
        SetofOptions: {
          from: "*";
          to: "task_templates";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      assign_exam: {
        Args: { p_exam: string; p_task: string };
        Returns: {
          assigned_by: string | null;
          bank_item_ids: string[];
          created_at: string;
          exam_id: string;
          id: string;
          org_id: string;
          task_instance_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "exam_sittings";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      bank_prompts: {
        Args: {
          p_difficulty: Database["public"]["Enums"]["exam_difficulty"];
          p_limit?: number;
          p_topic: string;
        };
        Returns: string[];
      };
      confirm_task: {
        Args: { p_id: string };
        Returns: {
          assessment_note: string | null;
          assessment_result: Database["public"]["Enums"]["assessment_result"] | null;
          confirmed_at: string | null;
          confirmed_by: string | null;
          due_date: string | null;
          id: string;
          location: string | null;
          na_reason: string | null;
          new_hire_id: string;
          org_id: string;
          result: Json | null;
          rework_reason: string | null;
          scheduled_at: string | null;
          status: Database["public"]["Enums"]["task_status"];
          submitted_at: string | null;
          template_id: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "task_instances";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      consume_quota: { Args: { p_kind: string; p_limit: number }; Returns: boolean };
      mark_na: {
        Args: { p_id: string; p_reason: string };
        Returns: {
          assessment_note: string | null;
          assessment_result: Database["public"]["Enums"]["assessment_result"] | null;
          confirmed_at: string | null;
          confirmed_by: string | null;
          due_date: string | null;
          id: string;
          location: string | null;
          na_reason: string | null;
          new_hire_id: string;
          org_id: string;
          result: Json | null;
          rework_reason: string | null;
          scheduled_at: string | null;
          status: Database["public"]["Enums"]["task_status"];
          submitted_at: string | null;
          template_id: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "task_instances";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      pick_bank_items: {
        Args: {
          p_count: number;
          p_difficulty: Database["public"]["Enums"]["exam_difficulty"];
          p_exclude?: string[];
          p_exclude_prompts?: string[];
          p_new_hire?: string;
          p_topic: string;
        };
        Returns: {
          created_at: string;
          created_by: string | null;
          difficulty: Database["public"]["Enums"]["exam_difficulty"];
          id: string;
          model_answer: string;
          org_id: string;
          points: number;
          prompt: string;
          prompt_key: string | null;
          rubric: string;
          source: Database["public"]["Enums"]["bank_item_source"];
          status: Database["public"]["Enums"]["bank_item_status"];
          team_id: string;
          topic: string;
          topic_key: string | null;
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "question_bank_items";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      record_assessment: {
        Args: {
          p_id: string;
          p_location?: string;
          p_note: string;
          p_result: Database["public"]["Enums"]["assessment_result"];
          p_scheduled_at?: string;
        };
        Returns: {
          assessment_note: string | null;
          assessment_result: Database["public"]["Enums"]["assessment_result"] | null;
          confirmed_at: string | null;
          confirmed_by: string | null;
          due_date: string | null;
          id: string;
          location: string | null;
          na_reason: string | null;
          new_hire_id: string;
          org_id: string;
          result: Json | null;
          rework_reason: string | null;
          scheduled_at: string | null;
          status: Database["public"]["Enums"]["task_status"];
          submitted_at: string | null;
          template_id: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "task_instances";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      register_exam_to_bank: { Args: { p_exam: string }; Returns: number };
      request_rework: {
        Args: { p_id: string; p_reason: string };
        Returns: {
          assessment_note: string | null;
          assessment_result: Database["public"]["Enums"]["assessment_result"] | null;
          confirmed_at: string | null;
          confirmed_by: string | null;
          due_date: string | null;
          id: string;
          location: string | null;
          na_reason: string | null;
          new_hire_id: string;
          org_id: string;
          result: Json | null;
          rework_reason: string | null;
          scheduled_at: string | null;
          status: Database["public"]["Enums"]["task_status"];
          submitted_at: string | null;
          template_id: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "task_instances";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      reset_demo: { Args: Record<PropertyKey, never>; Returns: undefined };
      resolve_unanswered: {
        Args: { p_answer: string; p_category: string; p_id: string; p_question: string };
        Returns: {
          answer: string;
          category: string;
          id: string;
          org_id: string;
          question: string;
          scope: Database["public"]["Enums"]["knowledge_scope"];
          status: Database["public"]["Enums"]["knowledge_status"];
          team_id: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "knowledge_items";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      restore_task_template: {
        Args: { p_id: string };
        Returns: {
          allow_na: boolean;
          archived_at: string | null;
          assigned_to: string | null;
          checklist: Json | null;
          code: string;
          completion_mode: Database["public"]["Enums"]["completion_mode"];
          created_by: string | null;
          department: Database["public"]["Enums"]["ops_department"] | null;
          description: string;
          due_offset_days: number;
          form_schema: Json | null;
          id: string;
          is_seed: boolean;
          kind: Database["public"]["Enums"]["task_kind"];
          org_id: string;
          prerequisite_codes: string[];
          requires_hq_access: boolean;
          sort_order: number;
          stage: Database["public"]["Enums"]["task_stage"];
          team_id: string | null;
          title: string;
        };
        SetofOptions: {
          from: "*";
          to: "task_templates";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      save_task_template: {
        Args: {
          p_allow_na: boolean;
          p_checklist: Json;
          p_completion_mode: Database["public"]["Enums"]["completion_mode"];
          p_days_in_stage: number;
          p_description: string;
          p_id: string;
          p_kind: Database["public"]["Enums"]["task_kind"];
          p_prerequisite_codes: string[];
          p_stage: Database["public"]["Enums"]["task_stage"];
          p_title: string;
        };
        Returns: {
          allow_na: boolean;
          archived_at: string | null;
          assigned_to: string | null;
          checklist: Json | null;
          code: string;
          completion_mode: Database["public"]["Enums"]["completion_mode"];
          created_by: string | null;
          department: Database["public"]["Enums"]["ops_department"] | null;
          description: string;
          due_offset_days: number;
          form_schema: Json | null;
          id: string;
          is_seed: boolean;
          kind: Database["public"]["Enums"]["task_kind"];
          org_id: string;
          prerequisite_codes: string[];
          requires_hq_access: boolean;
          sort_order: number;
          stage: Database["public"]["Enums"]["task_stage"];
          team_id: string | null;
          title: string;
        };
        SetofOptions: {
          from: "*";
          to: "task_templates";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      seed_demo_bank: { Args: { p_org: string }; Returns: number };
      seed_demo_knowledge: { Args: { p_org: string }; Returns: number };
      start_onboarding: { Args: { p_new_hire: string }; Returns: number };
      submit_task: {
        Args: { p_id: string; p_result?: Json };
        Returns: {
          assessment_note: string | null;
          assessment_result: Database["public"]["Enums"]["assessment_result"] | null;
          confirmed_at: string | null;
          confirmed_by: string | null;
          due_date: string | null;
          id: string;
          location: string | null;
          na_reason: string | null;
          new_hire_id: string;
          org_id: string;
          result: Json | null;
          rework_reason: string | null;
          scheduled_at: string | null;
          status: Database["public"]["Enums"]["task_status"];
          submitted_at: string | null;
          template_id: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "task_instances";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      assessment_result: "pass" | "needs_followup";
      bank_item_source: "exam" | "manual" | "migrated" | "seed";
      bank_item_status: "active" | "hidden";
      completion_mode: "self" | "confirm" | "staff_only";
      exam_difficulty: "beginner" | "intermediate";
      exam_status: "draft" | "final";
      knowledge_scope: "company" | "team";
      knowledge_status: "draft" | "published";
      ops_department: "hr" | "ga" | "accounting";
      task_kind: "ops" | "read" | "input" | "practice" | "setup" | "assessment";
      task_stage: "day1" | "week1" | "month1";
      task_status: "blocked" | "todo" | "submitted" | "rework" | "done" | "na";
      unanswered_status: "open" | "resolved";
      user_role: "new_hire" | "team_trainer" | "ops_staff" | "admin";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      assessment_result: ["pass", "needs_followup"],
      bank_item_source: ["exam", "manual", "migrated", "seed"],
      bank_item_status: ["active", "hidden"],
      completion_mode: ["self", "confirm", "staff_only"],
      exam_difficulty: ["beginner", "intermediate"],
      exam_status: ["draft", "final"],
      knowledge_scope: ["company", "team"],
      knowledge_status: ["draft", "published"],
      ops_department: ["hr", "ga", "accounting"],
      task_kind: ["ops", "read", "input", "practice", "setup", "assessment"],
      task_stage: ["day1", "week1", "month1"],
      task_status: ["blocked", "todo", "submitted", "rework", "done", "na"],
      unanswered_status: ["open", "resolved"],
      user_role: ["new_hire", "team_trainer", "ops_staff", "admin"],
    },
  },
} as const;
