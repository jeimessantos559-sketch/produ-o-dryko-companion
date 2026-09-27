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
          lancado_em: string | null;
          lancado_por: string | null;
          largura: number | null;
          lote: string | null;
          metragem: number | null;
          op: string | null;
          produto_id: string;
          produto_nome: string;
          quantidade_plts: number | null;
          rolos_por_plt: number | null;
          sequencia_fim: number | null;
          sequencia_inicio: number | null;
          setor: Database["public"]["Enums"]["setor_codigo"];
          status: Database["public"]["Enums"]["apontamento_status"];
          tempo: number | null;
          total_rolos: number | null;
          turno: Database["public"]["Enums"]["turno_codigo"];
          updated_at: string;
          usuario_id: string;
          velocidade: number | null;
        };
        Insert: {
          area_m2?: number | null;
          created_at?: string;
          data_local?: string;
          grupos?: Json | null;
          id?: string;
          lancado_em?: string | null;
          lancado_por?: string | null;
          largura?: number | null;
          lote?: string | null;
          metragem?: number | null;
          op?: string | null;
          produto_id: string;
          produto_nome: string;
          quantidade_plts?: number | null;
          rolos_por_plt?: number | null;
          sequencia_fim?: number | null;
          sequencia_inicio?: number | null;
          setor: Database["public"]["Enums"]["setor_codigo"];
          status?: Database["public"]["Enums"]["apontamento_status"];
          tempo?: number | null;
          total_rolos?: number | null;
          turno: Database["public"]["Enums"]["turno_codigo"];
          updated_at?: string;
          usuario_id: string;
          velocidade?: number | null;
        };
        Update: {
          area_m2?: number | null;
          created_at?: string;
          data_local?: string;
          grupos?: Json | null;
          id?: string;
          lancado_em?: string | null;
          lancado_por?: string | null;
          largura?: number | null;
          lote?: string | null;
          metragem?: number | null;
          op?: string | null;
          produto_id?: string;
          produto_nome?: string;
          quantidade_plts?: number | null;
          rolos_por_plt?: number | null;
          sequencia_fim?: number | null;
          sequencia_inicio?: number | null;
          setor?: Database["public"]["Enums"]["setor_codigo"];
          status?: Database["public"]["Enums"]["apontamento_status"];
          tempo?: number | null;
          total_rolos?: number | null;
          turno?: Database["public"]["Enums"]["turno_codigo"];
          updated_at?: string;
          usuario_id?: string;
          velocidade?: number | null;
        };
        Relationships: [];
      };
      apontamento_auditoria: {
        Row: {
          acao: string;
          apontamento_id: string;
          created_at: string;
          dados_anteriores: Json;
          dados_novos: Json;
          id: string;
          justificativa: string | null;
          setor: Database["public"]["Enums"]["setor_codigo"];
          usuario_id: string;
        };
        Insert: {
          acao: string;
          apontamento_id: string;
          created_at?: string;
          dados_anteriores: Json;
          dados_novos: Json;
          id?: string;
          justificativa?: string | null;
          setor: Database["public"]["Enums"]["setor_codigo"];
          usuario_id: string;
        };
        Update: {
          acao?: string;
          apontamento_id?: string;
          created_at?: string;
          dados_anteriores?: Json;
          dados_novos?: Json;
          id?: string;
          justificativa?: string | null;
          setor?: Database["public"]["Enums"]["setor_codigo"];
          usuario_id?: string;
        };
        Relationships: [];
      };
      fechamentos_turno: {
        Row: {
          data_local: string;
          fechado_em: string;
          fechado_por: string;
          id: string;
          justificativa_reabertura: string | null;
          reaberto_em: string | null;
          reaberto_por: string | null;
          resumo: Json;
          setor: Database["public"]["Enums"]["setor_codigo"];
          status: Database["public"]["Enums"]["fechamento_status"];
          turno: Database["public"]["Enums"]["turno_codigo"];
          updated_at: string;
        };
        Insert: {
          data_local: string;
          fechado_em?: string;
          fechado_por: string;
          id?: string;
          justificativa_reabertura?: string | null;
          reaberto_em?: string | null;
          reaberto_por?: string | null;
          resumo?: Json;
          setor: Database["public"]["Enums"]["setor_codigo"];
          status?: Database["public"]["Enums"]["fechamento_status"];
          turno: Database["public"]["Enums"]["turno_codigo"];
          updated_at?: string;
        };
        Update: {
          data_local?: string;
          fechado_em?: string;
          fechado_por?: string;
          id?: string;
          justificativa_reabertura?: string | null;
          reaberto_em?: string | null;
          reaberto_por?: string | null;
          resumo?: Json;
          setor?: Database["public"]["Enums"]["setor_codigo"];
          status?: Database["public"]["Enums"]["fechamento_status"];
          turno?: Database["public"]["Enums"]["turno_codigo"];
          updated_at?: string;
        };
        Relationships: [];
      };
      marcas_produto: {
        Row: {
          created_at: string;
          id: string;
          nome: string;
          ordem: number;
          setor: Database["public"]["Enums"]["setor_codigo"];
        };
        Insert: {
          created_at?: string;
          id?: string;
          nome: string;
          ordem?: number;
          setor: Database["public"]["Enums"]["setor_codigo"];
        };
        Update: {
          created_at?: string;
          id?: string;
          nome?: string;
          ordem?: number;
          setor?: Database["public"]["Enums"]["setor_codigo"];
        };
        Relationships: [];
      };
      meta_auditoria: {
        Row: {
          acao: string;
          created_at: string;
          dados_anteriores: Json;
          dados_novos: Json;
          id: string;
          meta_id: string;
          setor: Database["public"]["Enums"]["setor_codigo"];
          usuario_id: string;
        };
        Insert: {
          acao: string;
          created_at?: string;
          dados_anteriores: Json;
          dados_novos: Json;
          id?: string;
          meta_id: string;
          setor: Database["public"]["Enums"]["setor_codigo"];
          usuario_id: string;
        };
        Update: {
          acao?: string;
          created_at?: string;
          dados_anteriores?: Json;
          dados_novos?: Json;
          id?: string;
          meta_id?: string;
          setor?: Database["public"]["Enums"]["setor_codigo"];
          usuario_id?: string;
        };
        Relationships: [];
      };
      metas_op: {
        Row: {
          created_at: string;
          criado_por: string;
          finalizado_em: string | null;
          finalizado_por: string | null;
          id: string;
          op: string;
          produto_id: string;
          produto_nome: string;
          quantidade_meta: number;
          setor: Database["public"]["Enums"]["setor_codigo"];
          status: Database["public"]["Enums"]["meta_status"];
          unidade: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          criado_por: string;
          finalizado_em?: string | null;
          finalizado_por?: string | null;
          id?: string;
          op: string;
          produto_id: string;
          produto_nome: string;
          quantidade_meta: number;
          setor: Database["public"]["Enums"]["setor_codigo"];
          status?: Database["public"]["Enums"]["meta_status"];
          unidade: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          criado_por?: string;
          finalizado_em?: string | null;
          finalizado_por?: string | null;
          id?: string;
          op?: string;
          produto_id?: string;
          produto_nome?: string;
          quantidade_meta?: number;
          setor?: Database["public"]["Enums"]["setor_codigo"];
          status?: Database["public"]["Enums"]["meta_status"];
          unidade?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      problemas: {
        Row: {
          created_at: string;
          descricao: string;
          foto_url: string | null;
          id: string;
          resolvido: boolean;
          resolvido_em: string | null;
          resolvido_por: string | null;
          setor: Database["public"]["Enums"]["setor_codigo"] | null;
          tela: string;
          usuario_id: string;
        };
        Insert: {
          created_at?: string;
          descricao: string;
          foto_url?: string | null;
          id?: string;
          resolvido?: boolean;
          resolvido_em?: string | null;
          resolvido_por?: string | null;
          setor?: Database["public"]["Enums"]["setor_codigo"] | null;
          tela: string;
          usuario_id: string;
        };
        Update: {
          created_at?: string;
          descricao?: string;
          foto_url?: string | null;
          id?: string;
          resolvido?: boolean;
          resolvido_em?: string | null;
          resolvido_por?: string | null;
          setor?: Database["public"]["Enums"]["setor_codigo"] | null;
          tela?: string;
          usuario_id?: string;
        };
        Relationships: [];
      };
      produtos: {
        Row: {
          ativo: boolean;
          categoria: string | null;
          created_at: string;
          id: string;
          largura: number | null;
          metragem_por_plt: number | null;
          metros_por_rolo: number | null;
          nome: string;
          rolos_por_plt: number | null;
          setor: Database["public"]["Enums"]["setor_codigo"];
        };
        Insert: {
          ativo?: boolean;
          categoria?: string | null;
          created_at?: string;
          id?: string;
          largura?: number | null;
          metragem_por_plt?: number | null;
          metros_por_rolo?: number | null;
          nome: string;
          rolos_por_plt?: number | null;
          setor: Database["public"]["Enums"]["setor_codigo"];
        };
        Update: {
          ativo?: boolean;
          categoria?: string | null;
          created_at?: string;
          id?: string;
          largura?: number | null;
          metragem_por_plt?: number | null;
          metros_por_rolo?: number | null;
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
          pode_confirmar_protheus: boolean;
          pode_gerenciar_produtos: boolean;
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
          pode_confirmar_protheus?: boolean;
          pode_gerenciar_produtos?: boolean;
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
          pode_confirmar_protheus?: boolean;
          pode_gerenciar_produtos?: boolean;
          setor_atual?: Database["public"]["Enums"]["setor_codigo"] | null;
          turno_atual?: Database["public"]["Enums"]["turno_codigo"] | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      relatorios: {
        Row: {
          created_at: string;
          criado_por: string;
          data_local: string;
          destinatarios: string[];
          enviado_em: string | null;
          erro_envio: string | null;
          fechamento_id: string;
          id: string;
          resumo: Json;
          setor: Database["public"]["Enums"]["setor_codigo"];
          status_envio: Database["public"]["Enums"]["envio_status"];
          tentativas_envio: number;
          turno: Database["public"]["Enums"]["turno_codigo"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          criado_por: string;
          data_local: string;
          destinatarios?: string[];
          enviado_em?: string | null;
          erro_envio?: string | null;
          fechamento_id: string;
          id?: string;
          resumo: Json;
          setor: Database["public"]["Enums"]["setor_codigo"];
          status_envio?: Database["public"]["Enums"]["envio_status"];
          tentativas_envio?: number;
          turno: Database["public"]["Enums"]["turno_codigo"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          criado_por?: string;
          data_local?: string;
          destinatarios?: string[];
          enviado_em?: string | null;
          erro_envio?: string | null;
          fechamento_id?: string;
          id?: string;
          resumo?: Json;
          setor?: Database["public"]["Enums"]["setor_codigo"];
          status_envio?: Database["public"]["Enums"]["envio_status"];
          tentativas_envio?: number;
          turno?: Database["public"]["Enums"]["turno_codigo"];
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
      alterar_status_meta: {
        Args: {
          p_meta_id: string;
          p_status: Database["public"]["Enums"]["meta_status"];
        };
        Returns: undefined;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      confirmar_apontamentos_protheus: {
        Args: { p_ids: string[] };
        Returns: number;
      };
      corrigir_apontamento: {
        Args: { p_dados: Json; p_id: string; p_justificativa: string };
        Returns: Database["public"]["Tables"]["apontamentos"]["Row"];
      };
      eh_admin_ativo: {
        Args: { _user_id: string };
        Returns: boolean;
      };
      fechar_turno: {
        Args: {
          p_data: string;
          p_resumo: Json;
          p_setor: Database["public"]["Enums"]["setor_codigo"];
          p_turno: Database["public"]["Enums"]["turno_codigo"];
        };
        Returns: string;
      };
      gerenciar_usuario: {
        Args: {
          p_ativo: boolean;
          p_papeis: Database["public"]["Enums"]["app_role"][];
          p_pode_confirmar_protheus: boolean;
          p_pode_gerenciar_produtos: boolean;
          p_usuario_id: string;
        };
        Returns: undefined;
      };
      pode_confirmar_protheus: {
        Args: { _user_id: string };
        Returns: boolean;
      };
      pode_gerenciar_produtos: {
        Args: { _user_id: string };
        Returns: boolean;
      };
      reabrir_turno: {
        Args: { p_fechamento_id: string; p_justificativa: string };
        Returns: undefined;
      };
    };
    Enums: {
      app_role: "facilitador" | "autorizado_protheus" | "administrador";
      apontamento_status: "pendente" | "lancado";
      envio_status: "aguardando" | "enviando" | "enviado" | "falhou";
      fechamento_status: "fechado" | "reaberto";
      meta_status: "ativa" | "finalizada";
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
      apontamento_status: ["pendente", "lancado"],
      envio_status: ["aguardando", "enviando", "enviado", "falhou"],
      fechamento_status: ["fechado", "reaberto"],
      meta_status: ["ativa", "finalizada"],
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
