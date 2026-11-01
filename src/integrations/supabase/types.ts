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
      appointments: {
        Row: {
          appointed_by: string | null
          created_at: string
          end_reason: string
          ended_by: string | null
          ended_on: string | null
          id: string
          org_id: string
          planned_end: string | null
          profile_id: string
          role_assignment_id: string | null
          seat_number: number
          starts_on: string
          template_id: string
        }
        Insert: {
          appointed_by?: string | null
          created_at?: string
          end_reason?: string
          ended_by?: string | null
          ended_on?: string | null
          id?: string
          org_id: string
          planned_end?: string | null
          profile_id: string
          role_assignment_id?: string | null
          seat_number: number
          starts_on: string
          template_id: string
        }
        Update: {
          appointed_by?: string | null
          created_at?: string
          end_reason?: string
          ended_by?: string | null
          ended_on?: string | null
          id?: string
          org_id?: string
          planned_end?: string | null
          profile_id?: string
          role_assignment_id?: string | null
          seat_number?: number
          starts_on?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "org_member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_role_assignment_id_fkey"
            columns: ["role_assignment_id"]
            isOneToOne: false
            referencedRelation: "role_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "seat_templates"
            referencedColumns: ["id"]
          },
        ]
      }
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
      gateway_connections: {
        Row: {
          account_label: string
          connected_at: string
          connected_by: string | null
          gateway: Database["public"]["Enums"]["payment_gateway"]
          id: string
          livemode: boolean
          org_id: string
          status: Database["public"]["Enums"]["gateway_status"]
          updated_at: string
        }
        Insert: {
          account_label?: string
          connected_at?: string
          connected_by?: string | null
          gateway: Database["public"]["Enums"]["payment_gateway"]
          id?: string
          livemode?: boolean
          org_id: string
          status?: Database["public"]["Enums"]["gateway_status"]
          updated_at?: string
        }
        Update: {
          account_label?: string
          connected_at?: string
          connected_by?: string | null
          gateway?: Database["public"]["Enums"]["payment_gateway"]
          id?: string
          livemode?: boolean
          org_id?: string
          status?: Database["public"]["Enums"]["gateway_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gateway_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
      member_segments: {
        Row: {
          created_at: string
          created_by: string | null
          filter: Json
          id: string
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          filter?: Json
          id?: string
          name: string
          org_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          filter?: Json
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_segments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          directory_listed: boolean | null
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
          directory_listed?: boolean | null
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
          directory_listed?: boolean | null
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
          checkout_ref: string | null
          created_at: string
          created_by: string | null
          currency: string
          failure_reason: string | null
          gateway: Database["public"]["Enums"]["payment_gateway"]
          gateway_ref: string | null
          id: string
          join_answers: Json
          livemode: boolean
          membership_id: string | null
          method: Database["public"]["Enums"]["payment_method"] | null
          note: string
          org_id: string
          payer_user_id: string | null
          profile_id: string | null
          purpose: Database["public"]["Enums"]["payment_purpose"]
          received_on: string | null
          refunded_amount_minor: number
          status: Database["public"]["Enums"]["payment_status"]
          term_id: string | null
        }
        Insert: {
          amount_minor: number
          checkout_ref?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          failure_reason?: string | null
          gateway?: Database["public"]["Enums"]["payment_gateway"]
          gateway_ref?: string | null
          id?: string
          join_answers?: Json
          livemode?: boolean
          membership_id?: string | null
          method?: Database["public"]["Enums"]["payment_method"] | null
          note?: string
          org_id: string
          payer_user_id?: string | null
          profile_id?: string | null
          purpose: Database["public"]["Enums"]["payment_purpose"]
          received_on?: string | null
          refunded_amount_minor?: number
          status: Database["public"]["Enums"]["payment_status"]
          term_id?: string | null
        }
        Update: {
          amount_minor?: number
          checkout_ref?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          failure_reason?: string | null
          gateway?: Database["public"]["Enums"]["payment_gateway"]
          gateway_ref?: string | null
          id?: string
          join_answers?: Json
          livemode?: boolean
          membership_id?: string | null
          method?: Database["public"]["Enums"]["payment_method"] | null
          note?: string
          org_id?: string
          payer_user_id?: string | null
          profile_id?: string | null
          purpose?: Database["public"]["Enums"]["payment_purpose"]
          received_on?: string | null
          refunded_amount_minor?: number
          status?: Database["public"]["Enums"]["payment_status"]
          term_id?: string | null
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
          {
            foreignKeyName: "payments_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "tier_terms"
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
      receipt_counters: {
        Row: {
          last_seq: number
          org_id: string
          year: number
        }
        Insert: {
          last_seq?: number
          org_id: string
          year: number
        }
        Update: {
          last_seq?: number
          org_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "receipt_counters_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          id: string
          issued_at: string
          number: string
          org_id: string
          payment_id: string
          seq: number
          snapshot: Json
          status: Database["public"]["Enums"]["receipt_status"]
          supersedes_id: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          year: number
        }
        Insert: {
          id?: string
          issued_at?: string
          number: string
          org_id: string
          payment_id: string
          seq: number
          snapshot: Json
          status?: Database["public"]["Enums"]["receipt_status"]
          supersedes_id?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          year: number
        }
        Update: {
          id?: string
          issued_at?: string
          number?: string
          org_id?: string
          payment_id?: string
          seq?: number
          snapshot?: Json
          status?: Database["public"]["Enums"]["receipt_status"]
          supersedes_id?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "receipts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
        ]
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
      seat_templates: {
        Row: {
          active: boolean
          created_at: string
          default_term_count: number | null
          default_term_unit: Database["public"]["Enums"]["term_unit"] | null
          description: string
          id: string
          key: string
          org_id: string
          required: boolean
          role_id: string | null
          scope: Database["public"]["Enums"]["seat_scope"]
          seat_count: number
          sort_order: number
          title: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_term_count?: number | null
          default_term_unit?: Database["public"]["Enums"]["term_unit"] | null
          description?: string
          id?: string
          key: string
          org_id: string
          required?: boolean
          role_id?: string | null
          scope?: Database["public"]["Enums"]["seat_scope"]
          seat_count?: number
          sort_order?: number
          title: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_term_count?: number | null
          default_term_unit?: Database["public"]["Enums"]["term_unit"] | null
          description?: string
          id?: string
          key?: string
          org_id?: string
          required?: boolean
          role_id?: string | null
          scope?: Database["public"]["Enums"]["seat_scope"]
          seat_count?: number
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "seat_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_templates_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      seat_terms: {
        Row: {
          bylaw_reference: string
          created_at: string
          effective_from: string
          id: string
          length_count: number | null
          length_unit: Database["public"]["Enums"]["term_unit"] | null
          note: string
          org_id: string
          set_by: string | null
          template_id: string
        }
        Insert: {
          bylaw_reference?: string
          created_at?: string
          effective_from: string
          id?: string
          length_count?: number | null
          length_unit?: Database["public"]["Enums"]["term_unit"] | null
          note?: string
          org_id: string
          set_by?: string | null
          template_id: string
        }
        Update: {
          bylaw_reference?: string
          created_at?: string
          effective_from?: string
          id?: string
          length_count?: number | null
          length_unit?: Database["public"]["Enums"]["term_unit"] | null
          note?: string
          org_id?: string
          set_by?: string | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seat_terms_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_terms_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "seat_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      seat_title_overrides: {
        Row: {
          id: string
          org_id: string
          template_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          template_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          template_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seat_title_overrides_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_title_overrides_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "seat_templates"
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
      webhook_events: {
        Row: {
          event_id: string
          gateway: Database["public"]["Enums"]["payment_gateway"]
          id: number
          org_id: string
          payment_id: string | null
          received_at: string
          type: string
        }
        Insert: {
          event_id: string
          gateway: Database["public"]["Enums"]["payment_gateway"]
          id?: number
          org_id: string
          payment_id?: string | null
          received_at?: string
          type: string
        }
        Update: {
          event_id?: string
          gateway?: Database["public"]["Enums"]["payment_gateway"]
          id?: number
          org_id?: string
          payment_id?: string | null
          received_at?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
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
      ancestor_setting: { Args: { _key: string; _org: string }; Returns: Json }
      apply_setup: {
        Args: { _answers: Json; _flow: string; _org: string; _plan: Json }
        Returns: undefined
      }
      appoint_officer: {
        Args: {
          _org: string
          _profile: string
          _seat_number?: number
          _starts_on?: string
          _template: string
        }
        Returns: string
      }
      approve_membership: {
        Args: { _membership: string; _note?: string }
        Returns: undefined
      }
      assign_role: {
        Args: { _org: string; _role_key: string; _user: string }
        Returns: string
      }
      begin_join: {
        Args: { _answers?: Json; _org: string; _term: string }
        Returns: string
      }
      begin_renewal: {
        Args: { _membership: string; _term: string }
        Returns: string
      }
      board_history: {
        Args: { _org: string }
        Returns: {
          appointment_id: string
          display_name: string
          end_reason: string
          ended_on: string
          planned_end: string
          seat_number: number
          starts_on: string
          template_id: string
        }[]
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
      cancel_membership: {
        Args: { _membership: string; _note?: string }
        Returns: undefined
      }
      check_role_permissions: {
        Args: { _org: string; _perms: string[]; _uid: string }
        Returns: undefined
      }
      claim_webhook_event: {
        Args: {
          _event_id: string
          _gateway: Database["public"]["Enums"]["payment_gateway"]
          _org: string
          _payment?: string
          _type: string
        }
        Returns: boolean
      }
      complete_gateway_payment: {
        Args: {
          _amount_minor: number
          _currency: string
          _event_id: string
          _gateway_ref: string
          _livemode: boolean
          _payment: string
        }
        Returns: string
      }
      complete_test_payment: {
        Args: { _outcome: string; _payment: string }
        Returns: string
      }
      connect_test_gateway: { Args: { _org: string }; Returns: undefined }
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
      decline_application: {
        Args: { _membership: string; _note?: string }
        Returns: Json
      }
      decline_membership: {
        Args: { _membership: string; _note?: string }
        Returns: undefined
      }
      define_seat: {
        Args: {
          _description?: string
          _key: string
          _org: string
          _required?: boolean
          _role?: string
          _scope?: Database["public"]["Enums"]["seat_scope"]
          _seat_count?: number
          _sort_order?: number
          _term_count?: number
          _term_unit?: Database["public"]["Enums"]["term_unit"]
          _title: string
        }
        Returns: string
      }
      disconnect_gateway: { Args: { _org: string }; Returns: undefined }
      effective_approval_required: { Args: { _org: string }; Returns: boolean }
      effective_setting: { Args: { _key: string; _org: string }; Returns: Json }
      end_appointment: {
        Args: { _appointment: string; _ended_on?: string; _reason?: string }
        Returns: undefined
      }
      fail_gateway_payment: {
        Args: { _event_id: string; _payment: string; _reason: string }
        Returns: string
      }
      gateway_sealed_credentials: { Args: { _org: string }; Returns: string }
      get_invitation: {
        Args: { _token: string }
        Returns: {
          org_name: string
          usable: boolean
        }[]
      }
      grace_days: { Args: { _org: string }; Returns: number }
      grant_membership_term: {
        Args: {
          _actor: string
          _paid_on: string
          _payment: string
          _pending: boolean
          _profile: string
          _term: string
        }
        Returns: string
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
      issue_receipt: { Args: { _payment: string }; Returns: string }
      issue_receipt_internal: {
        Args: { _payment: string; _supersedes?: string }
        Returns: string
      }
      lineage_settings: {
        Args: { _org: string }
        Returns: {
          key: string
          mode: Database["public"]["Enums"]["setting_mode"]
          org_id: string
          value: Json
        }[]
      }
      listed_in_directory: {
        Args: {
          _profile: Database["public"]["Tables"]["org_member_profiles"]["Row"]
        }
        Returns: boolean
      }
      log_member_export: {
        Args: {
          _columns: string[]
          _filter?: Json
          _org: string
          _row_count: number
        }
        Returns: undefined
      }
      mark_payment_refunded: {
        Args: {
          _amount_minor: number
          _event_id: string
          _gateway: Database["public"]["Enums"]["payment_gateway"]
          _gateway_ref: string
        }
        Returns: string
      }
      member_directory: {
        Args: { _org: string }
        Returns: {
          display_name: string
          fields: Json
          profile_id: string
        }[]
      }
      membership_standing: {
        Args: {
          _grace: number
          _lifetime: boolean
          _paid_through: string
          _status: Database["public"]["Enums"]["membership_status"]
          _today: string
        }
        Returns: string
      }
      org_board: {
        Args: { _org: string }
        Returns: {
          bylaw_reference: string
          default_title: string
          description: string
          holders: Json
          key: string
          owner_org_id: string
          required: boolean
          role_id: string
          scope: Database["public"]["Enums"]["seat_scope"]
          seat_count: number
          template_id: string
          term_count: number
          term_since: string
          term_source: string
          term_unit: Database["public"]["Enums"]["term_unit"]
          title: string
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
      payment_failed: {
        Args: { _event_id: string; _payment: string; _reason: string }
        Returns: string
      }
      payment_refunded: {
        Args: {
          _amount_minor: number
          _event_id: string
          _gateway: Database["public"]["Enums"]["payment_gateway"]
          _gateway_ref: string
        }
        Returns: string
      }
      payment_succeeded: {
        Args: {
          _amount_minor: number
          _currency: string
          _event_id: string
          _gateway_ref: string
          _livemode: boolean
          _payment: string
        }
        Returns: string
      }
      privacy_admin_override_allowed: {
        Args: { _org: string }
        Returns: boolean
      }
      public_join_info: { Args: { _slug: string }; Returns: Json }
      recalculate_planned_ends: {
        Args: { _org: string; _template: string }
        Returns: number
      }
      receipt_logo: { Args: { _org: string }; Returns: Json }
      receipt_snapshot: { Args: { _payment: string }; Returns: Json }
      receipt_tax_wording: {
        Args: { _treatment: Database["public"]["Enums"]["tax_treatment"] }
        Returns: string
      }
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
      reissue_receipt: {
        Args: { _reason: string; _receipt: string }
        Returns: string
      }
      remove_role: { Args: { _assignment: string }; Returns: undefined }
      renewal_start: {
        Args: {
          _grace: number
          _lifetime: boolean
          _paid_through: string
          _status: Database["public"]["Enums"]["membership_status"]
          _today: string
        }
        Returns: string
      }
      resolve_role: { Args: { _key: string; _org: string }; Returns: string }
      revoke_invitation: { Args: { _id: string }; Returns: undefined }
      role_applies_at: {
        Args: {
          _org: string
          _role: Database["public"]["Tables"]["roles"]["Row"]
        }
        Returns: boolean
      }
      save_stripe_connection: {
        Args: {
          _account_label: string
          _livemode: boolean
          _org: string
          _sealed: string
        }
        Returns: undefined
      }
      seat_applies_at: {
        Args: {
          _org: string
          _t: Database["public"]["Tables"]["seat_templates"]["Row"]
        }
        Returns: boolean
      }
      seat_planned_end: {
        Args: {
          _org: string
          _rule_on: string
          _starts_on: string
          _template: string
        }
        Returns: string
      }
      seat_template_check: {
        Args: {
          _org: string
          _role: string
          _scope: Database["public"]["Enums"]["seat_scope"]
          _term_count: number
          _term_unit: Database["public"]["Enums"]["term_unit"]
        }
        Returns: undefined
      }
      seat_term_in_force: {
        Args: { _on: string; _org: string; _template: string }
        Returns: {
          length_count: number
          length_unit: Database["public"]["Enums"]["term_unit"]
          source: string
          term_id: string
        }[]
      }
      set_attribute_value: {
        Args: { _def: string; _entity: string; _value: Json }
        Returns: undefined
      }
      set_checkout_ref: {
        Args: { _payment: string; _ref: string }
        Returns: undefined
      }
      set_my_directory_listing: {
        Args: { _listed: boolean; _org: string }
        Returns: undefined
      }
      set_role_active: {
        Args: { _active: boolean; _role: string }
        Returns: undefined
      }
      set_seat_active: {
        Args: { _active: boolean; _template: string }
        Returns: undefined
      }
      set_seat_term: {
        Args: {
          _bylaw_reference?: string
          _count: number
          _effective_from: string
          _note?: string
          _org: string
          _template: string
          _unit: Database["public"]["Enums"]["term_unit"]
        }
        Returns: string
      }
      set_seat_title: {
        Args: { _org: string; _template: string; _title: string }
        Returns: undefined
      }
      term_end: {
        Args: {
          _count: number
          _start: string
          _unit: Database["public"]["Enums"]["term_unit"]
        }
        Returns: string
      }
      test_gateway_allowed: { Args: { _org: string }; Returns: boolean }
      update_member_record: {
        Args: { _display_name: string; _email: string; _profile: string }
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
      update_seat: {
        Args: {
          _description: string
          _required: boolean
          _role: string
          _seat_count: number
          _sort_order?: number
          _template: string
          _term_count: number
          _term_unit: Database["public"]["Enums"]["term_unit"]
          _title: string
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
      validate_join_answers: {
        Args: { _answers: Json; _org: string }
        Returns: undefined
      }
      void_receipt: {
        Args: { _reason: string; _receipt: string }
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
      gateway_status: "verified" | "disabled"
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
      receipt_status: "issued" | "voided" | "superseded"
      seat_scope: "self" | "chapters"
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
      gateway_status: ["verified", "disabled"],
      membership_event_kind: [
        "joined",
        "renewed",
        "approved",
        "declined",
        "cancelled",
      ],
      membership_status: ["pending", "active", "cancelled", "declined"],
      org_type: ["platform", "national", "region", "chapter", "standalone"],
      payment_gateway: ["manual", "stripe", "test"],
      payment_method: ["cash", "check", "card", "bank_transfer", "other"],
      payment_purpose: ["join", "renew"],
      payment_status: ["pending", "paid", "refunded", "failed"],
      receipt_status: ["issued", "voided", "superseded"],
      seat_scope: ["self", "chapters"],
      setting_mode: ["inherit", "override", "locked"],
      setup_status: ["in_progress", "applied", "needs_review"],
      tax_treatment: ["deductible", "non_deductible", "partial"],
      term_unit: ["day", "month", "year"],
    },
  },
} as const
