import type { Activity } from "./types";
import { serializeActivityRequest } from "./rawPayload.ts";

// Export the create contract, not response IDs or derived summary fields.
export function exportActivityJson(activity: Activity): string {
  const {
    date,
    type,
    durationSeconds,
    notes,
    mood,
    energy,
    rpe,
    subjectiveNotes,
    activitySubtype,
  } = activity;
  const running = activity.running
    ? Object.fromEntries(
        Object.entries(activity.running).filter(
          ([key]) => key !== "activityId",
        ),
      )
    : null;
  const walking = activity.walking
    ? Object.fromEntries(
        Object.entries(activity.walking).filter(
          ([key]) => key !== "activityId",
        ),
      )
    : type === "Walking"
      ? {}
      : null; // Legacy walking records have no normalized details.
  return serializeActivityRequest(
    {
      date,
      type,
      durationSeconds,
      notes,
      mood,
      energy,
      rpe,
      subjectiveNotes,
      activitySubtype,
      running,
      walking,
      exercises: activity.exercises?.map(({ exerciseName, order, sets }) => ({
        exerciseName,
        order,
        sets: sets.map(
          ({ setNumber, reps, weightKg, durationSeconds, side }) => ({
            setNumber,
            reps,
            weightKg,
            durationSeconds,
            side,
          }),
        ),
      })),
    },
    activity.rawPayloadJson ?? JSON.stringify(activity.rawPayload ?? null),
  );
}
