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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      attribute_definitions: {
        Row: {
          active: boolean
          applies_to: Database["public"]["Enums"]["attribute_subject"]
          created_at: string
          data_type: Database["public"]["Enums"]["attribute_type"]
          help: string
          id: string
          key: string
          label: string
          locked: boolean
          member_editable: boolean
          org_id: string
          required: boolean
          show_in_directory: boolean
          sort_order: number
          visibility: Database["public"]["Enums"]["attribute_visibility"]
        }
        Insert: {
          active?: boolean
          applies_to?: Database["public"]["Enums"]["attribute_subject"]
          created_at?: string
          data_type: Database["public"]["Enums"]["attribute_type"]
          help?: string
          id?: string
          key: string
          label: string
          locked?: boolean
          member_editable?: boolean
          org_id: string
          required?: boolean
          show_in_directory?: boolean
          sort_order?: number
          visibility?: Database["public"]["Enums"]["attribute_visibility"]
        }
        Update: {
          active?: boolean
          applies_to?: Database["public"]["Enums"]["attribute_subject"]
          created_at?: string
          data_type?: Database["public"]["Enums"]["attribute_type"]
          help?: string
          id?: string
          key?: string
          label?: string
          locked?: boolean
          member_editable?: boolean
          org_id?: string
          required?: boolean
          show_in_directory?: boolean
          sort_order?: number
          visibility?: Database["public"]["Enums"]["attribute_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "attribute_definitions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      attribute_options: {
        Row: {
          active: boolean
          definition_id: string
          id: string
          label: string
          org_id: string
          sort_order: number
          value: string
        }
        Insert: {
          active?: boolean
          definition_id: string
          id?: string
          label: string
          org_id: string
          sort_order?: number
          value: string
        }
        Update: {
          active?: boolean
          definition_id?: string
          id?: string
          label?: string
          org_id?: string
          sort_order?: number
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "attribute_options_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "attribute_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attribute_options_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      attribute_values: {
        Row: {
          definition_id: string
          entity_id: string
          id: string
          org_id: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          definition_id: string
          entity_id: string
          id?: string
          org_id: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          definition_id?: string
          entity_id?: string
          id?: string
          org_id?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "attribute_values_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "attribute_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attribute_values_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          id: number
          org_id: string | null
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: number
          org_id?: string | null
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: number
          org_id?: string | null
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          org_id: string
          revoked_at: string | null
          role_id: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          org_id: string
          revoked_at?: string | null
          role_id: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          org_id?: string
          revoked_at?: string | null
          role_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_events: {
        Row: {
          actor_id: string | null
          created_at: string
          id: number
          kind: Database["public"]["Enums"]["membership_event_kind"]
          membership_id: string
          note: string
          org_id: string
          payment_id: string | null
          period_end: string | null
          period_start: string | null
          term_id: string | null
          tier_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: number
          kind: Database["public"]["Enums"]["membership_event_kind"]
          membership_id: string
          note?: string
          org_id: string
          payment_id?: string | null
          period_end?: string | null
          period_start?: string | null
          term_id?: string | null
          tier_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: number
          kind?: Database["public"]["Enums"]["membership_event_kind"]
          membership_id?: string
          note?: string
          org_id?: string
          payment_id?: string | null
          period_end?: string | null
          period_start?: string | null
          term_id?: string | null
          tier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "membership_events_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_events_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "tier_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_events_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "membership_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_tiers: {
        Row: {
          active: boolean
          created_at: string
          description: string
          id: string
          key: string
          name: string
          org_id: string
          sort_order: number
          tax_treatment: Database["public"]["Enums"]["tax_treatment"]
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          key: string
          name: string
          org_id: string
          sort_order?: number
          tax_treatment?: Database["public"]["Enums"]["tax_treatment"]
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          key?: string
          name?: string
          org_id?: string
          sort_order?: number
          tax_treatment?: Database["public"]["Enums"]["tax_treatment"]
        }
        Relationships: [
          {
            foreignKeyName: "membership_tiers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          joined_on: string | null
          lifetime: boolean
          org_id: string
          paid_through: string | null
          profile_id: string
          status: Database["public"]["Enums"]["membership_status"]
          term_id: string
          tier_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          joined_on?: string | null
          lifetime?: boolean
          org_id: string
          paid_through?: string | null
          profile_id: string
          status: Database["public"]["Enums"]["membership_status"]
          term_id: string
          tier_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          joined_on?: string | null
          lifetime?: boolean
          org_id?: string
          paid_through?: string | null
          profile_id?: string
          status?: Database["public"]["Enums"]["membership_status"]
          term_id?: string
          tier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "org_member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "tier_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "membership_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      org_member_profiles: {
        Row: {
          claimed_at: string | null
          created_at: string
          display_name: string
          email: string
          id: string
          org_id: string
          source: string
          user_id: string | null
        }
        Insert: {
          claimed_at?: string | null
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          org_id: string
          source?: string
          user_id?: string | null
        }
        Update: {
          claimed_at?: string | null
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          org_id?: string
          source?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_member_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_settings: {
        Row: {
          key: string
          mode: Database["public"]["Enums"]["setting_mode"]
          org_id: string
          updated_at: string
          value: Json | null
        }
        Insert: {
          key: string
          mode?: Database["public"]["Enums"]["setting_mode"]
          org_id: string
          updated_at?: string
          value?: Json | null
        }
        Update: {
          key?: string
          mode?: Database["public"]["Enums"]["setting_mode"]
          org_id?: string
          updated_at?: string
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "org_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          ancestor_ids: string[]
          created_at: string
          created_by: string | null
          id: string
          logo_path: string | null
          name: string
          parent_id: string | null
          slug: string
          status: string
          timezone: string
          type: Database["public"]["Enums"]["org_type"]
          updated_at: string
        }
        Insert: {
          ancestor_ids?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          logo_path?: string | null
          name: string
          parent_id?: string | null
          slug: string
          status?: string
          timezone?: string
          type: Database["public"]["Enums"]["org_type"]
          updated_at?: string
        }
        Update: {
          ancestor_ids?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          logo_path?: string | null
          name?: string
          parent_id?: string | null
          slug?: string
          status?: string
          timezone?: string
          type?: Database["public"]["Enums"]["org_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_minor: number
          created_at: string
          created_by: string | null
          currency: string
          gateway: Database["public"]["Enums"]["payment_gateway"]
          gateway_ref: string | null
          id: string
          livemode: boolean
          membership_id: string | null
          method: Database["public"]["Enums"]["payment_method"] | null
          note: string
          org_id: string
          payer_user_id: string | null
          profile_id: string | null
          purpose: Database["public"]["Enums"]["payment_purpose"]
          received_on: string | null
          status: Database["public"]["Enums"]["payment_status"]
        }
        Insert: {
          amount_minor: number
          created_at?: string
          created_by?: string | null
          currency?: string
          gateway?: Database["public"]["Enums"]["payment_gateway"]
          gateway_ref?: string | null
          id?: string
          livemode?: boolean
          membership_id?: string | null
          method?: Database["public"]["Enums"]["payment_method"] | null
          note?: string
          org_id: string
          payer_user_id?: string | null
          profile_id?: string | null
          purpose: Database["public"]["Enums"]["payment_purpose"]
          received_on?: string | null
          status: Database["public"]["Enums"]["payment_status"]
        }
        Update: {
          amount_minor?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          gateway?: Database["public"]["Enums"]["payment_gateway"]
          gateway_ref?: string | null
          id?: string
          livemode?: boolean
          membership_id?: string | null
          method?: Database["public"]["Enums"]["payment_method"] | null
          note?: string
          org_id?: string
          payer_user_id?: string | null
          profile_id?: string | null
          purpose?: Database["public"]["Enums"]["payment_purpose"]
          received_on?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payments_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "org_member_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          description: string
          key: string
        }
        Insert: {
          description: string
          key: string
        }
        Update: {
          description?: string
          key?: string
        }
        Relationships: []
      }
      role_assignments: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role_id: string
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role_id: string
          source?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role_id?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_assignments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_assignments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_key: string
          role_id: string
        }
        Insert: {
          permission_key: string
          role_id: string
        }
        Update: {
          permission_key?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          active: boolean
          created_at: string
          description: string
          id: string
          key: string
          name: string
          org_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          key: string
          name: string
          org_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          key?: string
          name?: string
          org_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      setup_states: {
        Row: {
          answers: Json
          applied_at: string | null
          flow_id: string
          org_id: string
          status: Database["public"]["Enums"]["setup_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          answers?: Json
          applied_at?: string | null
          flow_id: string
          org_id: string
          status?: Database["public"]["Enums"]["setup_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          answers?: Json
          applied_at?: string | null
          flow_id?: string
          org_id?: string
          status?: Database["public"]["Enums"]["setup_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "setup_states_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_profiles: {
        Row: {
          address_line1: string
          address_line2: string
          city: string
          country: string
          ein: string
          legal_name: string
          org_id: string
          postal_code: string
          region: string
          tax_status: string
          updated_at: string
        }
        Insert: {
          address_line1?: string
          address_line2?: string
          city?: string
          country?: string
          ein?: string
          legal_name?: string
          org_id: string
          postal_code?: string
          region?: string
          tax_status?: string
          updated_at?: string
        }
        Update: {
          address_line1?: string
          address_line2?: string
          city?: string
          country?: string
          ein?: string
          legal_name?: string
          org_id?: string
          postal_code?: string
          region?: string
          tax_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tier_terms: {
        Row: {
          active: boolean
          created_at: string
          currency: string
          id: string
          key: string
          label: string
          length_count: number | null
          length_unit: Database["public"]["Enums"]["term_unit"] | null
          org_id: string
          price_minor: number
          sort_order: number
          tier_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          currency?: string
          id?: string
          key: string
          label: string
          length_count?: number | null
          length_unit?: Database["public"]["Enums"]["term_unit"] | null
          org_id: string
          price_minor: number
          sort_order?: number
          tier_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          currency?: string
          id?: string
          key?: string
          label?: string
          length_count?: number | null
          length_unit?: Database["public"]["Enums"]["term_unit"] | null
          org_id?: string
          price_minor?: number
          sort_order?: number
          tier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tier_terms_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tier_terms_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "membership_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { _token: string }; Returns: string }
      admin_create_member: {
        Args: { _display_name: string; _email?: string; _org: string }
        Returns: string
      }
      approve_membership: {
        Args: { _membership: string; _note?: string }
        Returns: undefined
      }
      cancel_membership: {
        Args: { _membership: string; _note?: string }
        Returns: undefined
      }
      decline_membership: {
        Args: { _membership: string; _note?: string }
        Returns: undefined
      }
      grace_days: { Args: { _org: string }; Returns: number }
      record_membership: {
        Args: {
          _amount_minor?: number
          _method?: Database["public"]["Enums"]["payment_method"]
          _note?: string
          _paid_on?: string
          _profile: string
          _starts_on?: string
          _term: string
        }
        Returns: string
      }
      update_member_record: {
        Args: { _display_name: string; _email: string; _profile: string }
        Returns: undefined
      }
      ancestor_setting: { Args: { _key: string; _org: string }; Returns: Json }
      apply_setup: {
        Args: { _answers: Json; _flow: string; _org: string; _plan: Json }
        Returns: undefined
      }
      assign_role: {
        Args: { _org: string; _role_key: string; _user: string }
        Returns: string
      }
      can_read_attribute_value: {
        Args: {
          _def: string
          _entity: string
          _user: string
          _value_org: string
        }
        Returns: boolean
      }
      can_see_org_tree: {
        Args: { _org: string; _user: string }
        Returns: boolean
      }
      check_role_permissions: {
        Args: { _org: string; _perms: string[]; _uid: string }
        Returns: undefined
      }
      create_invitation: {
        Args: { _email: string; _org: string; _role_key?: string }
        Returns: string
      }
      create_organization: {
        Args: {
          _name: string
          _parent?: string
          _slug: string
          _type: Database["public"]["Enums"]["org_type"]
        }
        Returns: string
      }
      create_role: {
        Args: {
          _description: string
          _key: string
          _name: string
          _org: string
          _perms: string[]
        }
        Returns: string
      }
      get_invitation: {
        Args: { _token: string }
        Returns: {
          org_name: string
          usable: boolean
        }[]
      }
      has_permission: {
        Args: { _org: string; _perm: string; _user: string }
        Returns: boolean
      }
      holds_all_role_permissions: {
        Args: { _org: string; _role: string; _user: string }
        Returns: boolean
      }
      is_org_member: { Args: { _org: string; _user: string }; Returns: boolean }
      lineage_settings: {
        Args: { _org: string }
        Returns: {
          key: string
          mode: Database["public"]["Enums"]["setting_mode"]
          org_id: string
          value: Json
        }[]
      }
      org_lineage: {
        Args: { _org: string }
        Returns: {
          depth: number
          id: string
          logo_path: string
          name: string
          type: Database["public"]["Enums"]["org_type"]
        }[]
      }
      remove_role: { Args: { _assignment: string }; Returns: undefined }
      resolve_role: { Args: { _key: string; _org: string }; Returns: string }
      revoke_invitation: { Args: { _id: string }; Returns: undefined }
      role_applies_at: {
        Args: {
          _org: string
          _role: Database["public"]["Tables"]["roles"]["Row"]
        }
        Returns: boolean
      }
      set_attribute_value: {
        Args: { _def: string; _entity: string; _value: Json }
        Returns: undefined
      }
      set_role_active: {
        Args: { _active: boolean; _role: string }
        Returns: undefined
      }
      update_role: {
        Args: {
          _description: string
          _name: string
          _perms: string[]
          _role: string
        }
        Returns: undefined
      }
      validate_attribute_value: {
        Args: {
          _def: Database["public"]["Tables"]["attribute_definitions"]["Row"]
          _v: Json
        }
        Returns: undefined
      }
      write_audit: {
        Args: {
          _action: string
          _after: Json
          _before: Json
          _org: string
          _target_id: string
          _target_type: string
        }
        Returns: undefined
      }
    }
    Enums: {
      attribute_subject: "member" | "chapter"
      attribute_type:
        | "text"
        | "number"
        | "date"
        | "boolean"
        | "choice"
        | "multi_choice"
        | "ordered"
      attribute_visibility: "admins" | "members" | "public"
      membership_event_kind:
        | "joined"
        | "renewed"
        | "approved"
        | "declined"
        | "cancelled"
      membership_status: "pending" | "active" | "cancelled" | "declined"
      org_type: "platform" | "national" | "region" | "chapter" | "standalone"
      payment_gateway: "manual" | "stripe" | "test"
      payment_method: "cash" | "check" | "card" | "bank_transfer" | "other"
      payment_purpose: "join" | "renew"
      payment_status: "pending" | "paid" | "refunded" | "failed"
      setting_mode: "inherit" | "override" | "locked"
      setup_status: "in_progress" | "applied" | "needs_review"
      tax_treatment: "deductible" | "non_deductible" | "partial"
      term_unit: "day" | "month" | "year"
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
  public: {
    Enums: {
      attribute_subject: ["member", "chapter"],
      attribute_type: [
        "text",
        "number",
        "date",
        "boolean",
        "choice",
        "multi_choice",
        "ordered",
      ],
      attribute_visibility: ["admins", "members", "public"],
      membership_event_kind: ["joined", "renewed", "approved", "declined", "cancelled"],
      membership_status: ["pending", "active", "cancelled", "declined"],
      org_type: ["platform", "national", "region", "chapter", "standalone"],
      payment_gateway: ["manual", "stripe", "test"],
      payment_method: ["cash", "check", "card", "bank_transfer", "other"],
      payment_purpose: ["join", "renew"],
      payment_status: ["pending", "paid", "refunded", "failed"],
      setting_mode: ["inherit", "override", "locked"],
      setup_status: ["in_progress", "applied", "needs_review"],
      tax_treatment: ["deductible", "non_deductible", "partial"],
      term_unit: ["day", "month", "year"],
    },
  },
} as const
