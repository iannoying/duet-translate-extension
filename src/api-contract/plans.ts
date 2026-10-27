import { z } from "zod"

// The subscription plans, cheapest first.
export const PlanSchema = z.enum(["free", "pro", "ultra"])
export type Plan = z.infer<typeof PlanSchema>
