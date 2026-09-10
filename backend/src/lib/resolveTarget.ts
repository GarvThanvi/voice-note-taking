import { prisma } from "./prisma.js";

export interface ResolvedTarget {
  noteId: number;
  title: string | null;
  todoId: number | null;
  todoText: string | null;
  noteScore: number;
  todoScore: number;
  combinedScore: number;
}

export type ResolutionResult =
  | { status: "found"; target: ResolvedTarget }
  | { status: "ambiguous"; candidates: ResolvedTarget[] }
  | { status: "not_found" };

const MIN_THRESHOLD = 0.2;
const CLEAR_WINNER_SCORE = 0.35;
const AMBIGUOUS_GAP = 0.15;

export const resolveTarget = async (
  userId: number,
  noteHint: string | null,
  todoHint: string | null
): Promise<ResolutionResult> => {
  if (!noteHint && !todoHint) {
    return { status: "not_found" };
  }

  const candidates = await prisma.$queryRaw<ResolvedTarget[]>`
    SELECT
      n.id        AS "noteId",
      n.title     AS "title",
      t.id        AS "todoId",
      t.text      AS "todoText",
      CASE
        WHEN ${noteHint}::text IS NOT NULL AND n.title IS NOT NULL
          THEN similarity(n.title, ${noteHint}::text)
        ELSE 0
      END AS "noteScore",
      CASE
        WHEN ${todoHint}::text IS NOT NULL AND t.text IS NOT NULL
          THEN similarity(t.text, ${todoHint}::text)
        ELSE 0
      END AS "todoScore",
      (
        CASE
          WHEN ${noteHint}::text IS NOT NULL AND n.title IS NOT NULL
            THEN similarity(n.title, ${noteHint}::text)
          ELSE 0
        END
        +
        CASE
          WHEN ${todoHint}::text IS NOT NULL AND t.text IS NOT NULL
            THEN similarity(t.text, ${todoHint}::text)
          ELSE 0
        END
      ) AS "combinedScore"
    FROM "Note" n
    LEFT JOIN "Todo" t ON t."noteId" = n.id
    WHERE n."userId" = ${userId}
      AND n.archived = false
      AND (
        (${noteHint}::text IS NOT NULL AND n.title IS NOT NULL AND similarity(n.title, ${noteHint}::text) > 0)
        OR
        (${todoHint}::text IS NOT NULL AND t.text IS NOT NULL AND similarity(t.text, ${todoHint}::text) > 0)
      )
    ORDER BY "combinedScore" DESC
    LIMIT 5
  `;

  if (!candidates || candidates.length === 0) {
    return { status: "not_found" };
  }

  const bestRaw = candidates[0]!;
  if (bestRaw.combinedScore < MIN_THRESHOLD) {
    return { status: "not_found" };
  }

  const grouped = new Map<number, ResolvedTarget>();
  for (const c of candidates) {
    const existing = grouped.get(c.noteId);
    if (!existing || c.combinedScore > existing.combinedScore) {
      grouped.set(c.noteId, c);
    }
  }
  const unique = Array.from(grouped.values());

  if (unique.length === 0) {
    return { status: "not_found" };
  }

  const best = unique[0]!;
  const runnerUp = unique[1];

  if (runnerUp && best.combinedScore - runnerUp.combinedScore < AMBIGUOUS_GAP) {
    return { status: "ambiguous", candidates: unique.slice(0, 5) };
  }

  return { status: "found", target: best };
};
