// Types and metadata describing the Samplings table.

// GET /eco/samplings. The locality columns are joined in and read-only; only
// the sampling's own fields can be edited.
export type Sampling = {
  site_id: string | null;
  field_code: string | null;
  country: string;
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
  // Drives the date filter on the backend; never shown to the user.
  date_precision: string | null;
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
  // sort_by / filter names follow the query params, which differ from the
  // response field names for four columns (name, state, size, method).
  sortKey?: string;
  metaField?: string;
  input?: EditInput;
  // Key in the PATCH body when it differs from the response field.
  patchKey?: string;
  nullable?: boolean;
  lookup?: string;
};

export const SAMPLING_COLUMNS: SamplingColumn[] = [
  { key: "sampling_id", label: "Sampling ID", sortKey: "sampling_id", metaField: "sampling_id" },
  { key: "site_id", label: "Site ID", sortKey: "site_id", metaField: "site_id" },
  { key: "field_code", label: "Field code", sortKey: "field_code", metaField: "field_code" },
  // Editing this cell moves the sampling to another locality.
  { key: "site_name", label: "Site name", sortKey: "name", metaField: "name", input: "locality" },
  { key: "country", label: "Country", sortKey: "country", metaField: "country" },
  { key: "state_region", label: "State/Province/Region", sortKey: "state", metaField: "state" },
  { key: "settlement", label: "Settlement", sortKey: "settlement", metaField: "settlement" },
  { key: "latitude", label: "Latitude", sortKey: "latitude", metaField: "latitude" },
  { key: "longitude", label: "Longitude", sortKey: "longitude", metaField: "longitude" },
  { key: "eur_grid", label: "Grid", sortKey: "eur_grid", metaField: "eur_grid" },
  { key: "eur_subgrid", label: "Subgrid", sortKey: "eur_subgrid", metaField: "eur_subgrid" },
  { key: "masl", label: "m a.s.l.", sortKey: "masl", metaField: "masl" },
  { key: "locality_note", label: "Locality note" },
  { key: "sampling_date", label: "Date", sortKey: "sampling_date", metaField: "sampling_date" },
  { key: "habitat", label: "Habitat", input: "text", nullable: false },
  {
    key: "collector",
    label: "Collector",
    sortKey: "collector",
    metaField: "collector",
    input: "text",
    nullable: false,
  },
  {
    key: "sampling_method",
    label: "Method",
    sortKey: "method",
    metaField: "method",
    input: "lookup",
    patchKey: "method",
    lookup: "mol_sampling_methods",
    nullable: false,
  },
  {
    key: "plot_size",
    label: "Plot size",
    sortKey: "plot_size",
    metaField: "plot_size",
    input: "integer",
    nullable: true,
  },
  {
    key: "volume",
    label: "Volume",
    sortKey: "volume",
    metaField: "volume",
    input: "integer",
    nullable: true,
  },
  {
    key: "sample_size",
    label: "Size",
    sortKey: "size",
    metaField: "size",
    input: "integer",
    patchKey: "size",
    nullable: true,
  },
  {
    key: "distance",
    label: "Distance",
    sortKey: "distance",
    metaField: "distance",
    input: "integer",
    nullable: true,
  },
  {
    key: "ph",
    label: "pH",
    sortKey: "ph",
    metaField: "ph",
    input: "decimal",
    nullable: true,
  },
  {
    key: "conductivity",
    label: "Conductivity",
    sortKey: "conductivity",
    metaField: "conductivity",
    input: "decimal",
    nullable: true,
  },
  {
    key: "releve",
    label: "Relevé no.",
    sortKey: "releve",
    metaField: "releve",
    input: "integer",
    nullable: true,
  },
  {
    key: "data_type",
    label: "Data type",
    sortKey: "data_type",
    metaField: "data_type",
    input: "lookup",
    lookup: "mol_data_types",
    nullable: true,
  },
  {
    key: "event",
    label: "PLA/event",
    sortKey: "event",
    metaField: "event",
    input: "text",
    nullable: true,
  },
  {
    key: "sampling_note",
    label: "Sampling note",
    input: "text",
    patchKey: "note",
    nullable: true,
  },
  { key: "research_type", label: "Research type", sortKey: "research_type", metaField: "research_type" },
];

export const SAMPLING_EDITABLE = SAMPLING_COLUMNS.filter((c) => c.input);

export const SAMPLING_DEFAULT_SORT = "sampling_id";
export const SAMPLING_ENTITY = "samplings";

// sampling_date arrives as an ISO date; date_precision says how much of it is
// real. The precision itself never reaches the user.
export function formatSamplingDate(row: Sampling): string {
  if (!row.sampling_date) return "-";
  const [year, month, day] = row.sampling_date.split("-");
  if (row.date_precision === "year") return year;
  if (row.date_precision === "month") return `${month}-${year}`;
  return `${day}-${month}-${year}`;
}
