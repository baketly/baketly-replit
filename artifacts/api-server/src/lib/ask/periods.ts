// "Last month", in dates.
//
// A baker asks about this month, last week, the last thirty days. The model
// must never decide what those mean — it has no calendar and no idea what day
// the server thinks it is. Every period is resolved here into two dates, and
// every tool result carries back the period it actually used, so an answer
// can say "August 1 to 31" rather than "recently".

export type PeriodName =
  | "today"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "last_30_days"
  | "last_90_days"
  | "this_year"
  | "all_time";

export interface Period {
  name: PeriodName | "custom";
  from: string;
  to: string;
  /** how a person would say it: "August 2026", "the last 30 days" */
  label: string;
}

const day = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayOfMonth}`;
};

const monthLabel = (date: Date): string =>
  date.toLocaleDateString("en-US", { month: "long", year: "numeric" });

/** Monday, because a baker's week ends at the weekend market. */
function startOfWeek(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - weekday);
  return start;
}

export function resolvePeriod(name: string | undefined, now = new Date()): Period {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const wanted = (name || "all_time").toLowerCase().replace(/[\s-]+/g, "_") as PeriodName;

  switch (wanted) {
    case "today":
      return { name: "today", from: day(today), to: day(today), label: "today" };

    case "this_week": {
      const start = startOfWeek(today);
      return { name: "this_week", from: day(start), to: day(today), label: "this week" };
    }

    case "last_week": {
      const start = startOfWeek(today);
      const end = new Date(start);
      end.setDate(end.getDate() - 1);
      start.setDate(start.getDate() - 7);
      return { name: "last_week", from: day(start), to: day(end), label: "last week" };
    }

    case "this_month": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return {
        name: "this_month",
        from: day(start),
        to: day(today),
        label: monthLabel(start) + " so far",
      };
    }

    case "last_month": {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { name: "last_month", from: day(start), to: day(end), label: monthLabel(start) };
    }

    case "last_30_days":
    case "last_90_days": {
      const days = wanted === "last_30_days" ? 30 : 90;
      const start = new Date(today);
      start.setDate(start.getDate() - (days - 1));
      return {
        name: wanted,
        from: day(start),
        to: day(today),
        label: "the last " + days + " days",
      };
    }

    case "this_year": {
      const start = new Date(today.getFullYear(), 0, 1);
      return {
        name: "this_year",
        from: day(start),
        to: day(today),
        label: String(today.getFullYear()) + " so far",
      };
    }

    default:
      return { name: "all_time", from: "0000-01-01", to: day(today), label: "all time" };
  }
}

/** The period immediately before this one, for "compared with last month". */
export function previousPeriod(period: Period, now = new Date()): Period {
  if (period.name === "this_month") return resolvePeriod("last_month", now);
  if (period.name === "this_week") return resolvePeriod("last_week", now);
  if (period.name === "all_time") return period;

  const from = new Date(period.from + "T00:00:00");
  const to = new Date(period.to + "T00:00:00");
  const span = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);
  const previousTo = new Date(from);
  previousTo.setDate(previousTo.getDate() - 1);
  const previousFrom = new Date(previousTo);
  previousFrom.setDate(previousFrom.getDate() - (span - 1));
  return {
    name: "custom",
    from: day(previousFrom),
    to: day(previousTo),
    label: "the " + span + " days before that",
  };
}

/** An explicit month, when the baker names one: "2026-08". */
export function monthPeriod(month: string): Period | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(year, monthNumber - 1, 1);
  const end = new Date(year, monthNumber, 0);
  return { name: "custom", from: day(start), to: day(end), label: monthLabel(start) };
}
