import { computeStats, type Trade } from "./trades";

export type Flag = { title: string; explanation: string };

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

/**
 * Deterministic mistake detection. Every flag is derived from journal fields only —
 * nothing here is inferred by a model, so the AI can cite these as facts.
 */
export function detectMistakes(trade: Trade, history: Trade[]): Flag[] {
  const flags: Flag[] = [];
  const rr = n(trade.rr_ratio);
  const risk = n(trade.risk_percent);
  const pnl = n(trade.profit_loss) ?? 0;
  const stats = computeStats(history);
  const avgRisk = (() => {
    const v = history.map((t) => n(t.risk_percent)).filter((x): x is number => x !== null);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  })();

  if (!trade.stop_loss)
    flags.push({
      title: "No stop loss",
      explanation: "No stop loss was recorded, so the downside on this trade was undefined.",
    });

  if (risk !== null && risk > 2)
    flags.push({
      title: "Oversized position",
      explanation: `Risked ${risk}% on this trade versus a ${avgRisk ? avgRisk.toFixed(2) : "?"}% journal average — above the 2% capital-preservation threshold.`,
    });

  if (rr !== null && rr > 0 && rr < 1)
    flags.push({
      title: "Poor risk/reward",
      explanation: `Planned RR was ${rr}R. Below 1R you need a win rate above 50% just to break even; yours is ${stats.winRate.toFixed(1)}%.`,
    });

  if (trade.take_profit && trade.exit_price && trade.stop_loss) {
    const tp = n(trade.take_profit)!;
    const exit = n(trade.exit_price)!;
    const entry = n(trade.entry_price);
    if (entry !== null && pnl > 0) {
      const target = Math.abs(tp - entry);
      const captured = Math.abs(exit - entry);
      if (target > 0 && captured < target * 0.6)
        flags.push({
          title: "Early exit",
          explanation: `Closed after capturing ${((captured / target) * 100).toFixed(0)}% of the planned target, leaving the rest of the move on the table.`,
        });
    }
  }

  const fear = n(trade.fear_level);
  const greed = n(trade.greed_level);
  const discipline = n(trade.discipline_level);
  const patience = n(trade.patience_level);
  const confidence = n(trade.confidence_level);
  const emotion = (trade.emotional_state ?? "").toLowerCase();

  if (fear !== null && fear >= 7)
    flags.push({
      title: "Emotional trading (fear)",
      explanation: `Fear was logged at ${fear}/10 on entry, which usually shows up as early exits and skipped confirmations.`,
    });
  if (greed !== null && greed >= 7)
    flags.push({
      title: "Emotional trading (greed)",
      explanation: `Greed was logged at ${greed}/10 — the common consequence is holding past the plan or oversizing.`,
    });
  if (emotion === "revenge")
    flags.push({
      title: "Revenge trading",
      explanation:
        "You tagged this trade as revenge, meaning it followed a loss rather than a setup.",
    });
  if (emotion === "fomo")
    flags.push({
      title: "FOMO / late entry",
      explanation:
        "Tagged as FOMO — entries chased after the move has started give worse RR by construction.",
    });
  if (emotion === "impatient")
    flags.push({
      title: "Forced trade",
      explanation:
        "Tagged as impatient, which usually means the setup was taken before it completed.",
    });
  if (discipline !== null && discipline <= 4)
    flags.push({
      title: "Poor discipline",
      explanation: `Discipline scored ${discipline}/10 on this trade versus your journal average.`,
    });
  if (patience !== null && patience <= 4)
    flags.push({
      title: "Impatient execution",
      explanation: `Patience scored ${patience}/10, a level associated with entering before confirmation.`,
    });
  if (confidence !== null && confidence <= 4)
    flags.push({
      title: "Low-confidence trade",
      explanation: `Confidence was ${confidence}/10 — low-conviction trades dilute the edge of your A+ setups.`,
    });
  if (!trade.strategy)
    flags.push({
      title: "Ignored strategy",
      explanation: "No strategy was recorded, so this trade cannot be attributed to a tested edge.",
    });
  if (!trade.setup_type)
    flags.push({
      title: "No confirmation logged",
      explanation: "No setup type was recorded, so entry criteria cannot be reviewed later.",
    });
  if (!trade.notes || trade.notes.trim().length < 20)
    flags.push({
      title: "Incomplete notes",
      explanation: "Notes are missing or too short for this trade to teach you anything on review.",
    });
  if (
    fear === null ||
    greed === null ||
    discipline === null ||
    patience === null ||
    !trade.emotional_state
  )
    flags.push({
      title: "Missing journal data",
      explanation:
        "Psychology fields are incomplete, which weakens every behavioural insight below.",
    });

  const sameDay = history.filter((t) => t.opened_at.slice(0, 10) === trade.opened_at.slice(0, 10));
  if (sameDay.length >= 5)
    flags.push({
      title: "Overtrading",
      explanation: `${sameDay.length} trades were logged on ${trade.opened_at.slice(0, 10)}; high-frequency days reduce selectivity.`,
    });

  return flags;
}

