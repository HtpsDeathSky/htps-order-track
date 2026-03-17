export type ProfileRole = "admin" | "user";

export type Database = {
  public: {
    Tables: {
      orders: {
        Row: {
          id: string;
          user_id: string;
          product_name: string;
          warranty_expire_at: string;
          note: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          product_name: string;
          warranty_expire_at: string;
          note?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          product_name?: string;
          warranty_expire_at?: string;
          note?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          role: ProfileRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          role?: ProfileRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          role?: ProfileRole;
          created_at?: string;
          updated_at?: string;
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

export type OrderRecord = Database["public"]["Tables"]["orders"]["Row"];
