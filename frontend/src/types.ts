export type ActivityType =
  "Running" | "Strength" | "Walking" | "Cycling" | "Hiking" | "Other";
export interface RunningLap {
  lapNumber: number;
  distanceKm: number | null;
  durationSeconds: number | null;
  averagePaceSecondsPerKm: number | null;
}
export interface RunningDetails {
  activityId: string;
  laps: RunningLap[];
  distanceKm: number | null;
  totalDurationSeconds: number | null;
  averagePaceSecondsPerKm: number | null;
  averageHeartRate: number | null;
  [key: string]: number | string | null | RunningLap[];
}
export interface StrengthSet {
  id: string;
  setNumber: number;
  reps: number;
  weightKg: number | null;
  durationSeconds: number | null;
  side: "Left" | "Right" | "Both" | null;
}
export interface Exercise {
  id: string;
  exerciseName: string;
  order: number;
  sets: StrengthSet[];
}
export interface Activity {
  id: string;
  date: string;
  type: ActivityType;
  activitySubtype?: string | null;
  durationSeconds: number;
  notes: string | null;
  mood: number | null;
  energy: number | null;
  rpe: number | null;
  subjectiveNotes?: string | null;
  running?: RunningDetails | null;
  walking?: WalkingDetails | null;
  exercises?: Exercise[];
  rawPayload?: unknown;
  rawPayloadJson?: string | null;
  distanceKm?: number | null;
  averagePaceSecondsPerKm?: number | null;
  averageHeartRate?: number | null;
}
export interface WalkingDetails {
  activityId: string;
  distanceKm: number | null;
  totalDurationSeconds: number | null;
  averagePaceSecondsPerKm: number | null;
  averageHeartRate: number | null;
  [key: string]: number | string | null;
}
export interface Dashboard {
  asOf: string;
  weekStartsOn: string;
  totalActivities: number;
  activitiesThisWeek: number;
  distanceThisWeekKm: number;
  distanceLast30DaysKm: number;
  recentPaceSecondsPerKm: number | null;
  recentAverageHeartRate: number | null;
  latestActivity: Activity | null;
  weeklyDistance: { week: string; distanceKm: number }[];
  paceHistory: { date: string; paceSecondsPerKm: number }[];
}
export interface RangeDashboard {
  asOf: string;
  from: string;
  to: string;
  granularity: "day" | "week";
  sessions: number;
  distanceKm: number;
  paceSecondsPerKm: number | null;
  averageHeartRate: number | null;
  latestActivity: Activity | null;
  activities: Activity[];
  series: {
    date: string;
    endDate: string;
    sessions: number;
    distanceKm: number;
    paceSecondsPerKm: number | null;
  }[];
}
export interface BodyMeasurement {
  id: string;
  date: string;
  weightKg: number;
  bodyFatPercentage: number | null;
  notes: string | null;
}
