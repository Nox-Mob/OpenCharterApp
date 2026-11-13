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
            isOneToOne: false
            referencedRelation: "api_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliation_history_from_org_id_fkey"
            columns: ["from_org_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliation_history_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliation_history_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "api_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliation_history_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliation_history_to_org_id_fkey"
            columns: ["to_org_id"]
            isOneToOne: false
            referencedRelation: "api_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliation_history_to_org_id_fkey"
            columns: ["to_org_id"]
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "api_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "member_profiles"
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
            isOneToOne: false
            referencedRelation: "api_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attribute_definitions_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "attribute_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attribute_options_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "api_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attribute_options_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
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
          value: Json
        }
        Insert: {
          definition_id: string
          entity_id: string
          id?: string
          org_id?: string | null
          unit_id: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          definition_id?: string
          entity_id?: string
          id?: string
          org_id?: string | null
          unit_id?: string
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
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "api_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attribute_values_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
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
      chapter_board_requests: {
        Row: {
          board_org_id: string | null
          decided_at: string | null
          decided_by: string | null
          id: string
          note: string | null
          org_id: string
          requested_at: string
          requested_by: string | null
          status: string
          unit_id: string
        }
        Insert: {
          board_org_id?: string | null
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          note?: string | null
          org_id: string
          requested_at?: string
          requested_by?: string | null
          status?: string
          unit_id: string
        }
        Update: {
          board_org_id?: string | null
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          note?: string | null
          org_id?: string
          requested_at?: string
          requested_by?: string | null
          status?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapter_board_requests_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "api_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapter_board_requests_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
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
            isOneToOne: true
            referencedRelation: "api_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gateway_connections_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: true
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
            isOneToOne: true
            referencedRelation: "api_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gateway_secrets_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: true
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
        }
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
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_profiles_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "api_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_profiles_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
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
          org_id: string | null
          unit_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          filter?: Json
          id?: string
          name: string
          org_id?: string | null
          unit_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          filter?: Json
          id?: string
          name?: string
          org_id?: string | null
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_segments_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "api_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_segments_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_events_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "api_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_events_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
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
            isOneToOne: false
            referencedRelation: "api_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_tiers_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_tiers_source_tier_id_fkey"
            columns: ["source_tier_id"]
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "api_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_home_org_id_fkey"
            columns: ["home_org_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "api_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "member_profiles"
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
      org_settings: {
        Row: {
          key: string
          mode: Database["charter"]["Enums"]["setting_mode"]
          org_id: string | null
          unit_id: string
          updated_at: string
          value: Json | null
        }
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
            isOneToOne: false
            referencedRelation: "api_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_settings_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
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
          join_answers: Json
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
          join_answers?: Json
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
          join_answers?: Json
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
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "api_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "member_profiles"
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
      platform_flags: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      platform_operators: {
        Row: {
          added_at: string
          user_id: string
        }
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
          conditions: Json
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
        Insert: {
          active?: boolean
          conditions?: Json
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
          conditions?: Json
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
            isOneToOne: false
            referencedRelation: "api_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_rules_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_rules_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "api_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_counters_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
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
          snapshot: Json
          status: Database["charter"]["Enums"]["receipt_status"]
          supersedes_id: string | null
          unit_id: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          year: number
        }
        Insert: {
          id?: string
          issued_at?: string
          number: string
          org_id?: string | null
          payment_id: string
          seq: number
          snapshot: Json
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
          snapshot?: Json
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
            isOneToOne: false
            referencedRelation: "api_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
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
          org_id: string | null
          role_id: string
          source: string
          unit_id: string
          user_id: string
        }
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
            isOneToOne: false
            referencedRelation: "api_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_assignments_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
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
          unit_id: string | null
        }
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
            isOneToOne: false
            referencedRelation: "api_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roles_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "api_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_contacts_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_contacts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "api_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_templates_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
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
          length_unit: Database["charter"]["Enums"]["term_unit"] | null
          note: string
          org_id: string | null
          set_by: string | null
          template_id: string
          unit_id: string
        }
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
            isOneToOne: false
            referencedRelation: "api_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_terms_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
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
          org_id: string | null
          template_id: string
          title: string | null
          unit_id: string
          updated_at: string
        }
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
            isOneToOne: false
            referencedRelation: "api_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_title_overrides_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
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
          org_id: string | null
          status: Database["charter"]["Enums"]["setup_status"]
          unit_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          answers?: Json
          applied_at?: string | null
          flow_id: string
          org_id?: string | null
          status?: Database["charter"]["Enums"]["setup_status"]
          unit_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          answers?: Json
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
            isOneToOne: false
            referencedRelation: "api_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setup_states_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
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
            isOneToOne: true
            referencedRelation: "api_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_profiles_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: true
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
            isOneToOne: false
            referencedRelation: "api_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tier_terms_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tier_terms_source_term_id_fkey"
            columns: ["source_term_id"]
            isOneToOne: false
            referencedRelation: "tier_terms"
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
            isOneToOne: false
            referencedRelation: "api_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "api_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
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
      api_board_seats: {
        Row: {
          holder_name: string | null
          id: string | null
          org_id: string | null
          planned_end: string | null
          required: boolean | null
          seat_id: string | null
          seat_number: number | null
          starts_on: string | null
          title: string | null
          unit_id: string | null
          unit_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "api_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_org_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_template_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "seat_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      api_member_summary: {
        Row: {
          current_members: number | null
          org_id: string | null
          pending_requests: number | null
          renewals_due: number | null
        }
        Relationships: []
      }
      api_people: {
        Row: {
          org_id: string | null
          roles: string | null
          user_id: string | null
        }
        Relationships: []
      }
      api_tasks: {
        Row: {
          due_on: string | null
          item_id: string | null
          kind: string | null
          link: string | null
          org_id: string | null
          title: string | null
          unit_id: string | null
          unit_name: string | null
        }
        Relationships: []
      }
      api_unit_count: {
        Row: {
          org_id: string | null
          units: number | null
        }
        Relationships: []
      }
      api_units: {
        Row: {
          created_at: string | null
          id: string | null
          name: string | null
          org_id: string | null
          parent_id: string | null
          slug: string | null
          status: string | null
          type: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          name?: string | null
          org_id?: string | null
          parent_id?: string | null
          slug?: string | null
          status?: string | null
          type?: never
        }
        Update: {
          created_at?: string | null
          id?: string | null
          name?: string | null
          org_id?: string | null
          parent_id?: string | null
          slug?: string | null
          status?: string | null
          type?: never
        }
        Relationships: [
          {
            foreignKeyName: "units_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "api_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _chapter_board_email: {
        Args: { p_request: string; p_template: string }
        Returns: undefined
      }
      _enable_chapter_board: {
        Args: { p_owner: string; p_unit: string }
        Returns: string
      }
      _wf_member_ctx: {
        Args: { p_membership?: string; p_profile: string; p_unit: string }
        Returns: Json
      }
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
      apply_setup_sections: { Args: never; Returns: string[] }
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
      appointment_from_board: {
        Args: {
          p_org: string
          p_person_name: string
          p_position: string
          p_start: string
          p_user_id: string
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
      board_org_for_unit: { Args: { p_unit: string }; Returns: string }
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
      cancel_chapter_board_request: {
        Args: { p_request: string }
        Returns: undefined
      }
      cancel_membership: {
        Args: { _membership: string; _note?: string }
        Returns: undefined
      }
      chapter_board_policy: { Args: { p_unit: string }; Returns: string }
      chapter_board_requests_for: {
        Args: { p_org: string }
        Returns: {
          board_org_id: string
          chapter: string
          decided_at: string
          id: string
          note: string
          requested_at: string
          requested_by_name: string
          status: string
          unit_id: string
        }[]
      }
      chapter_board_status: {
        Args: { p_unit: string }
        Returns: {
          board_org_id: string
          can_request: boolean
          note: string
          policy: string
          request_id: string
          status: string
        }[]
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
      decide_chapter_board: {
        Args: { p_approve: boolean; p_note?: string; p_request: string }
        Returns: undefined
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
      end_appointment_from_board: {
        Args: { p_appointment: string; p_ended_on: string }
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
      is_platform_operator: { Args: never; Returns: boolean }
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
          _profile: Database["charter"]["Tables"]["member_profiles"]["Row"]
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
        Args: { _p: Database["charter"]["Tables"]["member_profiles"]["Row"] }
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
      request_chapter_board: { Args: { p_unit: string }; Returns: string }
      resolve_role: { Args: { _key: string; _org: string }; Returns: string }
      restore_member_record: { Args: { _profile: string }; Returns: undefined }
      revoke_invitation: { Args: { _id: string }; Returns: undefined }
      role_applies_at: {
        Args: {
          _org: string
          _role: Database["charter"]["Tables"]["roles"]["Row"]
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
          _t: Database["charter"]["Tables"]["seat_templates"]["Row"]
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
      slug_available: { Args: { p_slug: string }; Returns: boolean }
      sync_linked_level: { Args: { _tier: string }; Returns: undefined }
      sync_my_email: { Args: never; Returns: number }
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
      unit_for_board_org: { Args: { p_org: string }; Returns: string }
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
          _def: Database["charter"]["Tables"]["attribute_definitions"]["Row"]
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
      wf_find_members: {
        Args: { p_org: string; p_params: Json }
        Returns: Json
      }
      wf_member_fields: { Args: { p_org: string }; Returns: Json }
      wf_membership_lapsed: {
        Args: { p_org: string; p_params: Json }
        Returns: {
          ctx: Json
          dedupe: string
        }[]
      }
      wf_seat_holders: {
        Args: { p_ctx: Json; p_org: string; p_params: Json }
        Returns: {
          email: string
          user_id: string
        }[]
      }
      wf_seat_options: { Args: { p_org: string }; Returns: Json }
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
      _core_migration_marks: {
        Row: {
          done_at: string
          mark: string
        }
        Insert: {
          done_at?: string
          mark: string
        }
        Update: {
          done_at?: string
          mark?: string
        }
        Relationships: []
      }
      action_links: {
        Row: {
          comment_arg: string | null
          created_at: string
          expires_at: string
          id: string
          kind: string
          label: string
          open_app: string | null
          open_link: string | null
          org_id: string
          rpc_args: Json
          rpc_fn: string
          rpc_schema: string
          token_hash: string
          used_at: string | null
          user_id: string
          what: string
        }
        Insert: {
          comment_arg?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          kind: string
          label: string
          open_app?: string | null
          open_link?: string | null
          org_id: string
          rpc_args?: Json
          rpc_fn: string
          rpc_schema: string
          token_hash: string
          used_at?: string | null
          user_id: string
          what?: string
        }
        Update: {
          comment_arg?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          kind?: string
          label?: string
          open_app?: string | null
          open_link?: string | null
          org_id?: string
          rpc_args?: Json
          rpc_fn?: string
          rpc_schema?: string
          token_hash?: string
          used_at?: string | null
          user_id?: string
          what?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_links_kind_fkey"
            columns: ["kind"]
            isOneToOne: false
            referencedRelation: "email_action_kinds"
            referencedColumns: ["kind"]
          },
          {
            foreignKeyName: "action_links_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      app_permission_types: {
        Row: {
          app: string
          description: string
          key: string
          label: string
          sort: number
        }
        Insert: {
          app: string
          description?: string
          key: string
          label: string
          sort?: number
        }
        Update: {
          app?: string
          description?: string
          key?: string
          label?: string
          sort?: number
        }
        Relationships: []
      }
      app_role_overrides: {
        Row: {
          app: string
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          set_at: string
          set_by: string | null
          user_id: string
        }
        Insert: {
          app: string
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          set_at?: string
          set_by?: string | null
          user_id: string
        }
        Update: {
          app?: string
          org_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          set_at?: string
          set_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_role_overrides_org_id_user_id_fkey"
            columns: ["org_id", "user_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["org_id", "user_id"]
          },
        ]
      }
      approval_approvers: {
        Row: {
          comment: string
          decided_at: string | null
          decision: string | null
          request_id: string
          user_id: string
        }
        Insert: {
          comment?: string
          decided_at?: string | null
          decision?: string | null
          request_id: string
          user_id: string
        }
        Update: {
          comment?: string
          decided_at?: string | null
          decision?: string | null
          request_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_approvers_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          details: string
          due_at: string | null
          id: string
          mode: string
          org_id: string
          run_id: number | null
          status: string
          step_key: string
          what: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          details?: string
          due_at?: string | null
          id?: string
          mode?: string
          org_id: string
          run_id?: number | null
          status?: string
          step_key?: string
          what: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          details?: string
          due_at?: string | null
          id?: string
          mode?: string
          org_id?: string
          run_id?: number | null
          status?: string
          step_key?: string
          what?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "automation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_action_types: {
        Row: {
          app: string
          description: string
          kind: string
          label: string
          output_schema: Json
          params_schema: Json
          requires: string[]
          run_fn: string | null
          sort: number
          type: string
        }
        Insert: {
          app: string
          description?: string
          kind?: string
          label: string
          output_schema?: Json
          params_schema?: Json
          requires?: string[]
          run_fn?: string | null
          sort?: number
          type: string
        }
        Update: {
          app?: string
          description?: string
          kind?: string
          label?: string
          output_schema?: Json
          params_schema?: Json
          requires?: string[]
          run_fn?: string | null
          sort?: number
          type?: string
        }
        Relationships: []
      }
      automation_editors: {
        Row: {
          granted_at: string
          granted_by: string | null
          org_id: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          org_id: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_editors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_events: {
        Row: {
          ctx: Json
          id: number
          occurred_at: string
          org_id: string
          processed_at: string | null
          type: string
        }
        Insert: {
          ctx?: Json
          id?: never
          occurred_at?: string
          org_id: string
          processed_at?: string | null
          type: string
        }
        Update: {
          ctx?: Json
          id?: never
          occurred_at?: string
          org_id?: string
          processed_at?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_jobs: {
        Row: {
          app: string
          attempts: number
          created_at: string
          error: string | null
          id: number
          kind: string
          org_id: string
          payload: Json
          result: Json | null
          run_id: number | null
          status: string
          updated_at: string
        }
        Insert: {
          app: string
          attempts?: number
          created_at?: string
          error?: string | null
          id?: never
          kind: string
          org_id: string
          payload?: Json
          result?: Json | null
          run_id?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          app?: string
          attempts?: number
          created_at?: string
          error?: string | null
          id?: never
          kind?: string
          org_id?: string
          payload?: Json
          result?: Json | null
          run_id?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_jobs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "automation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_kinds: {
        Row: {
          app: string
          category: string
          default_enabled: boolean
          default_params: Json
          description: string
          key: string
          name: string
          params_schema: Json
          sort: number
        }
        Insert: {
          app: string
          category?: string
          default_enabled?: boolean
          default_params?: Json
          description: string
          key: string
          name: string
          params_schema?: Json
          sort?: number
        }
        Update: {
          app?: string
          category?: string
          default_enabled?: boolean
          default_params?: Json
          description?: string
          key?: string
          name?: string
          params_schema?: Json
          sort?: number
        }
        Relationships: []
      }
      automation_log: {
        Row: {
          at: string
          count: number
          id: number
          kind: string
          org_id: string
          summary: string
        }
        Insert: {
          at?: string
          count?: number
          id?: never
          kind: string
          org_id: string
          summary: string
        }
        Update: {
          at?: string
          count?: number
          id?: never
          kind?: string
          org_id?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_log_kind_fkey"
            columns: ["kind"]
            isOneToOne: false
            referencedRelation: "automation_kinds"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "automation_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_org_settings: {
        Row: {
          chapters_may_build: boolean
          org_id: string
          updated_at: string
        }
        Insert: {
          chapters_may_build?: boolean
          org_id: string
          updated_at?: string
        }
        Update: {
          chapters_may_build?: boolean
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_org_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_recipient_types: {
        Row: {
          app: string
          description: string
          label: string
          options_fn: string | null
          params_schema: Json
          resolve_fn: string
          sort: number
          type: string
        }
        Insert: {
          app: string
          description?: string
          label: string
          options_fn?: string | null
          params_schema?: Json
          resolve_fn: string
          sort?: number
          type: string
        }
        Update: {
          app?: string
          description?: string
          label?: string
          options_fn?: string | null
          params_schema?: Json
          resolve_fn?: string
          sort?: number
          type?: string
        }
        Relationships: []
      }
      automation_runs: {
        Row: {
          branch: string | null
          ctx: Json
          dedupe_key: string
          error: string | null
          finished_at: string | null
          id: number
          log: Json
          org_id: string
          resume_at: string | null
          started_at: string
          state: Json
          status: string
          trace: Json
          trigger_type: string
          version: number
          wait_job: number | null
          workflow_id: string
        }
        Insert: {
          branch?: string | null
          ctx?: Json
          dedupe_key: string
          error?: string | null
          finished_at?: string | null
          id?: never
          log?: Json
          org_id: string
          resume_at?: string | null
          started_at?: string
          state?: Json
          status?: string
          trace?: Json
          trigger_type: string
          version?: number
          wait_job?: number | null
          workflow_id: string
        }
        Update: {
          branch?: string | null
          ctx?: Json
          dedupe_key?: string
          error?: string | null
          finished_at?: string | null
          id?: never
          log?: Json
          org_id?: string
          resume_at?: string | null
          started_at?: string
          state?: Json
          status?: string
          trace?: Json
          trigger_type?: string
          version?: number
          wait_job?: number | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "automation_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_tasks: {
        Row: {
          assignee_id: string
          created_at: string
          done_at: string | null
          done_by: string | null
          due_on: string | null
          id: string
          link: string | null
          note: string
          org_id: string
          run_id: number | null
          status: string
          title: string
        }
        Insert: {
          assignee_id: string
          created_at?: string
          done_at?: string | null
          done_by?: string | null
          due_on?: string | null
          id?: string
          link?: string | null
          note?: string
          org_id: string
          run_id?: number | null
          status?: string
          title: string
        }
        Update: {
          assignee_id?: string
          created_at?: string
          done_at?: string | null
          done_by?: string | null
          due_on?: string | null
          id?: string
          link?: string | null
          note?: string
          org_id?: string
          run_id?: number | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_tasks_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "automation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_trigger_types: {
        Row: {
          app: string
          description: string
          fields: Json
          fields_fn: string | null
          kind: string
          label: string
          params_schema: Json
          provides: string[]
          scan_fn: string | null
          sort: number
          type: string
        }
        Insert: {
          app: string
          description?: string
          fields?: Json
          fields_fn?: string | null
          kind: string
          label: string
          params_schema?: Json
          provides?: string[]
          scan_fn?: string | null
          sort?: number
          type: string
        }
        Update: {
          app?: string
          description?: string
          fields?: Json
          fields_fn?: string | null
          kind?: string
          label?: string
          params_schema?: Json
          provides?: string[]
          scan_fn?: string | null
          sort?: number
          type?: string
        }
        Relationships: []
      }
      automation_workflows: {
        Row: {
          adopted_from: string | null
          created_at: string
          created_by: string | null
          definition: Json | null
          description: string
          enabled: boolean
          id: string
          name: string
          org_id: string
          shared: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          adopted_from?: string | null
          created_at?: string
          created_by?: string | null
          definition?: Json | null
          description?: string
          enabled?: boolean
          id?: string
          name: string
          org_id: string
          shared?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          adopted_from?: string | null
          created_at?: string
          created_by?: string | null
          definition?: Json | null
          description?: string
          enabled?: boolean
          id?: string
          name?: string
          org_id?: string
          shared?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_workflows_adopted_from_fkey"
            columns: ["adopted_from"]
            isOneToOne: false
            referencedRelation: "automation_workflows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_workflows_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          enabled: boolean
          kind: string
          org_id: string
          params: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled: boolean
          kind: string
          org_id: string
          params?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          kind?: string
          org_id?: string
          params?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automations_kind_fkey"
            columns: ["kind"]
            isOneToOne: false
            referencedRelation: "automation_kinds"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "automations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_action_kinds: {
        Row: {
          app: string
          description: string
          kind: string
          label: string
          sort: number
        }
        Insert: {
          app: string
          description?: string
          kind: string
          label: string
          sort?: number
        }
        Update: {
          app?: string
          description?: string
          kind?: string
          label?: string
          sort?: number
        }
        Relationships: []
      }
      email_action_settings: {
        Row: {
          allowed: boolean
          kind: string
          org_id: string
          set_at: string
          set_by: string | null
        }
        Insert: {
          allowed?: boolean
          kind: string
          org_id: string
          set_at?: string
          set_by?: string | null
        }
        Update: {
          allowed?: boolean
          kind?: string
          org_id?: string
          set_at?: string
          set_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_action_settings_kind_fkey"
            columns: ["kind"]
            isOneToOne: false
            referencedRelation: "email_action_kinds"
            referencedColumns: ["kind"]
          },
          {
            foreignKeyName: "email_action_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_jobs: {
        Row: {
          every: unknown
          fn: string
          last_error: string | null
          last_run_at: string | null
          name: string
        }
        Insert: {
          every?: unknown
          fn: string
          last_error?: string | null
          last_run_at?: string | null
          name: string
        }
        Update: {
          every?: unknown
          fn?: string
          last_error?: string | null
          last_run_at?: string | null
          name?: string
        }
        Relationships: []
      }
      email_outbox: {
        Row: {
          app: string
          attempts: number
          category: string
          claimed_at: string | null
          created_at: string
          data: Json
          dedupe_key: string | null
          id: string
          last_error: string | null
          org_id: string | null
          provider_id: string | null
          send_after: string
          sent_at: string | null
          status: string
          template: string
          to_email: string | null
          to_user_id: string | null
        }
        Insert: {
          app: string
          attempts?: number
          category?: string
          claimed_at?: string | null
          created_at?: string
          data?: Json
          dedupe_key?: string | null
          id?: string
          last_error?: string | null
          org_id?: string | null
          provider_id?: string | null
          send_after?: string
          sent_at?: string | null
          status?: string
          template: string
          to_email?: string | null
          to_user_id?: string | null
        }
        Update: {
          app?: string
          attempts?: number
          category?: string
          claimed_at?: string | null
          created_at?: string
          data?: Json
          dedupe_key?: string | null
          id?: string
          last_error?: string | null
          org_id?: string | null
          provider_id?: string | null
          send_after?: string
          sent_at?: string | null
          status?: string
          template?: string
          to_email?: string | null
          to_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_outbox_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_preferences: {
        Row: {
          digest: string
          digest_day: number
          digest_hour: number
          digest_include: string[]
          digest_last_sent_at: string | null
          digest_org_ids: string[] | null
          digest_time_zone: string | null
          reminders: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          digest?: string
          digest_day?: number
          digest_hour?: number
          digest_include?: string[]
          digest_last_sent_at?: string | null
          digest_org_ids?: string[] | null
          digest_time_zone?: string | null
          reminders?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          digest?: string
          digest_day?: number
          digest_hour?: number
          digest_include?: string[]
          digest_last_sent_at?: string | null
          digest_org_ids?: string[] | null
          digest_time_zone?: string | null
          reminders?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      instance_email_settings: {
        Row: {
          from_address: string | null
          from_name: string | null
          id: boolean
          reply_to: string | null
          smtp_host: string | null
          smtp_password_enc: string | null
          smtp_port: number | null
          smtp_security: string
          smtp_username: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          from_address?: string | null
          from_name?: string | null
          id?: boolean
          reply_to?: string | null
          smtp_host?: string | null
          smtp_password_enc?: string | null
          smtp_port?: number | null
          smtp_security?: string
          smtp_username?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          from_address?: string | null
          from_name?: string | null
          id?: boolean
          reply_to?: string | null
          smtp_host?: string | null
          smtp_password_enc?: string | null
          smtp_port?: number | null
          smtp_security?: string
          smtp_username?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      instance_settings: {
        Row: {
          billing_enabled: boolean
          hub_url: string | null
          id: boolean
        }
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
          app_payload: Json
          app_roles: Json
          created_at: string
          email: string | null
          expires_at: string
          id: string
          invited_by: string | null
          named_role_id: string | null
          org_id: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["org_role"] | null
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          app?: string | null
          app_payload?: Json
          app_roles?: Json
          created_at?: string
          email?: string | null
          expires_at: string
          id?: string
          invited_by?: string | null
          named_role_id?: string | null
          org_id: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["org_role"] | null
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          app?: string | null
          app_payload?: Json
          app_roles?: Json
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          invited_by?: string | null
          named_role_id?: string | null
          org_id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["org_role"] | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_named_role_id_fkey"
            columns: ["named_role_id"]
            isOneToOne: false
            referencedRelation: "org_named_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_org_id_fkey"
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
          named_role_id: string | null
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          named_role_id?: string | null
          org_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          named_role_id?: string | null
          org_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_named_role_fk"
            columns: ["org_id", "named_role_id"]
            isOneToOne: false
            referencedRelation: "org_named_roles"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_kinds: {
        Row: {
          app: string
          audience: string
          default_email: boolean
          default_in_app: boolean
          default_roles: Database["public"]["Enums"]["org_role"][]
          description: string
          eligible_roles: Database["public"]["Enums"]["org_role"][]
          email_category: string
          kind: string
          label: string
          sort: number
        }
        Insert: {
          app: string
          audience?: string
          default_email?: boolean
          default_in_app?: boolean
          default_roles?: Database["public"]["Enums"]["org_role"][]
          description?: string
          eligible_roles?: Database["public"]["Enums"]["org_role"][]
          email_category?: string
          kind: string
          label: string
          sort?: number
        }
        Update: {
          app?: string
          audience?: string
          default_email?: boolean
          default_in_app?: boolean
          default_roles?: Database["public"]["Enums"]["org_role"][]
          description?: string
          eligible_roles?: Database["public"]["Enums"]["org_role"][]
          email_category?: string
          kind?: string
          label?: string
          sort?: number
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          email: boolean
          in_app: boolean
          kind: string
          updated_at: string
          user_id: string
        }
        Insert: {
          email: boolean
          in_app: boolean
          kind: string
          updated_at?: string
          user_id: string
        }
        Update: {
          email?: boolean
          in_app?: boolean
          kind?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_kind_fkey"
            columns: ["kind"]
            isOneToOne: false
            referencedRelation: "notification_kinds"
            referencedColumns: ["kind"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          dedupe_key: string | null
          id: number
          kind: string
          link: string | null
          link_app: string | null
          org_id: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          dedupe_key?: string | null
          id?: never
          kind: string
          link?: string | null
          link_app?: string | null
          org_id?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          dedupe_key?: string | null
          id?: never
          kind?: string
          link?: string | null
          link_app?: string | null
          org_id?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_kind_fkey"
            columns: ["kind"]
            isOneToOne: false
            referencedRelation: "notification_kinds"
            referencedColumns: ["kind"]
          },
          {
            foreignKeyName: "notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_named_roles: {
        Row: {
          app_roles: Json
          created_at: string
          description: string
          id: string
          name: string
          org_id: string
          permissions: Json
          updated_at: string
        }
        Insert: {
          app_roles?: Json
          created_at?: string
          description?: string
          id?: string
          name: string
          org_id: string
          permissions?: Json
          updated_at?: string
        }
        Update: {
          app_roles?: Json
          created_at?: string
          description?: string
          id?: string
          name?: string
          org_id?: string
          permissions?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_named_roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
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
          parent_org_id: string | null
          slug: string | null
          source_app: string | null
          source_ref: string | null
          time_zone: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          name: string
          parent_org_id?: string | null
          slug?: string | null
          source_app?: string | null
          source_ref?: string | null
          time_zone?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          name?: string
          parent_org_id?: string | null
          slug?: string | null
          source_app?: string | null
          source_ref?: string | null
          time_zone?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_parent_org_id_fkey"
            columns: ["parent_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          display_name: string | null
          id: string
          updated_at: string
        }
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
      _approval_output: { Args: { p_id: string }; Returns: Json }
      _automation_condition: {
        Args: { p_c: Json; p_ctx: Json }
        Returns: boolean
      }
      _automation_execute: {
        Args: {
          p_ctx: Json
          p_dedupe: string
          p_def: Json
          p_org: string
          p_wf: Database["public"]["Tables"]["automation_workflows"]["Row"]
        }
        Returns: number
      }
      _automation_extra_fields: {
        Args: { p_fn: string; p_org: string }
        Returns: Json
      }
      _automation_fill: {
        Args: { p_ctx: Json; p_text: string }
        Returns: string
      }
      _automation_recipients: {
        Args: { p_ctx: Json; p_org: string; p_to: Json }
        Returns: {
          email: string
          user_id: string
        }[]
      }
      _clean_app_permissions: { Args: { p_value: Json }; Returns: Json }
      _clean_app_roles: { Args: { p_value: Json }; Returns: Json }
      _clean_automation_params: {
        Args: { p_params: Json; p_schema: Json }
        Returns: Json
      }
      _clean_org_name: { Args: { p_name: string }; Returns: string }
      _create_child_organization: {
        Args: {
          p_admins?: string[]
          p_name: string
          p_owner: string
          p_parent: string
          p_source_app: string
          p_source_ref: string
        }
        Returns: string
      }
      _email_opted_out: {
        Args: { p_category: string; p_user: string }
        Returns: boolean
      }
      _is_active_user: { Args: { p_user: string }; Returns: boolean }
      _may_build_workflows: { Args: { p_org: string }; Returns: boolean }
      _member_confirm_text: { Args: { p_user: string }; Returns: string }
      _org_owner: { Args: { p_org: string }; Returns: string }
      _require_people_manager: { Args: { p_org: string }; Returns: undefined }
      _require_uid: { Args: never; Returns: string }
      _token_hash: { Args: { p_token: string }; Returns: string }
      _validate_actions: {
        Args: {
          p_actions: Json
          p_trig: Database["public"]["Tables"]["automation_trigger_types"]["Row"]
          p_where: string
        }
        Returns: Json
      }
      _validate_recipient: { Args: { p: Json; p_where: string }; Returns: Json }
      _validate_workflow: { Args: { p_def: Json }; Returns: Json }
      _validate_workflow_v2: { Args: { p_def: Json }; Returns: Json }
      _wf2_condition: { Args: { p_c: Json; p_ctx: Json }; Returns: boolean }
      _wf2_conditions: {
        Args: { p_conds: Json; p_ctx: Json; p_match: string }
        Returns: boolean
      }
      _wf2_continue: { Args: { p_run: number }; Returns: string }
      _wf2_core_steps: { Args: never; Returns: string[] }
      _wf2_empty_state: { Args: never; Returns: Json }
      _wf2_exec_list: {
        Args: {
          p_ctx: Json
          p_env: Json
          p_iter: string
          p_state: Json
          p_steps: Json
        }
        Returns: Record<string, unknown>
      }
      _wf2_exec_step: {
        Args: {
          p_ctx: Json
          p_env: Json
          p_iter: string
          p_key: string
          p_state: Json
          s: Json
        }
        Returns: Record<string, unknown>
      }
      _wf2_get: { Args: { p_ctx: Json; p_path: string }; Returns: Json }
      _wf2_people: {
        Args: { p_ctx: Json; p_org: string; p_to: Json }
        Returns: {
          email: string
          user_id: string
        }[]
      }
      _wf2_resolve: { Args: { p_ctx: Json; p_val: Json }; Returns: Json }
      _wf2_resume_due: { Args: never; Returns: number }
      _wf2_start: {
        Args: {
          p_ctx: Json
          p_dedupe: string
          p_def: Json
          p_org: string
          p_wf: Database["public"]["Tables"]["automation_workflows"]["Row"]
        }
        Returns: number
      }
      _wf2_text: { Args: { p_v: Json }; Returns: string }
      _wf2_trace: {
        Args: {
          p_detail: string
          p_key: string
          p_output: Json
          p_s: Json
          p_state: Json
          p_status: string
        }
        Returns: Json
      }
      _wf2_validate_list: {
        Args: {
          p_count: number
          p_depth: number
          p_loops: string[]
          p_seen: string[]
          p_steps: Json
          p_vars: string[]
        }
        Returns: Record<string, unknown>
      }
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
      action_link: { Args: { p_token: string }; Returns: Json }
      action_links_for: {
        Args: {
          p_actions: Json
          p_kind: string
          p_open_app?: string
          p_open_link?: string
          p_org: string
          p_user: string
          p_what: string
        }
        Returns: Json
      }
      adopt_workflow: {
        Args: { p_org: string; p_source: string }
        Returns: string
      }
      app_role: {
        Args: { p_app: string; p_org: string; p_user?: string }
        Returns: Database["public"]["Enums"]["org_role"]
      }
      app_role_source: {
        Args: { p_app: string; p_org: string; p_user?: string }
        Returns: string
      }
      approval: { Args: { p_id: string }; Returns: Json }
      automation_settings: {
        Args: { p_kind: string; p_org: string }
        Returns: {
          enabled: boolean
          params: Json
        }[]
      }
      can_edit_automations: { Args: { p_org: string }; Returns: boolean }
      can_write: { Args: { p_app: string; p_org: string }; Returns: boolean }
      claim_automation_jobs: {
        Args: { p_app: string; p_limit?: number }
        Returns: {
          app: string
          attempts: number
          created_at: string
          error: string | null
          id: number
          kind: string
          org_id: string
          payload: Json
          result: Json | null
          run_id: number | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "automation_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_emails: {
        Args: { p_apps?: string[]; p_limit?: number }
        Returns: {
          app: string
          attempts: number
          category: string
          data: Json
          id: string
          org_id: string
          org_name: string
          org_time_zone: string
          template: string
          to_email: string
          to_name: string
          to_user_id: string
        }[]
      }
      complete_automation_task: { Args: { p_id: string }; Returns: undefined }
      consume_action_link: { Args: { p_token: string }; Returns: boolean }
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
      decide_approval: {
        Args: { p_comment?: string; p_decision: string; p_id: string }
        Returns: string
      }
      delete_named_role: {
        Args: { p_id: string; p_org: string }
        Returns: undefined
      }
      delete_organization: {
        Args: { p_confirm_name: string; p_org: string }
        Returns: undefined
      }
      delete_workflow: { Args: { p_id: string }; Returns: undefined }
      digest_automation_tasks: {
        Args: { p_org: string; p_user: string }
        Returns: Json
      }
      digest_for: { Args: { p_period?: string; p_user: string }; Returns: Json }
      email_action_settings: {
        Args: { p_org: string }
        Returns: {
          allowed: boolean
          app: string
          can_change: boolean
          description: string
          kind: string
          label: string
        }[]
      }
      email_actions_allowed: {
        Args: { p_kind: string; p_org: string }
        Returns: boolean
      }
      email_unsubscribe: {
        Args: { p_category: string; p_user: string }
        Returns: undefined
      }
      emit_automation_event: {
        Args: { p_ctx: Json; p_org: string; p_type: string }
        Returns: undefined
      }
      enqueue_email: {
        Args: {
          p_app: string
          p_category?: string
          p_data?: Json
          p_dedupe_key?: string
          p_org?: string
          p_send_after?: string
          p_template: string
          p_to_email?: string
          p_to_user?: string
        }
        Returns: string
      }
      finish_automation_job: {
        Args: { p_error: string; p_id: number; p_ok: boolean; p_result: Json }
        Returns: undefined
      }
      finish_email: {
        Args: {
          p_error?: string
          p_id: string
          p_outcome: string
          p_provider_id?: string
        }
        Returns: undefined
      }
      get_digest_preferences: {
        Args: never
        Returns: {
          digest: string
          digest_day: number
          digest_hour: number
          digest_include: string[]
          digest_org_ids: string[]
          digest_time_zone: string
        }[]
      }
      get_email_preferences: {
        Args: never
        Returns: {
          digest: string
          reminders: boolean
        }[]
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
      grant_automation_editor: {
        Args: { p_grant: boolean; p_org: string; p_user: string }
        Returns: undefined
      }
      has_app_access: {
        Args: { p_app: string; p_org: string }
        Returns: boolean
      }
      has_app_permission: {
        Args: { p_app: string; p_key: string; p_org: string; p_user?: string }
        Returns: boolean
      }
      has_app_role: {
        Args: {
          p_app: string
          p_org: string
          p_roles: Database["public"]["Enums"]["org_role"][]
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          p_org: string
          p_roles: Database["public"]["Enums"]["org_role"][]
        }
        Returns: boolean
      }
      is_instance_owner: { Args: never; Returns: boolean }
      is_member: { Args: { p_org: string }; Returns: boolean }
      is_member_of_child: { Args: { p_org: string }; Returns: boolean }
      is_org_editor: {
        Args: { p_org: string; p_user: string }
        Returns: boolean
      }
      list_automations: {
        Args: { p_org: string }
        Returns: {
          app: string
          category: string
          default_enabled: boolean
          default_params: Json
          description: string
          enabled: boolean
          is_default: boolean
          kind: string
          last_run_at: string
          last_summary: string
          name: string
          params: Json
          params_schema: Json
          updated_at: string
        }[]
      }
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
      log_automation: {
        Args: {
          p_count: number
          p_kind: string
          p_org: string
          p_summary: string
        }
        Returns: undefined
      }
      mark_notifications_read: { Args: { p_ids?: number[] }; Returns: number }
      my_app_memberships: {
        Args: { p_app: string }
        Returns: {
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
        }[]
      }
      my_approvals: {
        Args: { p_org?: string }
        Returns: {
          created_at: string
          details: string
          due_at: string
          id: string
          mode: string
          org_id: string
          org_name: string
          what: string
          workflow: string
        }[]
      }
      my_notifications: {
        Args: { p_limit?: number; p_org?: string }
        Returns: {
          body: string
          created_at: string
          id: number
          kind: string
          kind_label: string
          link: string
          link_app: string
          org_id: string
          org_name: string
          read_at: string
          title: string
        }[]
      }
      notification_settings: {
        Args: never
        Returns: {
          app: string
          audience: string
          by_default: boolean
          customized: boolean
          default_email: boolean
          default_in_app: boolean
          description: string
          email: boolean
          email_category: string
          in_app: boolean
          kind: string
          label: string
          may_turn_on: boolean
        }[]
      }
      notify: {
        Args: {
          p_action_kind?: string
          p_actions?: Json
          p_actor?: string
          p_body: string
          p_dedupe?: string
          p_emails?: string[]
          p_kind: string
          p_link: string
          p_link_app: string
          p_org: string
          p_title: string
          p_users: string[]
        }
        Returns: number
      }
      org_app_roles: {
        Args: { p_org: string }
        Returns: {
          app: string
          named_role: string
          named_role_id: string
          role: Database["public"]["Enums"]["org_role"]
          source: string
          user_id: string
        }[]
      }
      org_editor_count: { Args: { p_org: string }; Returns: number }
      org_email_log: {
        Args: { p_limit?: number; p_org: string }
        Returns: {
          app: string
          attempts: number
          category: string
          created_at: string
          id: string
          last_error: string
          sent_at: string
          status: string
          template: string
          to_email: string
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
      prune_automation_log: { Args: never; Returns: number }
      prune_notifications: { Args: never; Returns: number }
      prune_workflow_history: { Args: never; Returns: number }
      queue_digests: { Args: never; Returns: number }
      register_app_permission: {
        Args: {
          p_app: string
          p_description?: string
          p_key: string
          p_label: string
          p_sort?: number
        }
        Returns: undefined
      }
      register_automation_action: {
        Args: {
          p_app: string
          p_description: string
          p_label: string
          p_params_schema: Json
          p_requires: string[]
          p_sort?: number
          p_type: string
        }
        Returns: undefined
      }
      register_automation_kind: {
        Args: {
          p_app: string
          p_category: string
          p_default_enabled: boolean
          p_default_params: Json
          p_description: string
          p_key: string
          p_name: string
          p_params_schema: Json
          p_sort?: number
        }
        Returns: undefined
      }
      register_automation_recipient: {
        Args: {
          p_app: string
          p_description: string
          p_label: string
          p_options_fn?: string
          p_params_schema: Json
          p_resolve_fn: string
          p_sort?: number
          p_type: string
        }
        Returns: undefined
      }
      register_automation_step: {
        Args: {
          p_app: string
          p_description: string
          p_kind: string
          p_label: string
          p_output_schema: Json
          p_params_schema: Json
          p_requires?: string[]
          p_run_fn: string
          p_sort?: number
          p_type: string
        }
        Returns: undefined
      }
      register_automation_trigger: {
        Args: {
          p_app: string
          p_description: string
          p_fields: Json
          p_fields_fn: string
          p_kind: string
          p_label: string
          p_params_schema: Json
          p_provides: string[]
          p_scan_fn: string
          p_sort?: number
          p_type: string
        }
        Returns: undefined
      }
      register_email_action_kind: {
        Args: {
          p_app: string
          p_description: string
          p_kind: string
          p_label: string
          p_sort?: number
        }
        Returns: undefined
      }
      register_notification_kind: {
        Args: {
          p_app: string
          p_audience: string
          p_default_email: boolean
          p_default_in_app: boolean
          p_default_roles?: Database["public"]["Enums"]["org_role"][]
          p_description: string
          p_eligible: Database["public"]["Enums"]["org_role"][]
          p_email_category: string
          p_kind: string
          p_label: string
          p_sort?: number
        }
        Returns: undefined
      }
      rename_organization: {
        Args: { p_name: string; p_org: string }
        Returns: undefined
      }
      reset_automation: {
        Args: { p_kind: string; p_org: string }
        Returns: undefined
      }
      reset_notification_preference: {
        Args: { p_kind: string }
        Returns: undefined
      }
      revoke_invitation: { Args: { p_id: string }; Returns: undefined }
      run_email_jobs: { Args: never; Returns: number }
      run_workflows: { Args: never; Returns: number }
      sample_trigger_data: {
        Args: { p_org: string; p_type: string }
        Returns: Json
      }
      save_named_role: {
        Args: {
          p_app_roles: Json
          p_description: string
          p_id: string
          p_name: string
          p_org: string
          p_permissions: Json
        }
        Returns: string
      }
      save_workflow: {
        Args: {
          p_definition: Json
          p_description: string
          p_enabled: boolean
          p_id: string
          p_name: string
          p_org: string
          p_shared?: boolean
        }
        Returns: string
      }
      set_app_role: {
        Args: {
          p_app: string
          p_org: string
          p_role: Database["public"]["Enums"]["org_role"]
          p_user: string
        }
        Returns: undefined
      }
      set_automation: {
        Args: {
          p_enabled: boolean
          p_kind: string
          p_org: string
          p_params: Json
        }
        Returns: undefined
      }
      set_chapters_may_build: {
        Args: { p_allowed: boolean; p_org: string }
        Returns: undefined
      }
      set_digest_preferences: {
        Args: {
          p_day: number
          p_digest: string
          p_hour: number
          p_include: string[]
          p_org_ids: string[]
          p_time_zone: string
        }
        Returns: undefined
      }
      set_email_action_allowed: {
        Args: { p_allowed: boolean; p_kind: string; p_org: string }
        Returns: undefined
      }
      set_email_preferences: {
        Args: { p_digest: string; p_reminders: boolean }
        Returns: undefined
      }
      set_invitation_roles: {
        Args: { p_app_roles: Json; p_invitation: string; p_named_role: string }
        Returns: undefined
      }
      set_named_role: {
        Args: { p_org: string; p_role: string; p_user: string }
        Returns: undefined
      }
      set_notification_preference: {
        Args: { p_email: boolean; p_in_app: boolean; p_kind: string }
        Returns: undefined
      }
      set_organization_preferences: {
        Args: { p_currency: string; p_org: string; p_time_zone: string }
        Returns: undefined
      }
      set_workflow_enabled: {
        Args: { p_enabled: boolean; p_id: string }
        Returns: undefined
      }
      shares_org: { Args: { p_user: string }; Returns: boolean }
      test_workflow: {
        Args: { p_definition: Json; p_org: string; p_trigger?: Json }
        Returns: Json
      }
      transfer_ownership:
        | { Args: { p_new_owner: string; p_org: string }; Returns: undefined }
        | {
            Args: { p_confirm: string; p_new_owner: string; p_org: string }
            Returns: undefined
          }
      unread_notification_count: { Args: never; Returns: number }
      workflow_overview: { Args: { p_org: string }; Returns: Json }
      workflow_runs: {
        Args: { p_limit?: number; p_org: string; p_workflow?: string }
        Returns: {
          branch: string
          error: string
          id: number
          log: Json
          started_at: string
          status: string
          summary: string
          trigger_type: string
          workflow_id: string
          workflow_name: string
        }[]
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

