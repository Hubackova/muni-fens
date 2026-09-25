// Types and metadata for the ECO "Add new" forms.

// POST /eco/localities
export type LocalityCreate = {
  site_id: string | null;
  field_code: string | null;
  name: string;
  latitude: number;
  longitude: number;
  country: string; // alpha3
  settlement: string | null;
  state: string | null;
  masl: number | null;
  eur_grid: number | null;
  eur_subgrid: string | null;
  note: string | null;
};

// POST /eco/samplings. Date parts are sent separately; the backend derives the
// precision from which of them are filled in.
export type SamplingCreate = {
  locality_id: number;
  year: number | null;
  month: number | null;
  day: number | null;
  habitat: string;
  collector: string;
  sampling_method: string;
  data_type: string | null;
  plot_size: number | null;
  volume: number | null;
  sample_size: number | null;
  distance: number | null;
  ph: number | null;
  conductivity: number | null;
  releve: number | null;
  event: string | null;
  sampling_note: string | null;
};

export const SUBGRID_LOOKUP = "loc_eur_subgrid";
export const METHOD_LOOKUP = "mol_sampling_methods";
export const DATA_TYPE_LOOKUP = "mol_data_types";

// Decimal degrees are typed on Czech keyboards, so a comma is accepted and
// handed to the API as the dot notation it requires.
export function parseDecimal(raw: string): number | null {
  const value = Number(raw.trim().replace(",", "."));
  return Number.isNaN(value) ? null : value;
}

export function parseInteger(raw: string): number | null {
  const value = Number.parseInt(raw.trim(), 10);
  return Number.isNaN(value) ? null : value;
}

export type DateParts = { year: string; month: string; day: string };

export type DateProblem = { field: keyof DateParts; message: string };

// The API accepts nothing, a year, a year+month or a full date - never a month
// without a year or a day without a month.
export function validateDate(parts: DateParts): DateProblem | null {
  const year = parts.year.trim();
  const month = parts.month.trim();
  const day = parts.day.trim();

  if (month && !year)
    return { field: "year", message: "Month cannot be given without a year." };
  if (day && !month)
    return {
      field: "month",
      message: "Day cannot be given without a month and a year.",
    };

  if (month) {
    const value = Number(month);
    if (!Number.isInteger(value) || value < 1 || value > 12) {
      return { field: "month", message: "Month must be between 1 and 12." };
    }
  }
  if (day) {
    const value = Number(day);
    if (!Number.isInteger(value) || value < 1 || value > 31) {
      return { field: "day", message: "Day must be between 1 and 31." };
    }
  }
  if (year) {
    const value = Number(year);
    if (!Number.isInteger(value) || value < 1000 || value > 9999) {
      return {
        field: "year",
        message: "Year must be a four-digit number.",
      };
    }
  }
  return null;
}

// How the date reads back to the user: YYYY, MM-YYYY or DD-MM-YYYY.
export function formatDate(parts: DateParts): string {
  const year = parts.year.trim();
  if (!year) return "not known";
  const month = parts.month.trim();
  if (!month) return year;
  const padded = month.padStart(2, "0");
  const day = parts.day.trim();
  if (!day) return `${padded}-${year}`;
  return `${day.padStart(2, "0")}-${padded}-${year}`;
}
