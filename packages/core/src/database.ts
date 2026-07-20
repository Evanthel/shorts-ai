export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; starter_profile: string; personalization_score: number; comfort_summary: string | null; temperature_offset_c: number; comfort_memory: Json; rated_recommendations: number; created_at: string; updated_at: string };
        Insert: { id: string; starter_profile?: string; personalization_score?: number; comfort_summary?: string | null; temperature_offset_c?: number; comfort_memory?: Json; rated_recommendations?: number; created_at?: string; updated_at?: string };
        Update: { starter_profile?: string; personalization_score?: number; comfort_summary?: string | null; temperature_offset_c?: number; comfort_memory?: Json; rated_recommendations?: number; updated_at?: string };
        Relationships: [];
      };
      favourite_locations: {
        Row: { id: string; user_id: string; label: string; latitude: number; longitude: number; created_at: string };
        Insert: { id?: string; user_id: string; label: string; latitude: number; longitude: number; created_at?: string };
        Update: { label?: string; latitude?: number; longitude?: number };
        Relationships: [];
      };
      recommendations: {
        Row: { id: string; user_id: string; location_label: string; activity_mode: string; weather_snapshot: Json; forecast_snapshot: Json; recommendation_payload: Json; confidence_score: number; explanation: string | null; client_request_id: string | null; engine_version: string; safety_policy_version: string; model_version: string | null; source: string; selected_variant_id: string | null; accepted_at: string | null; feedback_due_at: string | null; created_at: string };
        Insert: { id?: string; user_id: string; location_label: string; activity_mode: string; weather_snapshot: Json; forecast_snapshot: Json; recommendation_payload: Json; confidence_score: number; explanation?: string | null; client_request_id?: string | null; engine_version?: string; safety_policy_version?: string; model_version?: string | null; source?: string; selected_variant_id?: string | null; accepted_at?: string | null; feedback_due_at?: string | null; created_at?: string };
        Update: { explanation?: string | null; selected_variant_id?: string | null; accepted_at?: string | null; feedback_due_at?: string | null; model_version?: string | null; source?: string };
        Relationships: [];
      };
      recommendation_candidates: {
        Row: { id: string; recommendation_id: string; user_id: string; variant_id: string; variant_kind: string; rank: number; candidate_payload: Json; model_score: number | null; selected: boolean; created_at: string };
        Insert: { id?: string; recommendation_id: string; user_id: string; variant_id: string; variant_kind: string; rank: number; candidate_payload: Json; model_score?: number | null; selected?: boolean; created_at?: string };
        Update: { rank?: number; candidate_payload?: Json; model_score?: number | null; selected?: boolean };
        Relationships: [];
      };
      feedback: {
        Row: { id: string; recommendation_id: string; user_id: string; rating: string; actually_worn: string | null; adjustment: string; problem_areas: string[]; source: string; created_at: string; updated_at: string };
        Insert: { id?: string; recommendation_id: string; user_id: string; rating: string; actually_worn?: string | null; adjustment?: string; problem_areas?: string[]; source?: string; created_at?: string; updated_at?: string };
        Update: { rating?: string; actually_worn?: string | null; adjustment?: string; problem_areas?: string[]; source?: string; updated_at?: string };
        Relationships: [];
      };
      ai_interactions: {
        Row: { id: string; recommendation_id: string | null; user_id: string; activity_mode: string; intent: string; action: string; result_status: string; source: string; created_at: string };
        Insert: { id?: string; recommendation_id?: string | null; user_id: string; activity_mode: string; intent: string; action: string; result_status: string; source: string; created_at?: string };
        Update: { result_status?: string };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      consume_ai_rate_limit: {
        Args: { p_client_key: string; p_limit: number; p_window_seconds: number };
        Returns: { allowed: boolean; remaining: number; reset_at: string }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
