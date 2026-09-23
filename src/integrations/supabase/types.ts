export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      apontamentos: {
        Row: {
          area_m2: number | null;
          created_at: string;
          data_local: string;
          grupos: Json | null;
          id: string;
          largura: number | null;
          metragem: number | null;
          op: string;
          produto_id: string;
          produto_nome: string;
          quantidade_plts: number | null;
          rolos_por_plt: number | null;
          sequencia_fim: number | null;
          sequencia_inicio: number | null;
          setor: Database["public"]["Enums"]["setor_codigo"];
          tempo: number | null;
          total_rolos: number | null;
          turno: Database["public"]["Enums"]["turno_codigo"];
          usuario_id: string;
          velocidade: number | null;
        };
        Insert: {
          area_m2?: number | null;
          created_at?: string;
          data_local?: string;
          grupos?: Json | null;
          id?: string;
          largura?: number | null;
          metragem?: number | null;
          op: string;
          produto_id: string;
          produto_nome: string;
          quantidade_plts?: number | null;
          rolos_por_plt?: number | null;
          sequencia_fim?: number | null;
          sequencia_inicio?: number | null;
          setor: Database["public"]["Enums"]["setor_codigo"];
          tempo?: number | null;
          total_rolos?: number | null;
          turno: Database["public"]["Enums"]["turno_codigo"];
          usuario_id: string;
          velocidade?: number | null;
        };
        Update: {
          area_m2?: number | null;
          created_at?: string;
          data_local?: string;
          grupos?: Json | null;
          id?: string;
          largura?: number | null;
          metragem?: number | null;
          op?: string;
          produto_id?: string;
          produto_nome?: string;
          quantidade_plts?: number | null;
          rolos_por_plt?: number | null;
          sequencia_fim?: number | null;
          sequencia_inicio?: number | null;
          setor?: Database["public"]["Enums"]["setor_codigo"];
          tempo?: number | null;
          total_rolos?: number | null;
          turno?: Database["public"]["Enums"]["turno_codigo"];
          usuario_id?: string;
          velocidade?: number | null;
        };
        Relationships: [];
      };
      produtos: {
        Row: {
          ativo: boolean;
          created_at: string;
          id: string;
          largura: number | null;
          nome: string;
          rolos_por_plt: number | null;
          setor: Database["public"]["Enums"]["setor_codigo"];
        };
        Insert: {
          ativo?: boolean;
          created_at?: string;
          id?: string;
          largura?: number | null;
          nome: string;
          rolos_por_plt?: number | null;
          setor: Database["public"]["Enums"]["setor_codigo"];
        };
        Update: {
          ativo?: boolean;
          created_at?: string;
          id?: string;
          largura?: number | null;
          nome?: string;
          rolos_por_plt?: number | null;
          setor?: Database["public"]["Enums"]["setor_codigo"];
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          ativo: boolean;
          created_at: string;
          id: string;
          matricula: string | null;
          nome: string;
          onboarding_concluido: boolean;
          setor_atual: Database["public"]["Enums"]["setor_codigo"] | null;
          turno_atual: Database["public"]["Enums"]["turno_codigo"] | null;
          updated_at: string;
        };
        Insert: {
          ativo?: boolean;
          created_at?: string;
          id: string;
          matricula?: string | null;
          nome?: string;
          onboarding_concluido?: boolean;
          setor_atual?: Database["public"]["Enums"]["setor_codigo"] | null;
          turno_atual?: Database["public"]["Enums"]["turno_codigo"] | null;
          updated_at?: string;
        };
        Update: {
          ativo?: boolean;
          created_at?: string;
          id?: string;
          matricula?: string | null;
          nome?: string;
          onboarding_concluido?: boolean;
          setor_atual?: Database["public"]["Enums"]["setor_codigo"] | null;
          turno_atual?: Database["public"]["Enums"]["turno_codigo"] | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      setores: {
        Row: {
          codigo: Database["public"]["Enums"]["setor_codigo"];
          nome: string;
          ordem: number;
          regras_definidas: boolean;
        };
        Insert: {
          codigo: Database["public"]["Enums"]["setor_codigo"];
          nome: string;
          ordem: number;
          regras_definidas?: boolean;
        };
        Update: {
          codigo?: Database["public"]["Enums"]["setor_codigo"];
          nome?: string;
          ordem?: number;
          regras_definidas?: boolean;
        };
        Relationships: [];
      };
      turnos: {
        Row: {
          codigo: Database["public"]["Enums"]["turno_codigo"];
          nome: string;
          ordem: number;
        };
        Insert: {
          codigo: Database["public"]["Enums"]["turno_codigo"];
          nome: string;
          ordem: number;
        };
        Update: {
          codigo?: Database["public"]["Enums"]["turno_codigo"];
          nome?: string;
          ordem?: number;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "facilitador" | "autorizado_protheus" | "administrador";
      setor_codigo:
        "corte" | "fitas" | "mantas" | "asfox" | "misturadores" | "liquidos" | "pos" | "avulsos";
      turno_codigo: "T1" | "T2" | "T3";
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
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
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
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["facilitador", "autorizado_protheus", "administrador"],
      setor_codigo: [
        "corte",
        "fitas",
        "mantas",
        "asfox",
        "misturadores",
        "liquidos",
        "pos",
        "avulsos",
      ],
      turno_codigo: ["T1", "T2", "T3"],
    },
  },
} as const;
