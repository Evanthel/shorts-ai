export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          starter_profile: string;
          personalization_score: number;
          comfort_summary: string | null;
          temperature_offset_c: number;
          rated_recommendations: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          starter_profile?: string;
          personalization_score?: number;
          comfort_summary?: string | null;
          temperature_offset_c?: number;
          rated_recommendations?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          starter_profile?: string;
          personalization_score?: number;
          comfort_summary?: string | null;
          temperature_offset_c?: number;
          rated_recommendations?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      favourite_locations: {
        Row: {
          id: string;
          user_id: string;
          label: string;
          latitude: number;
          longitude: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          label: string;
          latitude: number;
          longitude: number;
          created_at?: string;
        };
        Update: {
          label?: string;
          latitude?: number;
          longitude?: number;
        };
        Relationships: [];
      };
      recommendations: {
        Row: {
          id: string;
          user_id: string;
          location_label: string;
          activity_mode: string;
          weather_snapshot: Json;
          forecast_snapshot: Json;
          recommendation_payload: Json;
          confidence_score: number;
          explanation: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          location_label: string;
          activity_mode: string;
          weather_snapshot: Json;
          forecast_snapshot: Json;
          recommendation_payload: Json;
          confidence_score: number;
          explanation?: string | null;
          created_at?: string;
        };
        Update: {
          explanation?: string | null;
        };
        Relationships: [];
      };
      feedback: {
        Row: {
          id: string;
          recommendation_id: string;
          user_id: string;
          rating: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          recommendation_id: string;
          user_id: string;
          rating: string;
          created_at?: string;
        };
        Update: {
          rating?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
