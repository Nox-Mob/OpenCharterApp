export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  charter: {
    Tables: {
      affiliation_history: {
        Row: {
          changed_by: string | null
          created_at: string
          from_org_id: string | null
          id: string
          membership_id: string
          org_id: string | null
          to_org_id: string | null
          unit_id: string
        }
        ComputedFields: never
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_org_id?: string | null
          id?: string
          membership_id: string
          org_id?: string | null
          to_org_id?: string | null
          unit_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_org_id?: string | null
          id?: string
          membership_id?: string
          org_id?: string | null
          to_org_id?: string | null
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliation_history_from_org_id_fkey"
            columns: ["from_org_id"]
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliation_history_membership_id_fkey"
            columns: ["membership_id"]
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliation_history_org_id_fkey"
            columns: ["unit_id"]
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliation_history_to_org_id_fkey"
            columns: ["to_org_id"]
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          appointed_by: string | null
          created_at: string
          end_reason: string
          ended_by: string | null
          ended_on: string | null
          id: string
          org_id: string | null
          planned_end: string | null
          profile_id: string
          role_assignment_id: string | null
          seat_number: number
          starts_on: string
          template_id: string
          unit_id: string
        }
        ComputedFields: never
        Insert: {
          appointed_by?: string | null
          created_at?: string
          end_reason?: string
          ended_by?: string | null
          ended_on?: string | null
          id?: string
          org_id?: string | null
          planned_end?: string | null
          profile_id: string
          role_assignment_id?: string | null
          seat_number: number
          starts_on: string
          template_id: string
          unit_id: string
        }
        Update: {
          appointed_by?: string | null
          created_at?: string
          end_reason?: string
          ended_by?: string | null
          ended_on?: string | null
          id?: string
          org_id?: string | null
          planned_end?: string | null
          profile_id?: string
          role_assignment_id?: string | null
          seat_number?: number
          starts_on?: string
          template_id?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_org_id_fkey"
            columns: ["unit_id"]
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_role_assignment_id_fkey"
            columns: ["role_assignment_id"]
            referencedRelation: "role_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_template_id_fkey"
            columns: ["template_id"]
            referencedRelation: "seat_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      attribute_definitions: {
        Row: {
          active: boolean
          applies_to: Database["charter"]["Enums"]["attribute_subject"]
          created_at: string
          data_type: Database["charter"]["Enums"]["attribute_type"]
          help: string
          id: string
          key: string
          label: string
          locked: boolean
          member_editable: boolean
          org_id: string | null
          required: boolean
          show_in_directory: boolean
          sort_order: number
          unit_id: string
          visibility: Database["charter"]["Enums"]["attribute_visibility"]
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          applies_to?: Database["charter"]["Enums"]["attribute_subject"]
          created_at?: string
          data_type: Database["charter"]["Enums"]["attribute_type"]
          help?: string
          id?: string
          key: string
          label: string
          locked?: boolean
          member_editable?: boolean
          org_id?: string | null
          required?: boolean
          show_in_directory?: boolean
          sort_order?: number
          unit_id: string
          visibility?: Database["charter"]["Enums"]["attribute_visibility"]
        }
        Update: {
          active?: boolean
          applies_to?: Database["charter"]["Enums"]["attribute_subject"]
          created_at?: string
          data_type?: Database["charter"]["Enums"]["attribute_type"]
          help?: string
          id?: string
          key?: string
          label?: string
          locked?: boolean
          member_editable?: boolean
          org_id?: string | null
          required?: boolean
          show_in_directory?: boolean
          sort_order?: number
          unit_id?: string
          visibility?: Database["charter"]["Enums"]["attribute_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "attribute_definitions_org_id_fkey"
            columns: ["unit_id"]
            referencedRelation: "units"
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
          org_id: string | null
          sort_order: number
          unit_id: string
          value: string
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          definition_id: string
          id?: string
          label: string
          org_id?: string | null
          sort_order?: number
          unit_id: string
          value: string
        }
        Update: {
          active?: boolean
          definition_id?: string
          id?: string
          label?: string
          org_id?: string | null
          sort_order?: number
          unit_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "attribute_options_definition_id_fkey"
            columns: ["definition_id"]
            referencedRelation: "attribute_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attribute_options_org_id_fkey"
            columns: ["unit_id"]
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      attribute_values: {
        Row: {
          definition_id: string
          entity_id: string
          id: string
          org_id: string | null
          unit_id: string
          updated_at: string
          updated_by: string | null
          value: NonNullable<Json>
        }
        ComputedFields: never
        Insert: {
          definition_id: string
          entity_id: string
          id?: string
          org_id?: string | null
          unit_id: string
          updated_at?: string
          updated_by?: string | null
          value: NonNullable<Json>
        }
        Update: {
          definition_id?: string
          entity_id?: string
          id?: string
          org_id?: string | null
          unit_id?: string
          updated_at?: string
          updated_by?: string | null
          value?: NonNullable<Json>
        }
        Relationships: [
          {
            foreignKeyName: "attribute_values_definition_id_fkey"
            columns: ["definition_id"]
            referencedRelation: "attribute_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attribute_values_org_id_fkey"
            columns: ["unit_id"]
            referencedRelation: "units"
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
          tx_id: number | null
          unit_id: string | null
        }
        ComputedFields: never
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
          tx_id?: number | null
          unit_id?: string | null
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
          tx_id?: number | null
          unit_id?: string | null
        }
        Relationships: []
      }
      gateway_connections: {
        Row: {
          account_label: string
          connected_at: string
          connected_by: string | null
          gateway: Database["charter"]["Enums"]["payment_gateway"]
          id: string
          livemode: boolean
          org_id: string | null
          status: Database["charter"]["Enums"]["gateway_status"]
          unit_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          account_label?: string
          connected_at?: string
          connected_by?: string | null
          gateway: Database["charter"]["Enums"]["payment_gateway"]
          id?: string
          livemode?: boolean
          org_id?: string | null
          status?: Database["charter"]["Enums"]["gateway_status"]
          unit_id: string
          updated_at?: string
        }
        Update: {
          account_label?: string
          connected_at?: string
          connected_by?: string | null
          gateway?: Database["charter"]["Enums"]["payment_gateway"]
          id?: string
          livemode?: boolean
          org_id?: string | null
          status?: Database["charter"]["Enums"]["gateway_status"]
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gateway_connections_org_id_fkey"
            columns: ["unit_id"]
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      gateway_secrets: {
        Row: {
          org_id: string | null
          sealed: string
          unit_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          org_id?: string | null
          sealed: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          org_id?: string | null
          sealed?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gateway_secrets_org_id_fkey"
            columns: ["unit_id"]
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      member_profiles: {
        Row: {
          claimed_at: string | null
          created_at: string
          directory_listed: boolean | null
          display_name: string
          email: string
          home_of: string | null
          id: string
          left_at: string | null
          org_id: string | null
          source: string
          unit_id: string
          user_id: string | null
          listed_in_directory: boolean | null
          profile_membership_id: string | null
        }
        ComputedFields: "listed_in_directory" | "profile_membership_id"
        Insert: {
          claimed_at?: string | null
          created_at?: string
          directory_listed?: boolean | null
          display_name?: string
          email?: string
          home_of?: string | null
          id?: string
          left_at?: string | null
          org_id?: string | null
          source?: string
          unit_id: string
          user_id?: string | null
        }
        Update: {
          claimed_at?: string | null
          created_at?: string
          directory_listed?: boolean | null
          display_name?: string
          email?: string
          home_of?: string | null
          id?: string
          left_at?: string | null
          org_id?: string | null
          source?: string
          unit_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_profiles_home_of_fkey"
            columns: ["home_of"]
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_profiles_org_id_fkey"
            columns: ["unit_id"]
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      member_segments: {
        Row: {
          created_at: string
          created_by: string | null
          filter: NonNullable<Json>
          id: string
          name: string
          org_id: string | null
          unit_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          created_by?: string | null
          filter?: NonNullable<Json>
          id?: string
          name: string
          org_id?: string | null
          unit_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          filter?: NonNullable<Json>
          id?: string
          name?: string
          org_id?: string | null
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_segments_org_id_fkey"
            columns: ["unit_id"]
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_events: {
        Row: {
          actor_id: string | null
          created_at: string
          id: number
          kind: Database["charter"]["Enums"]["membership_event_kind"]
          membership_id: string
          note: string
          org_id: string | null
          payment_id: string | null
          period_end: string | null
          period_start: string | null
          term_id: string | null
          tier_id: string | null
          unit_id: string
        }
        ComputedFields: never
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: number
          kind: Database["charter"]["Enums"]["membership_event_kind"]
          membership_id: string
          note?: string
          org_id?: string | null
          payment_id?: string | null
          period_end?: string | null
          period_start?: string | null
          term_id?: string | null
          tier_id?: string | null
          unit_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: number
          kind?: Database["charter"]["Enums"]["membership_event_kind"]
          membership_id?: string
          note?: string
          org_id?: string | null
          payment_id?: string | null
          period_end?: string | null
          period_start?: string | null
          term_id?: string | null
          tier_id?: string | null
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_events_membership_id_fkey"
            columns: ["membership_id"]
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_events_org_id_fkey"
            columns: ["unit_id"]
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_events_payment_id_fkey"
            columns: ["payment_id"]
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_events_term_id_fkey"
            columns: ["term_id"]
            referencedRelation: "tier_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_events_tier_id_fkey"
            columns: ["tier_id"]
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
          link_mode: string | null
          name: string
          org_id: string | null
          price_rule: string | null
          price_value: number | null
          sort_order: number
          source_tier_id: string | null
          suggested: boolean
          tax_treatment: Database["charter"]["Enums"]["tax_treatment"]
          unit_id: string
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          key: string
          link_mode?: string | null
          name: string
          org_id?: string | null
          price_rule?: string | null
          price_value?: number | null
          sort_order?: number
          source_tier_id?: string | null
          suggested?: boolean
          tax_treatment?: Database["charter"]["Enums"]["tax_treatment"]
          unit_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          key?: string
          link_mode?: string | null
          name?: string
          org_id?: string | null
          price_rule?: string | null
          price_value?: number | null
          sort_order?: number
          source_tier_id?: string | null
          suggested?: boolean
          tax_treatment?: Database["charter"]["Enums"]["tax_treatment"]
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_tiers_org_id_fkey"
            columns: ["unit_id"]
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_tiers_source_tier_id_fkey"
            columns: ["source_tier_id"]
            referencedRelation: "membership_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          home_org_id: string | null
          id: string
          joined_on: string | null
          lifetime: boolean
          org_id: string | null
          paid_through: string | null
          profile_id: string
          status: Database["charter"]["Enums"]["membership_status"]
          term_id: string
          tier_id: string
          unit_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          home_org_id?: string | null
          id?: string
          joined_on?: string | null
          lifetime?: boolean
          org_id?: string | null
          paid_through?: string | null
          profile_id: string
          status: Database["charter"]["Enums"]["membership_status"]
          term_id: string
          tier_id: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          home_org_id?: string | null
          id?: string
          joined_on?: string | null
          lifetime?: boolean
          org_id?: string | null
          paid_through?: string | null
          profile_id?: string
          status?: Database["charter"]["Enums"]["membership_status"]
          term_id?: string
          tier_id?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_home_org_id_fkey"
            columns: ["home_org_id"]
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["unit_id"]
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_term_id_fkey"
            columns: ["term_id"]
            referencedRelation: "tier_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_tier_id_fkey"
            columns: ["tier_id"]
            referencedRelation: "membership_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      org_settings: {
        Row: {
          key: string
          mode: Database["charter"]["Enums"]["setting_mode"]
          org_id: string | null
          unit_id: string
          updated_at: string
          value: Json | null
        }
        ComputedFields: never
        Insert: {
          key: string
          mode?: Database["charter"]["Enums"]["setting_mode"]
          org_id?: string | null
          unit_id: string
          updated_at?: string
          value?: Json | null
        }
        Update: {
          key?: string
          mode?: Database["charter"]["Enums"]["setting_mode"]
          org_id?: string | null
          unit_id?: string
          updated_at?: string
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "org_settings_org_id_fkey"
            columns: ["unit_id"]
            referencedRelation: "units"
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
          gateway: Database["charter"]["Enums"]["payment_gateway"]
          gateway_ref: string | null
          id: string
          join_answers: NonNullable<Json>
          livemode: boolean
          membership_id: string | null
          method: Database["charter"]["Enums"]["payment_method"] | null
          note: string
          org_id: string | null
          payer_user_id: string | null
          profile_id: string | null
          purpose: Database["charter"]["Enums"]["payment_purpose"]
          received_on: string | null
          refunded_amount_minor: number
          status: Database["charter"]["Enums"]["payment_status"]
          term_id: string | null
          unit_id: string
        }
        ComputedFields: never
        Insert: {
          amount_minor: number
          checkout_ref?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          failure_reason?: string | null
          gateway?: Database["charter"]["Enums"]["payment_gateway"]
          gateway_ref?: string | null
          id?: string
          join_answers?: NonNullable<Json>
          livemode?: boolean
          membership_id?: string | null
          method?: Database["charter"]["Enums"]["payment_method"] | null
          note?: string
          org_id?: string | null
          payer_user_id?: string | null
          profile_id?: string | null
          purpose: Database["charter"]["Enums"]["payment_purpose"]
          received_on?: string | null
          refunded_amount_minor?: number
          status: Database["charter"]["Enums"]["payment_status"]
          term_id?: string | null
          unit_id: string
        }
        Update: {
          amount_minor?: number
          checkout_ref?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          failure_reason?: string | null
          gateway?: Database["charter"]["Enums"]["payment_gateway"]
          gateway_ref?: string | null
          id?: string
          join_answers?: NonNullable<Json>
          livemode?: boolean
          membership_id?: string | null
          method?: Database["charter"]["Enums"]["payment_method"] | null
          note?: string
          org_id?: string | null
          payer_user_id?: string | null
          profile_id?: string | null
          purpose?: Database["charter"]["Enums"]["payment_purpose"]
          received_on?: string | null
          refunded_amount_minor?: number
          status?: Database["charter"]["Enums"]["payment_status"]
          term_id?: string | null
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_membership_id_fkey"
            columns: ["membership_id"]
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_org_id_fkey"
            columns: ["unit_id"]
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_term_id_fkey"
            columns: ["term_id"]
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
        ComputedFields: never
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
      platform_flags: {
        Row: {
          key: string
          updated_at: string
          value: NonNullable<Json>
        }
        ComputedFields: never
        Insert: {
          key: string
          updated_at?: string
          value: NonNullable<Json>
        }
        Update: {
          key?: string
          updated_at?: string
          value?: NonNullable<Json>
        }
        Relationships: []
      }
      platform_operators: {
        Row: {
          added_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          added_at?: string
          user_id: string
        }
        Update: {
          added_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pricing_rules: {
        Row: {
          active: boolean
          conditions: NonNullable<Json>
          created_at: string
          created_by: string | null
          discount_pct: number | null
          id: string
          label: string
          org_id: string | null
          price_minor: number | null
          sort_order: number
          term_id: string
          unit_id: string
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          conditions?: NonNullable<Json>
          created_at?: string
          created_by?: string | null
          discount_pct?: number | null
          id?: string
          label?: string
          org_id?: string | null
          price_minor?: number | null
          sort_order?: number
          term_id: string
          unit_id: string
        }
        Update: {
          active?: boolean
          conditions?: NonNullable<Json>
          created_at?: string
          created_by?: string | null
          discount_pct?: number | null
          id?: string
          label?: string
          org_id?: string | null
          price_minor?: number | null
          sort_order?: number
          term_id?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_org_id_fkey"
            columns: ["unit_id"]
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_rules_term_id_fkey"
            columns: ["term_id"]
            referencedRelation: "tier_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_counters: {
        Row: {
          last_seq: number
          org_id: string | null
          unit_id: string
          year: number
        }
        ComputedFields: never
        Insert: {
          last_seq?: number
          org_id?: string | null
          unit_id: string
          year: number
        }
        Update: {
          last_seq?: number
          org_id?: string | null
          unit_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "receipt_counters_org_id_fkey"
            columns: ["unit_id"]
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          id: string
          issued_at: string
          number: string
          org_id: string | null
          payment_id: string
          seq: number
          snapshot: NonNullable<Json>
          status: Database["charter"]["Enums"]["receipt_status"]
          supersedes_id: string | null
          unit_id: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          year: number
        }
        ComputedFields: never
        Insert: {
          id?: string
          issued_at?: string
          number: string
          org_id?: string | null
          payment_id: string
          seq: number
          snapshot: NonNullable<Json>
          status?: Database["charter"]["Enums"]["receipt_status"]
          supersedes_id?: string | null
          unit_id: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          year: number
        }
        Update: {
          id?: string
          issued_at?: string
          number?: string
          org_id?: string | null
          payment_id?: string
          seq?: number
          snapshot?: NonNullable<Json>
          status?: Database["charter"]["Enums"]["receipt_status"]
          supersedes_id?: string | null
          unit_id?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "receipts_org_id_fkey"
            columns: ["unit_id"]
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_payment_id_fkey"
            columns: ["payment_id"]
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_supersedes_id_fkey"
            columns: ["supersedes_id"]
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      role_assignments: {
        Row: {
          created_at: string
          id: string
          org_id: string | null
          role_id: string
          source: string
          unit_id: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          id?: string
          org_id?: string | null
          role_id: string
          source?: string
          unit_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string | null
          role_id?: string
          source?: string
          unit_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_assignments_org_id_fkey"
            columns: ["unit_id"]
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_assignments_role_id_fkey"
            columns: ["role_id"]
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
        ComputedFields: never
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
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
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
          unit_id: string | null
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          key: string
          name: string
          org_id?: string | null
          unit_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          key?: string
          name?: string
          org_id?: string | null
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roles_org_id_fkey"
            columns: ["unit_id"]
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      seat_contacts: {
        Row: {
          id: string
          org_id: string | null
          role_email: string | null
          template_id: string
          unit_id: string
          updated_at: string
          updated_by: string | null
        }
        ComputedFields: never
        Insert: {
          id?: string
          org_id?: string | null
          role_email?: string | null
          template_id: string
          unit_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          org_id?: string | null
          role_email?: string | null
          template_id?: string
          unit_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seat_contacts_org_id_fkey"
            columns: ["unit_id"]
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_contacts_template_id_fkey"
            columns: ["template_id"]
            referencedRelation: "seat_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      seat_templates: {
        Row: {
          active: boolean
          created_at: string
          default_term_count: number | null
          default_term_unit: Database["charter"]["Enums"]["term_unit"] | null
          description: string
          id: string
          key: string
          org_id: string | null
          required: boolean
          role_id: string | null
          scope: Database["charter"]["Enums"]["seat_scope"]
          seat_count: number
          sort_order: number
          title: string
          unit_id: string
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          created_at?: string
          default_term_count?: number | null
          default_term_unit?: Database["charter"]["Enums"]["term_unit"] | null
          description?: string
          id?: string
          key: string
          org_id?: string | null
          required?: boolean
          role_id?: string | null
          scope?: Database["charter"]["Enums"]["seat_scope"]
          seat_count?: number
          sort_order?: number
          title: string
          unit_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_term_count?: number | null
          default_term_unit?: Database["charter"]["Enums"]["term_unit"] | null
          description?: string
          id?: string
          key?: string
          org_id?: string | null
          required?: boolean
          role_id?: string | null
          scope?: Database["charter"]["Enums"]["seat_scope"]
          seat_count?: number
          sort_order?: number
          title?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seat_templates_org_id_fkey"
            columns: ["unit_id"]
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_templates_role_id_fkey"
            columns: ["role_id"]
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
          length_unit: Database["charter"]["Enums"]["term_unit"] | null
          note: string
          org_id: string | null
          set_by: string | null
          template_id: string
          unit_id: string
        }
        ComputedFields: never
        Insert: {
          bylaw_reference?: string
          created_at?: string
          effective_from: string
          id?: string
          length_count?: number | null
          length_unit?: Database["charter"]["Enums"]["term_unit"] | null
          note?: string
          org_id?: string | null
          set_by?: string | null
          template_id: string
          unit_id: string
        }
        Update: {
          bylaw_reference?: string
          created_at?: string
          effective_from?: string
          id?: string
          length_count?: number | null
          length_unit?: Database["charter"]["Enums"]["term_unit"] | null
          note?: string
          org_id?: string | null
          set_by?: string | null
          template_id?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seat_terms_org_id_fkey"
            columns: ["unit_id"]
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_terms_template_id_fkey"
            columns: ["template_id"]
            referencedRelation: "seat_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      seat_title_overrides: {
        Row: {
          id: string
          org_id: string | null
          template_id: string
          title: string | null
          unit_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          id?: string
          org_id?: string | null
          template_id: string
          title?: string | null
          unit_id: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string | null
          template_id?: string
          title?: string | null
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seat_title_overrides_org_id_fkey"
            columns: ["unit_id"]
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_title_overrides_template_id_fkey"
            columns: ["template_id"]
            referencedRelation: "seat_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      setup_states: {
        Row: {
          answers: NonNullable<Json>
          applied_at: string | null
          flow_id: string
          org_id: string | null
          status: Database["charter"]["Enums"]["setup_status"]
          unit_id: string
          updated_at: string
          updated_by: string | null
        }
        ComputedFields: never
        Insert: {
          answers?: NonNullable<Json>
          applied_at?: string | null
          flow_id: string
          org_id?: string | null
          status?: Database["charter"]["Enums"]["setup_status"]
          unit_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          answers?: NonNullable<Json>
          applied_at?: string | null
          flow_id?: string
          org_id?: string | null
          status?: Database["charter"]["Enums"]["setup_status"]
          unit_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "setup_states_org_id_fkey"
            columns: ["unit_id"]
            referencedRelation: "units"
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
          org_id: string | null
          postal_code: string
          region: string
          tax_status: string
          unit_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          address_line1?: string
          address_line2?: string
          city?: string
          country?: string
          ein?: string
          legal_name?: string
          org_id?: string | null
          postal_code?: string
          region?: string
          tax_status?: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          address_line1?: string
          address_line2?: string
          city?: string
          country?: string
          ein?: string
          legal_name?: string
          org_id?: string | null
          postal_code?: string
          region?: string
          tax_status?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_profiles_org_id_fkey"
            columns: ["unit_id"]
            referencedRelation: "units"
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
          length_unit: Database["charter"]["Enums"]["term_unit"] | null
          org_id: string | null
          price_minor: number
          sort_order: number
          source_term_id: string | null
          tier_id: string
          unit_id: string
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          created_at?: string
          currency?: string
          id?: string
          key: string
          label: string
          length_count?: number | null
          length_unit?: Database["charter"]["Enums"]["term_unit"] | null
          org_id?: string | null
          price_minor: number
          sort_order?: number
          source_term_id?: string | null
          tier_id: string
          unit_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          currency?: string
          id?: string
          key?: string
          label?: string
          length_count?: number | null
          length_unit?: Database["charter"]["Enums"]["term_unit"] | null
          org_id?: string | null
          price_minor?: number
          sort_order?: number
          source_term_id?: string | null
          tier_id?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tier_terms_org_id_fkey"
            columns: ["unit_id"]
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tier_terms_source_term_id_fkey"
            columns: ["source_term_id"]
            referencedRelation: "tier_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tier_terms_tier_id_fkey"
            columns: ["tier_id"]
            referencedRelation: "membership_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          ancestor_ids: string[]
          created_at: string
          created_by: string | null
          id: string
          is_demo: boolean
          logo_path: string | null
          name: string
          org_id: string | null
          parent_id: string | null
          slug: string
          status: string
          timezone: string
          type: Database["charter"]["Enums"]["org_type"]
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          ancestor_ids?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          is_demo?: boolean
          logo_path?: string | null
          name: string
          org_id?: string | null
          parent_id?: string | null
          slug: string
          status?: string
          timezone?: string
          type: Database["charter"]["Enums"]["org_type"]
          updated_at?: string
        }
        Update: {
          ancestor_ids?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          is_demo?: boolean
          logo_path?: string | null
          name?: string
          org_id?: string | null
          parent_id?: string | null
          slug?: string
          status?: string
          timezone?: string
          type?: Database["charter"]["Enums"]["org_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_parent_id_fkey"
            columns: ["parent_id"]
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          event_id: string
          gateway: Database["charter"]["Enums"]["payment_gateway"]
          id: number
          org_id: string | null
          payment_id: string | null
          received_at: string
          type: string
          unit_id: string
        }
        ComputedFields: never
        Insert: {
          event_id: string
          gateway: Database["charter"]["Enums"]["payment_gateway"]
          id?: number
          org_id?: string | null
          payment_id?: string | null
          received_at?: string
          type: string
          unit_id: string
        }
        Update: {
          event_id?: string
          gateway?: Database["charter"]["Enums"]["payment_gateway"]
          id?: number
          org_id?: string | null
          payment_id?: string | null
          received_at?: string
          type?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_org_id_fkey"
            columns: ["unit_id"]
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_payment_id_fkey"
            columns: ["payment_id"]
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
      adopt_suggested_level: {
        Args: {
          _mode: string
          _org: string
          _rule?: string
          _source: string
          _value?: number
        }
        Returns: string
      }
      ancestor_setting: { Args: { _key: string; _org: string }; Returns: Json }
      apply_setup: {
        Args: { _answers: Json; _flow: string; _org: string; _plan: Json }
        Returns: undefined
      }
      apply_setup_sections: {
        Args: Record<PropertyKey, never>
        Returns: string[]
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
      audit_log: {
        Args: { _before?: number; _limit?: number; _org: string }
        Returns: {
          action: string
          actor_id: string
          actor_name: string
          after: Json
          before: Json
          created_at: string
          id: number
          refs: Json
          target_id: string
          target_type: string
          tx_id: number
        }[]
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
      chapter_national_standing: {
        Args: { _chapter: string }
        Returns: {
          national_standing: string
          profile_id: string
        }[]
      }
      check_role_permissions: {
        Args: { _org: string; _perms: string[]; _uid: string }
        Returns: undefined
      }
      claim_webhook_event: {
        Args: {
          _event_id: string
          _gateway: Database["charter"]["Enums"]["payment_gateway"]
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
      create_demo_organization: {
        Args: {
          _name: string
          _slug: string
          _type: Database["charter"]["Enums"]["org_type"]
        }
        Returns: string
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
          _type: Database["charter"]["Enums"]["org_type"]
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
          _scope?: Database["charter"]["Enums"]["seat_scope"]
          _seat_count?: number
          _sort_order?: number
          _term_count?: number
          _term_unit?: Database["charter"]["Enums"]["term_unit"]
          _title: string
        }
        Returns: string
      }
      delete_demo_organization: {
        Args: { _confirm_name: string; _org: string }
        Returns: string[]
      }
      disconnect_gateway: { Args: { _org: string }; Returns: undefined }
      effective_approval_required: { Args: { _org: string }; Returns: boolean }
      effective_setting: { Args: { _key: string; _org: string }; Returns: Json }
      emails_allowed: { Args: { _org: string }; Returns: boolean }
      end_appointment: {
        Args: { _appointment: string; _ended_on?: string; _reason?: string }
        Returns: undefined
      }
      ensure_top_unit: {
        Args: {
          p_org: string
          p_slug?: string
          p_type?: Database["charter"]["Enums"]["org_type"]
        }
        Returns: string
      }
      export_payments: {
        Args: {
          _from: string
          _include_below?: boolean
          _org: string
          _to: string
        }
        Returns: {
          amount_minor: number
          currency: string
          email: string
          gateway: string
          level: string
          member: string
          method: string
          net_minor: number
          org_name: string
          purpose: string
          receipt: string
          received_on: string
          reference: string
          refunded_minor: number
          status: string
          tax_treatment: string
          term: string
          test_payment: boolean
        }[]
      }
      fail_gateway_payment: {
        Args: { _event_id: string; _payment: string; _reason: string }
        Returns: string
      }
      gateway_sealed_credentials: { Args: { _org: string }; Returns: string }
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
        Args: { _perm: string; _unit: string; _user: string }
        Returns: boolean
      }
      holds_all_role_permissions: {
        Args: { _org: string; _role: string; _user: string }
        Returns: boolean
      }
      import_members: {
        Args: { _apply?: boolean; _org: string; _rows: Json }
        Returns: Json
      }
      is_org_member: { Args: { _org: string; _user: string }; Returns: boolean }
      is_platform_operator: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_portal_member: {
        Args: { p_org: string; p_unit: string }
        Returns: boolean
      }
      issue_receipt: { Args: { _payment: string }; Returns: string }
      issue_receipt_internal: {
        Args: { _payment: string; _supersedes?: string }
        Returns: string
      }
      join_requirements: { Args: { _org: string }; Returns: Json }
      lineage_settings: {
        Args: { _org: string }
        Returns: {
          key: string
          mode: Database["charter"]["Enums"]["setting_mode"]
          unit_id: string
          value: Json
        }[]
      }
      linked_price: {
        Args: { _org: string; _price: number; _rule: string; _value: number }
        Returns: number
      }
      listed_in_directory: {
        Args: {
          _profile: Omit<
            Database["charter"]["Tables"]["member_profiles"]["Row"],
            Database["charter"]["Tables"]["member_profiles"]["ComputedFields"]
          >
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
      log_report_export: {
        Args: {
          _filter?: Json
          _org: string
          _report: string
          _row_count: number
        }
        Returns: undefined
      }
      make_level_own: { Args: { _tier: string }; Returns: undefined }
      mark_payment_refunded: {
        Args: {
          _amount_minor: number
          _event_id: string
          _gateway: Database["charter"]["Enums"]["payment_gateway"]
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
      membership_model: { Args: { _org: string }; Returns: string }
      membership_standing: {
        Args: {
          _grace: number
          _lifetime: boolean
          _paid_through: string
          _status: Database["charter"]["Enums"]["membership_status"]
          _today: string
        }
        Returns: string
      }
      move_home_chapter: {
        Args: { _chapter: string; _membership: string }
        Returns: undefined
      }
      national_dues_required: { Args: { _org: string }; Returns: boolean }
      national_membership_state: {
        Args: { _org: string; _user: string }
        Returns: string
      }
      national_org: { Args: { _org: string }; Returns: string }
      on_invitation_accepted: {
        Args: { p_invitation_id: string }
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
          scope: Database["charter"]["Enums"]["seat_scope"]
          seat_count: number
          template_id: string
          term_count: number
          term_since: string
          term_source: string
          term_unit: Database["charter"]["Enums"]["term_unit"]
          title: string
        }[]
      }
      org_board_contacts: {
        Args: { _org: string }
        Returns: {
          display_name: string
          email: string
          email_source: string
          seat_number: number
          sort_order: number
          template_id: string
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
          type: Database["charter"]["Enums"]["org_type"]
        }[]
      }
      org_overview_stats: {
        Args: { _org: string }
        Returns: {
          chapter_memberships: number
          chapters: number
          current_members: number
          expiring_30: number
          joined_30d: number
          lifetime_members: number
          orgs_below: number
          pending_members: number
          roster: number
        }[]
      }
      org_rollup_governance: {
        Args: { _org: string }
        Returns: {
          depth: number
          name: string
          required_seats: number
          terms_past_end: number
          unit_id: string
          vacant_required: number
          vacant_titles: string[]
        }[]
      }
      org_rollup_members: {
        Args: { _org: string }
        Returns: {
          depth: number
          ended: number
          expiring_30: number
          expiring_60: number
          expiring_90: number
          good: number
          grace: number
          joined_30d: number
          lapsed: number
          name: string
          no_membership: number
          parent_id: string
          pending: number
          profiles: number
          type: Database["charter"]["Enums"]["org_type"]
          unit_id: string
        }[]
      }
      org_rollup_revenue: {
        Args: { _from: string; _org: string; _to: string }
        Returns: {
          currency: string
          depth: number
          gross_minor: number
          name: string
          net_minor: number
          payments: number
          refunded_minor: number
          unit_id: string
        }[]
      }
      org_subtree: {
        Args: { _org: string }
        Returns: {
          depth: number
          name: string
          parent_id: string
          type: Database["charter"]["Enums"]["org_type"]
          unit_id: string
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
          _gateway: Database["charter"]["Enums"]["payment_gateway"]
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
      permitted_units: { Args: { p_perm: string }; Returns: string[] }
      pricing_condition_matches: {
        Args: { _c: Json; _values: Json }
        Returns: boolean
      }
      privacy_admin_override_allowed: {
        Args: { _org: string }
        Returns: boolean
      }
      profile_membership_id: {
        Args: {
          _p: Omit<
            Database["charter"]["Tables"]["member_profiles"]["Row"],
            Database["charter"]["Tables"]["member_profiles"]["ComputedFields"]
          >
        }
        Returns: string
      }
      profile_values: { Args: { _profile: string }; Returns: Json }
      public_home_chapter_info: { Args: { _slug: string }; Returns: Json }
      public_join_info: { Args: { _slug: string }; Returns: Json }
      purge_smoke_data: { Args: { _since: string }; Returns: Json }
      quote_price: { Args: { _answers?: Json; _term: string }; Returns: number }
      recalculate_planned_ends: {
        Args: { _org: string; _template: string }
        Returns: number
      }
      receipt_logo: { Args: { _org: string }; Returns: Json }
      receipt_snapshot: { Args: { _payment: string }; Returns: Json }
      receipt_tax_wording: {
        Args: { _treatment: Database["charter"]["Enums"]["tax_treatment"] }
        Returns: string
      }
      record_membership: {
        Args: {
          _amount_minor?: number
          _method?: Database["charter"]["Enums"]["payment_method"]
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
      remove_member_record: {
        Args: { _profile: string; _reason?: string }
        Returns: undefined
      }
      remove_role: { Args: { _assignment: string }; Returns: undefined }
      renewal_start: {
        Args: {
          _grace: number
          _lifetime: boolean
          _paid_through: string
          _status: Database["charter"]["Enums"]["membership_status"]
          _today: string
        }
        Returns: string
      }
      resolve_role: { Args: { _key: string; _org: string }; Returns: string }
      restore_member_record: { Args: { _profile: string }; Returns: undefined }
      revoke_invitation: { Args: { _id: string }; Returns: undefined }
      role_applies_at: {
        Args: {
          _org: string
          _role: Omit<
            Database["charter"]["Tables"]["roles"]["Row"],
            Database["charter"]["Tables"]["roles"]["ComputedFields"]
          >
        }
        Returns: boolean
      }
      save_pricing_rule: {
        Args: {
          _conditions: Json
          _discount_pct: number
          _label: string
          _price_minor: number
          _rule: string
          _sort_order: number
          _term: string
        }
        Returns: string
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
          _t: Omit<
            Database["charter"]["Tables"]["seat_templates"]["Row"],
            Database["charter"]["Tables"]["seat_templates"]["ComputedFields"]
          >
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
          _scope: Database["charter"]["Enums"]["seat_scope"]
          _term_count: number
          _term_unit: Database["charter"]["Enums"]["term_unit"]
        }
        Returns: undefined
      }
      seat_term_in_force: {
        Args: { _on: string; _org: string; _template: string }
        Returns: {
          length_count: number
          length_unit: Database["charter"]["Enums"]["term_unit"]
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
      set_home_chapter: {
        Args: { _chapter: string; _national: string }
        Returns: undefined
      }
      set_linked_level_price: {
        Args: { _rule: string; _tier: string; _value?: number }
        Returns: undefined
      }
      set_member_home_chapter: {
        Args: { _chapter: string; _membership: string }
        Returns: undefined
      }
      set_my_directory_listing: {
        Args: { _listed: boolean; _org: string }
        Returns: undefined
      }
      set_pricing_rule_active: {
        Args: { _active: boolean; _rule: string }
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
      set_seat_contact: {
        Args: { _org: string; _role_email: string; _template: string }
        Returns: undefined
      }
      set_seat_scope: {
        Args: {
          _scope: Database["charter"]["Enums"]["seat_scope"]
          _template: string
        }
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
          _unit: Database["charter"]["Enums"]["term_unit"]
        }
        Returns: string
      }
      set_seat_title: {
        Args: { _org: string; _template: string; _title: string }
        Returns: undefined
      }
      sync_linked_level: { Args: { _tier: string }; Returns: undefined }
      sync_my_email: { Args: Record<PropertyKey, never>; Returns: number }
      term_end: {
        Args: {
          _count: number
          _start: string
          _unit: Database["charter"]["Enums"]["term_unit"]
        }
        Returns: string
      }
      term_price: { Args: { _term: string; _values: Json }; Returns: number }
      test_gateway_allowed: { Args: { _org: string }; Returns: boolean }
      unit_org: { Args: { p_unit: string }; Returns: string }
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
          _term_unit: Database["charter"]["Enums"]["term_unit"]
          _title: string
        }
        Returns: undefined
      }
      validate_attribute_value: {
        Args: {
          _def: Omit<
            Database["charter"]["Tables"]["attribute_definitions"]["Row"],
            Database["charter"]["Tables"]["attribute_definitions"]["ComputedFields"]
          >
          _v: Json
        }
        Returns: undefined
      }
      validate_join_answers: {
        Args: { _answers: Json; _org: string }
        Returns: undefined
      }
      validate_pricing_conditions: {
        Args: { _conditions: Json; _org: string }
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
      seat_scope: "self" | "chapters" | "self_and_chapters"
      setting_mode: "inherit" | "override" | "locked"
      setup_status: "in_progress" | "applied" | "needs_review"
      tax_treatment: "deductible" | "non_deductible" | "partial"
      term_unit: "day" | "month" | "year"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      instance_settings: {
        Row: {
          billing_enabled: boolean
          hub_url: string | null
          id: boolean
        }
        ComputedFields: never
        Insert: {
          billing_enabled?: boolean
          hub_url?: string | null
          id?: boolean
        }
        Update: {
          billing_enabled?: boolean
          hub_url?: string | null
          id?: boolean
        }
        Relationships: []
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          app: string | null
          app_payload: NonNullable<Json>
          created_at: string
          email: string | null
          expires_at: string
          id: string
          invited_by: string | null
          org_id: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["org_role"] | null
          token_hash: string
        }
        ComputedFields: never
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          app?: string | null
          app_payload?: NonNullable<Json>
          created_at?: string
          email?: string | null
          expires_at: string
          id?: string
          invited_by?: string | null
          org_id: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["org_role"] | null
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          app?: string | null
          app_payload?: NonNullable<Json>
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["org_role"] | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_org_id_fkey"
            columns: ["org_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          org_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["org_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          id: string
          name: string
          slug: string | null
          time_zone: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          name: string
          slug?: string | null
          time_zone?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          name?: string
          slug?: string | null
          time_zone?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          display_name: string | null
          id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          avatar_url?: string | null
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _clean_org_name: { Args: { p_name: string }; Returns: string }
      _is_active_user: { Args: { p_user: string }; Returns: boolean }
      _member_confirm_text: { Args: { p_user: string }; Returns: string }
      _require_uid: { Args: Record<PropertyKey, never>; Returns: string }
      _token_hash: { Args: { p_token: string }; Returns: string }
      accept_invitation: {
        Args: { p_token: string }
        Returns: {
          app: string
          app_payload: Json
          id: string
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
        }[]
      }
      can_write: { Args: { p_app: string; p_org: string }; Returns: boolean }
      create_invitation: {
        Args: {
          p_app?: string
          p_days?: number
          p_email: string
          p_org: string
          p_payload?: Json
          p_role: Database["public"]["Enums"]["org_role"]
        }
        Returns: {
          invitation_id: string
          token: string
        }[]
      }
      create_organization: { Args: { p_name: string }; Returns: string }
      delete_organization: {
        Args: { p_confirm_name: string; p_org: string }
        Returns: undefined
      }
      get_invitation: {
        Args: { p_token: string }
        Returns: {
          app: string
          email: string
          org_name: string
          role: Database["public"]["Enums"]["org_role"]
          status: string
        }[]
      }
      has_app_access: {
        Args: { p_app: string; p_org: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          p_org: string
          p_roles: Database["public"]["Enums"]["org_role"][]
        }
        Returns: boolean
      }
      is_member: { Args: { p_org: string }; Returns: boolean }
      list_invitations: {
        Args: { p_org: string }
        Returns: {
          app: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          invited_by_name: string
          role: Database["public"]["Enums"]["org_role"]
          status: string
        }[]
      }
      org_member_directory: {
        Args: { p_org: string }
        Returns: {
          display_name: string
          email: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }[]
      }
      ownership_transfer_candidates: {
        Args: { p_org: string }
        Returns: {
          display_name: string
          email: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }[]
      }
      rename_organization: {
        Args: { p_name: string; p_org: string }
        Returns: undefined
      }
      revoke_invitation: { Args: { p_id: string }; Returns: undefined }
      set_organization_preferences: {
        Args: { p_currency: string; p_org: string; p_time_zone: string }
        Returns: undefined
      }
      shares_org: { Args: { p_user: string }; Returns: boolean }
      transfer_ownership:
        | { Args: { p_new_owner: string; p_org: string }; Returns: undefined }
        | {
            Args: { p_confirm: string; p_new_owner: string; p_org: string }
            Returns: undefined
          }
    }
    Enums: {
      org_role: "owner" | "admin" | "member" | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

// Charter's own schema is the default for Tables<…>, TablesInsert<…>, Enums<…> (the clients use db.schema "charter").
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "charter">]

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
  charter: {
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
      seat_scope: ["self", "chapters", "self_and_chapters"],
      setting_mode: ["inherit", "override", "locked"],
      setup_status: ["in_progress", "applied", "needs_review"],
      tax_treatment: ["deductible", "non_deductible", "partial"],
      term_unit: ["day", "month", "year"],
    },
  },
  public: {
    Enums: {
      org_role: ["owner", "admin", "member", "viewer"],
    },
  },
} as const
