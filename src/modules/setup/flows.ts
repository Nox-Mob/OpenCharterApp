import type { Flow } from "@/engines/setup";
import type { Feature } from "@/lib/db/readiness";
import { membershipFlow } from "@/modules/membership/setup-flow";
import { boardFlow } from "@/modules/governance/setup-flow";

/**
 * The guided setup flows an org can run (setup-engine.md §6), in the order the overview shows
 * them. Each flow lives in its module's setup-flow.ts and applies through apply_setup.
 */
export const SETUP_FLOW_IDS = ["membership", "board"] as const;
export type SetupFlowId = (typeof SETUP_FLOW_IDS)[number];

export type SetupFlowEntry = {
  id: SetupFlowId;
  flow: Flow<unknown>;
  /** The readiness feature the flow needs (D-135), if any. */
  feature?: Feature;
};

export const SETUP_FLOWS: readonly SetupFlowEntry[] = [
  { id: "membership", flow: membershipFlow as Flow<unknown> },
  { id: "board", flow: boardFlow as Flow<unknown>, feature: "board_setup" },
];

export const isSetupFlowId = (v: unknown): v is SetupFlowId =>
  typeof v === "string" && (SETUP_FLOW_IDS as readonly string[]).includes(v);