export function detectStrengths(trade: Trade, history: Trade[]): Flag[] {
  const flags: Flag[] = [];
  const rr = n(trade.rr_ratio);
  const risk = n(trade.risk_percent);
  const discipline = n(trade.discipline_level);
  const patience = n(trade.patience_level);
  const fear = n(trade.fear_level);
  const greed = n(trade.greed_level);

  if (trade.stop_loss)
    flags.push({
      title: "Capital protection",
      explanation: "A stop loss was defined before entry, capping the worst case.",
    });
  if (risk !== null && risk <= 1)
    flags.push({
      title: "Consistent risk",
      explanation: `Risk was ${risk}% — inside the 1% band that keeps drawdowns survivable.`,
    });
  if (rr !== null && rr >= 2)
    flags.push({
      title: "Excellent risk/reward",
      explanation: `${rr}R planned. At this RR a ${(100 / (1 + rr)).toFixed(0)}% win rate breaks even.`,
    });
  if (discipline !== null && discipline >= 8)
    flags.push({
      title: "Excellent discipline",
      explanation: `Discipline scored ${discipline}/10 on this trade.`,
    });
  if (patience !== null && patience >= 8)
    flags.push({
      title: "Good patience",
      explanation: `Patience scored ${patience}/10 — you waited for the setup.`,
    });
  if (fear !== null && greed !== null && fear <= 4 && greed <= 4)
    flags.push({
      title: "Strong psychology",
      explanation: `Fear ${fear}/10 and greed ${greed}/10 kept execution neutral.`,
    });
  if (trade.strategy && trade.setup_type)
    flags.push({
      title: "Strategy followed",
      explanation: `Traded ${trade.strategy} with a recorded ${trade.setup_type} setup.`,
    });
  if (trade.screenshot_url)
    flags.push({
      title: "Reviewable record",
      explanation: "A chart screenshot was attached, making post-trade review possible.",
    });
  if (history.length >= 20 && (n(trade.profit_loss) ?? 0) > computeStats(history).avgWin)
    flags.push({
      title: "Above-average result",
      explanation: "This trade returned more than your average winner across the journal.",
    });

  return flags;
}

/** Confidence is a function of sample size and how complete the journal fields are. */
export function dataSufficiency(trade: Trade | null, history: Trade[]) {
  const sampleSize = history.length;
  const fields = trade
    ? [
        trade.entry_price,
        trade.exit_price,
        trade.stop_loss,
        trade.risk_percent,
        trade.rr_ratio,
        trade.strategy,
        trade.session,
        trade.emotional_state,
        trade.fear_level,
        trade.greed_level,
        trade.discipline_level,
        trade.patience_level,
        trade.notes,
      ]
    : [];
  const filled = fields.filter((f) => f !== null && f !== undefined && f !== "").length;
  const completeness = fields.length ? Math.round((filled / fields.length) * 100) : 0;
  const sampleScore = Math.min(100, Math.round((sampleSize / 50) * 100));
  const percent = trade ? Math.round(sampleScore * 0.6 + completeness * 0.4) : sampleScore;
  return {
    sampleSize,
    completeness,
    percent,
    sufficient: sampleSize >= 10,
    reason: `${sampleSize} journal trades analysed${trade ? `, ${completeness}% of this trade's fields completed` : ""}.`,
  };
}
