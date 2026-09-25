// Types and metadata describing the Samplings table.

// GET /eco/samplings. The locality columns are joined in and read-only; only
// the sampling's own fields can be edited.
export type Sampling = {
  // The locality this sampling belongs to; PATCH moves it by changing this.
  locality_id: number;
  site_id: string | null;
  field_code: string | null;
  // alpha3, with the readable country name alongside it.
  country: string;
  name_en: string;
  site_name: string;
  latitude: number;
  longitude: number;
  state_region: string | null;
  settlement: string | null;
  eur_grid: number | null;
  eur_subgrid: string | null;
  masl: number | null;
  locality_note: string | null;
  sampling_id: number;
  sampling_date: string | null;
  // Drives the date filter on the backend; never shown to the user. Always
  // present - an unknown date carries the precision "unknown".
  date_precision: string;
  habitat: string;
  collector: string;
  plot_size: number | null;
  volume: number | null;
  sample_size: number | null;
  distance: number | null;
  sampling_method: string;
  ph: number | null;
  conductivity: number | null;
  releve: number | null;
  data_type: string | null;
  event: string | null;
  sampling_note: string | null;
  research_type: string;
};

export type SamplingListResponse = {
  data: Sampling[];
  total: number;
  limit: number;
  offset: number;
};

type EditInput = "text" | "decimal" | "integer" | "lookup" | "locality";

export type SamplingColumn = {
  key: keyof Sampling;
  label: string;
  sortable: boolean;
  input?: EditInput;
  nullable?: boolean;
  lookup?: string;
};

// The API uses the SamplingResponse field names everywhere - for sort_by, for
// the filter metadata and in the PATCH body - so `key` is the only name needed.
export const SAMPLING_COLUMNS: SamplingColumn[] = [
  { key: "sampling_id", label: "Sampling ID", sortable: true },
  { key: "site_id", label: "Site ID", sortable: true },
  { key: "field_code", label: "Field code", sortable: true },
  // Editing this cell moves the sampling to another locality.
  { key: "site_name", label: "Site name", sortable: true, input: "locality" },
  { key: "country", label: "Country", sortable: true },
  { key: "state_region", label: "State/Province/Region", sortable: true },
  { key: "settlement", label: "Settlement", sortable: true },
  { key: "latitude", label: "Latitude", sortable: true },
  { key: "longitude", label: "Longitude", sortable: true },
  { key: "eur_grid", label: "Grid", sortable: true },
  { key: "eur_subgrid", label: "Subgrid", sortable: true },
  { key: "masl", label: "m a.s.l.", sortable: true },
  { key: "locality_note", label: "Locality note", sortable: false },
  { key: "sampling_date", label: "Date", sortable: true },
  {
    key: "habitat",
    label: "Habitat",
    sortable: false,
    input: "text",
    nullable: false,
  },
  {
    key: "collector",
    label: "Collector",
    sortable: true,
    input: "text",
    nullable: false,
  },
  {
    key: "sampling_method",
    label: "Method",
    sortable: true,
    input: "lookup",
    lookup: "mol_sampling_methods",
    nullable: false,
  },
  {
    key: "plot_size",
    label: "Plot size",
    sortable: true,
    input: "integer",
    nullable: true,
  },
  {
    key: "volume",
    label: "Volume",
    sortable: true,
    input: "integer",
    nullable: true,
  },
  {
    key: "sample_size",
    label: "Size",
    sortable: true,
    input: "integer",
    nullable: true,
  },
  {
    key: "distance",
    label: "Distance",
    sortable: true,
    input: "integer",
    nullable: true,
  },
  {
    key: "ph",
    label: "pH",
    sortable: true,
    input: "decimal",
    nullable: true,
  },
  {
    key: "conductivity",
    label: "Conductivity",
    sortable: true,
    input: "decimal",
    nullable: true,
  },
  {
    key: "releve",
    label: "Relevé no.",
    sortable: true,
    input: "integer",
    nullable: true,
  },
  {
    key: "data_type",
    label: "Data type",
    sortable: true,
    input: "lookup",
    lookup: "mol_data_types",
    nullable: true,
  },
  {
    key: "event",
    label: "PLA/event",
    sortable: true,
    input: "text",
    nullable: true,
  },
  {
    key: "sampling_note",
    label: "Sampling note",
    sortable: false,
    input: "text",
    nullable: true,
  },
  { key: "research_type", label: "Research type", sortable: true },
];

export const SAMPLING_EDITABLE = SAMPLING_COLUMNS.filter((c) => c.input);

export const SAMPLING_DEFAULT_SORT = "sampling_id";
export const SAMPLING_ENTITY = "samplings";

// sampling_date arrives as an ISO date; date_precision says how much of it is
// real, and is never shown as such - it only decides how much gets printed.
export function formatSamplingDate(row: Sampling): string {
  if (row.date_precision === "unknown" || !row.sampling_date) return "-";
  const [year, month, day] = row.sampling_date.split("-");
  if (row.date_precision === "year") return year;
  if (row.date_precision === "month") return `${month}-${year}`;
  return `${day}-${month}-${year}`;
}
