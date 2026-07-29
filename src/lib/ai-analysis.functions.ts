import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { SYSTEM_PROMPTS, callGateway } from "./ai-engine.server";
import type { PeriodReport, TradeAnalysis, TraderProfile } from "./analysis-types";

const ContextSchema = z.object({
  context: z.string().min(2).max(60000),
});

const PeriodSchema = ContextSchema.extend({
  period: z.enum(["weekly", "monthly"]),
});

export const analyzeTrade = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ContextSchema.parse(input))
  .handler(async ({ data }) => {
    const result = await callGateway(
      SYSTEM_PROMPTS.trade,
      `Analyze the trade in "trade" using the aggregated stats in "history" and the recent trades in "recent".\n\n${data.context}`,
    );
    return result as TradeAnalysis;
  });

export const generatePeriodReport = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => PeriodSchema.parse(input))
  .handler(async ({ data }) => {
    const result = await callGateway(
      SYSTEM_PROMPTS.period,
      `Write the ${data.period} report from this data.\n\n${data.context}`,
    );
    return result as PeriodReport;
  });

export const buildTraderProfile = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ContextSchema.parse(input))
  .handler(async ({ data }) => {
    const result = await callGateway(
      SYSTEM_PROMPTS.profile,
      `Build the trader profile and long-term growth read from this data.\n\n${data.context}`,
    );
    return result as TraderProfile;
  });
