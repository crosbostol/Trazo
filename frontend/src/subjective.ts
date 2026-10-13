export const subjectiveScales = [
  {
    name: "mood",
    label: "Ánimo · Mood",
    values: ["muy malo", "malo", "neutral", "bueno", "muy bueno"],
  },
  {
    name: "energy",
    label: "Energía · Energy",
    values: ["muy baja", "baja", "media", "alta", "muy alta"],
  },
  {
    name: "rpe",
    label: "Esfuerzo · RPE",
    values: [
      "muy fácil",
      "fácil",
      "moderado",
      "algo exigente",
      "exigente",
      "duro",
      "muy duro",
      "muy intenso",
      "casi máximo",
      "máximo",
    ],
  },
] as const;
