export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      exchange_connections: {
        Row: {
          api_status: string
          auto_sync: boolean
          created_at: string
          exchange: string
          id: string
          imported_trades: number
          label: string
          last_sync_at: string | null
          last_sync_status: string | null
          scopes: string[]
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_status?: string
          auto_sync?: boolean
          created_at?: string
          exchange: string
          id?: string
          imported_trades?: number
          label?: string
          last_sync_at?: string | null
          last_sync_status?: string | null
          scopes?: string[]
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_status?: string
          auto_sync?: boolean
          created_at?: string
          exchange?: string
          id?: string
          imported_trades?: number
          label?: string
          last_sync_at?: string | null
          last_sync_status?: string | null
          scopes?: string[]
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      exchange_credentials: {
        Row: {
          connection_id: string
          created_at: string
          enc_api_key: string
          enc_api_secret: string
          enc_passphrase: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          connection_id: string
          created_at?: string
          enc_api_key: string
          enc_api_secret: string
          enc_passphrase?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          connection_id?: string
          created_at?: string
          enc_api_key?: string
          enc_api_secret?: string
          enc_passphrase?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_credentials_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "exchange_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_sync_runs: {
        Row: {
          connection_id: string | null
          created_at: string
          duplicate_count: number
          duration_ms: number
          error_count: number
          exchange: string
          id: string
          imported_count: number
          log: Json
          scopes: string[]
          skipped_count: number
          status: string
          user_id: string
        }
        Insert: {
          connection_id?: string | null
          created_at?: string
          duplicate_count?: number
          duration_ms?: number
          error_count?: number
          exchange: string
          id?: string
          imported_count?: number
          log?: Json
          scopes?: string[]
          skipped_count?: number
          status?: string
          user_id: string
        }
        Update: {
          connection_id?: string | null
          created_at?: string
          duplicate_count?: number
          duration_ms?: number
          error_count?: number
          exchange?: string
          id?: string
          imported_count?: number
          log?: Json
          scopes?: string[]
          skipped_count?: number
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_sync_runs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "exchange_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          created_at: string
          duplicate_count: number
          duration_ms: number
          error_count: number
          file_name: string
          id: string
          imported_count: number
          log: Json
          platform: string
          skipped_count: number
          status: string
          total_rows: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duplicate_count?: number
          duration_ms?: number
          error_count?: number
          file_name?: string
          id?: string
          imported_count?: number
          log?: Json
          platform?: string
          skipped_count?: number
          status?: string
          total_rows?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          duplicate_count?: number
          duration_ms?: number
          error_count?: number
          file_name?: string
          id?: string
          imported_count?: number
          log?: Json
          platform?: string
          skipped_count?: number
          status?: string
          total_rows?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      import_mappings: {
        Row: {
          created_at: string
          id: string
          mapping: Json
          platform: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mapping?: Json
          platform: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mapping?: Json
          platform?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email_notifications: boolean
          id: string
          theme: string
          timezone: string
          updated_at: string
          username: string | null
          weekly_report: boolean
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email_notifications?: boolean
          id: string
          theme?: string
          timezone?: string
          updated_at?: string
          username?: string | null
          weekly_report?: boolean
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email_notifications?: boolean
          id?: string
          theme?: string
          timezone?: string
          updated_at?: string
          username?: string | null
          weekly_report?: boolean
        }
        Relationships: []
      }
      trades: {
        Row: {
          asset: string
          closed_at: string | null
          confidence_level: number | null
          created_at: string
          direction: string
          discipline_level: number | null
          emotional_state: string | null
          entry_price: number | null
          exit_price: number | null
          fear_level: number | null
          greed_level: number | null
          id: string
          market: string
          notes: string | null
          opened_at: string
          patience_level: number | null
          position_size: number | null
          profit_loss: number
          psychology_after: string | null
          psychology_before: string | null
          risk_percent: number | null
          rr_ratio: number | null
          screenshot_url: string | null
          session: string | null
          setup_type: string | null
          stop_loss: number | null
          strategy: string | null
          take_profit: number | null
          timeframe: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          asset: string
          closed_at?: string | null
          confidence_level?: number | null
          created_at?: string
          direction?: string
          discipline_level?: number | null
          emotional_state?: string | null
          entry_price?: number | null
          exit_price?: number | null
          fear_level?: number | null
          greed_level?: number | null
          id?: string
          market?: string
          notes?: string | null
          opened_at?: string
          patience_level?: number | null
          position_size?: number | null
          profit_loss?: number
          psychology_after?: string | null
          psychology_before?: string | null
          risk_percent?: number | null
          rr_ratio?: number | null
          screenshot_url?: string | null
          session?: string | null
          setup_type?: string | null
          stop_loss?: number | null
          strategy?: string | null
          take_profit?: number | null
          timeframe?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          asset?: string
          closed_at?: string | null
          confidence_level?: number | null
          created_at?: string
          direction?: string
          discipline_level?: number | null
          emotional_state?: string | null
          entry_price?: number | null
          exit_price?: number | null
          fear_level?: number | null
          greed_level?: number | null
          id?: string
          market?: string
          notes?: string | null
          opened_at?: string
          patience_level?: number | null
          position_size?: number | null
          profit_loss?: number
          psychology_after?: string | null
          psychology_before?: string | null
          risk_percent?: number | null
          rr_ratio?: number | null
          screenshot_url?: string | null
          session?: string | null
          setup_type?: string | null
          stop_loss?: number | null
          strategy?: string | null
          take_profit?: number | null
          timeframe?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
