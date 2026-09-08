import { prisma } from "./prisma.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Thresholds — tune with real usage
// ---------------------------------------------------------------------------

const MIN_THRESHOLD = 0.2;
const CLEAR_WINNER_SCORE = 0.35;
const CLEAR_WINNER_GAP = 0.15;
const AMBIGUOUS_GAP = 0.15;

// ---------------------------------------------------------------------------
// resolveTarget — given userId + hints from the intent extractor, query
// Note/Todo rows scoped to that user using pg_trgm similarity scoring.
// ---------------------------------------------------------------------------

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

  const best = candidates[0]!;
  const runnerUp = candidates[1];

  if (best.combinedScore < MIN_THRESHOLD) {
    return { status: "not_found" };
  }

  const gap = runnerUp ? best.combinedScore - runnerUp.combinedScore : Infinity;

  if (runnerUp && gap < AMBIGUOUS_GAP) {
    return { status: "ambiguous", candidates: candidates.slice(0, 5) };
  }

  return { status: "found", target: best };
};
