export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      folders: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          owner_id: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          owner_id: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          owner_id?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "folders_parent_owner_fkey"
            columns: ["owner_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["owner_id", "id"]
          },
        ]
      }
      notes: {
        Row: {
          content: string
          created_at: string
          deleted_at: string | null
          folder_id: string | null
          id: string
          name: string
          owner_id: string
          revision: number
          search_text: string
          search_vector: unknown
          size: number | null
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          content?: string
          created_at?: string
          deleted_at?: string | null
          folder_id?: string | null
          id?: string
          name: string
          owner_id: string
          revision?: number
          search_text?: string
          search_vector?: unknown
          size?: number | null
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          deleted_at?: string | null
          folder_id?: string | null
          id?: string
          name?: string
          owner_id?: string
          revision?: number
          search_text?: string
          search_vector?: unknown
          size?: number | null
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_folder_owner_fkey"
            columns: ["owner_id", "folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["owner_id", "id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      save_note: {
        Args: {
          p_content: string
          p_expected_revision: number
          p_id: string
          p_search_text: string
          p_tags: string[]
          p_title: string
        }
        Returns: {
          content: string
          folder_id: string
          name: string
          note_id: string
          outcome: string
          revision: number
          size: number
          tags: string[]
          title: string
          updated_at: string
        }[]
      }
      search_notes: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          folder_id: string
          note_id: string
          note_name: string
          rank: number
          snippet: string
          tags: string[]
          title: string
        }[]
      }
      set_folder_deleted: {
        Args: { p_deleted: boolean; p_id: string }
        Returns: string
      }
      set_note_deleted: {
        Args: { p_deleted: boolean; p_expected_revision: number; p_id: string }
        Returns: {
          content: string
          folder_id: string
          name: string
          note_id: string
          outcome: string
          revision: number
          size: number
          tags: string[]
          title: string
          updated_at: string
        }[]
      }
      update_note_metadata: {
        Args: {
          p_expected_revision: number
          p_folder_id: string
          p_id: string
          p_name: string
          p_search_text: string
        }
        Returns: {
          content: string
          folder_id: string
          name: string
          note_id: string
          outcome: string
          revision: number
          size: number
          tags: string[]
          title: string
          updated_at: string
        }[]
      }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

