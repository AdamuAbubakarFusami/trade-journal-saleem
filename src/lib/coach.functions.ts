import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const StatsSchema = z.object({
  question: z.string().min(1).max(500),
  summary: z.object({
    total: z.number(),
    winRate: z.number(),
    netPnl: z.number(),
    avgRr: z.number(),
    profitFactor: z.number(),
    avgWin: z.number(),
    avgLoss: z.number(),
    streak: z.number(),
    topStrategies: z
      .array(z.object({ name: z.string(), pnl: z.number(), winRate: z.number() }))
      .max(8),
    emotions: z.array(z.object({ name: z.string(), pnl: z.number(), winRate: z.number() })).max(8),
    avgDiscipline: z.number(),
    avgFear: z.number(),
    avgGreed: z.number(),
  }),
});

export const askCoach = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => StatsSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI is not configured");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are SaleemJournal's AI trading coach. You review a trader's aggregated journal statistics and give sharp, specific, actionable coaching. Be direct and concise: 3-5 short sections with bold headers, concrete numbers from the data, and one clear next action. Never give financial advice or predict markets — focus on process, risk management, and psychology.",
          },
          {
            role: "user",
            content: `Trader statistics (JSON):\n${JSON.stringify(data.summary)}\n\nQuestion: ${data.question}`,
          },
        ],
      }),
    });

    if (res.status === 429) throw new Error("Rate limit reached. Please try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits to continue.");
    if (!res.ok) throw new Error("The coach could not respond right now.");

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return { answer: json.choices?.[0]?.message?.content ?? "No response." };
  });
