import type { Characteristic, CharacteristicResponse } from "./schema";

export const CHARACTERISTIC_TYPES = ["category", "scale", "percentage"] as const;
export type CharacteristicType = (typeof CHARACTERISTIC_TYPES)[number];

export const RESPONSE_COLORS = [
  "#dc2626",
  "#ea580c",
  "#d97706",
  "#65a30d",
  "#16a34a",
  "#059669",
  "#0891b2",
  "#0284c7",
  "#2563eb",
  "#4f46e5",
  "#7c3aed",
  "#c026d3",
  "#db2777",
  "#e11d48",
  "#64748b",
] as const;

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "response";

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
};

export const getStableResponseId = (characteristicId: string, responseName: string) =>
  `resp-${slugify(responseName)}-${hashString(`${characteristicId}:${responseName}`)}`;

export const defaultResponseColor = (index: number) => RESPONSE_COLORS[index % RESPONSE_COLORS.length];

export const normalizeResponses = (characteristic: Pick<Characteristic, "id" | "options" | "responseConfig">): CharacteristicResponse[] => {
  const options = characteristic.options || [];
  const configured = characteristic.responseConfig || [];
  const configuredByName = new Map(configured.map((response) => [response.name, response]));

  const responses = options.map((option, index) => {
    const existing = configuredByName.get(option);
    return {
      id: existing?.id || getStableResponseId(characteristic.id, option),
      name: option,
      color: existing?.color || defaultResponseColor(index),
      description: existing?.description || "",
      sortOrder: existing?.sortOrder ?? index + 1,
    };
  });

  configured
    .filter((response) => response.name && !options.includes(response.name))
    .forEach((response, index) => {
      responses.push({
        id: response.id || getStableResponseId(characteristic.id, response.name),
        name: response.name,
        color: response.color || defaultResponseColor(responses.length + index),
        description: response.description || "",
        sortOrder: response.sortOrder ?? responses.length + 1,
      });
    });

  return responses.sort((a, b) => a.sortOrder - b.sortOrder);
};

export const responseTextColor = (background: string) => {
  const hex = background.replace("#", "");
  if (hex.length !== 6) return "#ffffff";
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.62 ? "#111827" : "#ffffff";
};

export const normalizeGradeValue = (grade?: string | null) =>
  (grade || "").replace(/^grade\s+/i, "").trim();

export const isCharacteristicApplicableToGrade = (
  characteristic: Pick<Characteristic, "applyToAllGrades" | "applicableGrades">,
  grade?: string | null,
) => {
  if (characteristic.applyToAllGrades !== false) return true;
  const normalizedGrade = normalizeGradeValue(grade);
  return (characteristic.applicableGrades || []).map(normalizeGradeValue).includes(normalizedGrade);
};

export const characteristicValueToArray = (value: string | string[] | null | undefined) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return [value];
};

export const formatCharacteristicValue = (value: string | string[] | null | undefined) =>
  characteristicValueToArray(value).join(", ");
