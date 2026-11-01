import { queryOptions } from "@tanstack/react-query";
import { db } from "@/lib/db/pending-schema";

/** Payments (E-12). Reads go through RLS; connecting goes through RPCs and connectStripe. */
export type GatewayConnection = {
  gateway: "manual" | "stripe" | "test";
  status: "verified" | "disabled";
  account_label: string;
  livemode: boolean;
  connected_at: string;
};

export const connectionQuery = (orgId: string) =>
  queryOptions({
    queryKey: ["gateway-connection", orgId],
    queryFn: async (): Promise<GatewayConnection | null> => {
      const { data, error } = await db
        .from("gateway_connections")
        .select("gateway,status,account_label,livemode,connected_at")
        .eq("org_id", orgId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

export type PaymentRow = {
  id: string;
  created_at: string;
  received_on: string | null;
  purpose: "join" | "renew";
  amount_minor: number;
  refunded_amount_minor: number;
  currency: string;
  status: "pending" | "paid" | "refunded" | "failed";
  gateway: "manual" | "stripe" | "test";
  method: string | null;
  livemode: boolean;
  note: string;
  member_name: string;
};

export const paymentsQuery = (orgId: string) =>
  queryOptions({
    queryKey: ["payments", orgId],
    queryFn: async (): Promise<PaymentRow[]> => {
      const { data, error } = await db
        .from("payments")
        .select(
          "id,created_at,received_on,purpose,amount_minor,refunded_amount_minor,currency,status,gateway,method,livemode,note,org_member_profiles(display_name,email)",
        )
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []).map(({ org_member_profiles, ...p }) => {
        const m = org_member_profiles as unknown as { display_name: string; email: string } | null;
        return { ...p, member_name: m?.display_name || m?.email || "—" };
      });
    },
  });

export async function connectTestGateway(orgId: string) {
  const { error } = await db.rpc("connect_test_gateway", { _org: orgId });
  if (error) throw error;
}

export async function disconnectGateway(orgId: string) {
  const { error } = await db.rpc("disconnect_gateway", { _org: orgId });
  if (error) throw error;
}
