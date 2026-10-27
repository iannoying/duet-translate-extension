import { z } from "zod"
import { PlanSchema } from "./plans"

export const BillingStatusOutputSchema = z.object({
  plan: PlanSchema,
})
export type BillingStatusOutput = z.infer<typeof BillingStatusOutputSchema>
