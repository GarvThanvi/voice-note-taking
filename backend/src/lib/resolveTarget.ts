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
  todoHint: string | null,
  action?: string
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
    LIMIT 10
  `;

  if (!candidates || candidates.length === 0) {
    return { status: "not_found" };
  }

  const bestRaw = candidates[0]!;
  if (bestRaw.combinedScore < MIN_THRESHOLD) {
    return { status: "not_found" };
  }

  // For mark_done/update_todo: find the best TODO match, not the best note.
  // Don't group by noteId — keep individual todo candidates.
  if (action === "mark_done" || action === "update_todo") {
    const todoCandidates = candidates.filter((c) => c.todoId !== null);

    if (todoCandidates.length === 0) {
      return { status: "not_found" };
    }

    // If noteHint is provided, prefer todos from matching notes.
    const noteFiltered = todoCandidates.filter((c) => c.noteScore > 0);
    const pool = noteFiltered.length > 0 ? noteFiltered : todoCandidates;

    pool.sort((a, b) => b.todoScore - a.todoScore);
    const best = pool[0]!;
    const runnerUp = pool[1];

    if (best.todoScore < MIN_THRESHOLD) {
      return { status: "not_found" };
    }

    if (runnerUp && best.todoScore - runnerUp.todoScore < AMBIGUOUS_GAP) {
      return { status: "ambiguous", candidates: pool.slice(0, 5) };
    }

    return { status: "found", target: best };
  }

  // For add_todo/archive/etc: find the best NOTE match (group by noteId).
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
