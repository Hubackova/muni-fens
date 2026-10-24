// GET /eco/sampling-species - every observation with its sampling and locality
// context flattened into one row. Read-only: the row spans three tables, so
// each field is edited in the tab that owns it.

export type SamplingSpeciesRow = {
  // Technical id used for PATCH; not shown.
  observation_id: number;
  sampling_id: number;
  site_id: string;
  species_name: string;
  specification: string | null;
  alive: number | null;
  empty: number | null;
  undefined: number | null;
  all_count: number;
  // Two separate numbers despite the similar names.
  voucher_no: number | null;
  vouchers: number | null;
  field_code: string | null;
  country: string;
  name_en: string;
  site_name: string | null;
  latitude: number | null;
  longitude: number | null;
  state_region: string | null;
  settlement: string | null;
  grid: number | null;
  subgrid: string | null;
  masl: number | null;
  locality_note: string | null;
  sampling_date: string | null;
  // Says how much of sampling_date is real; never shown as such.
  date_precision: string;
  collector: string | null;
  habitat: string | null;
  observation_note: string | null;
  plot_size: number | null;
  volume: number | null;
  sample_size: number | null;
  distance: number | null;
  sampling_method: string | null;
  ph: number | null;
  conductivity: number | null;
  lot: number | null;
  releve: number | null;
  data_type: string | null;
  event: string | null;
  sampling_note: string | null;
  research_type: string | null;
  deleted: number;
};

export type SamplingSpeciesListResponse = {
  data: SamplingSpeciesRow[];
  total: number;
  limit: number;
  offset: number;
};

export type SamplingSpeciesColumn = {
  key: keyof SamplingSpeciesRow;
  label: string;
  sortable: boolean;
  // Only where sort_by differs from the response field name.
  sortKey?: string;
  // Only where the filter metadata names the field differently.
  metaField?: string;
};

export const SAMPLING_SPECIES_COLUMNS: SamplingSpeciesColumn[] = [
  { key: "sampling_id", label: "Sampling ID", sortable: true },
  { key: "site_id", label: "Site ID", sortable: true },
   { key: "species_name", label: "Species name", sortable: true },
  { key: "specification", label: "Specification", sortable: true },
  { key: "alive", label: "Alive", sortable: true },
  { key: "empty", label: "Empty", sortable: true },
  { key: "undefined", label: "Undef.", sortable: true },
  {
    key: "all_count",
    label: "All",
    sortable: true,
    sortKey: "all",
    metaField: "all",
  },
  { key: "voucher_no", label: "Voucher no.", sortable: true },
  { key: "vouchers", label: "Vouchers", sortable: true },
  { key: "observation_note", label: "Note", sortable: true },
  { key: "field_code", label: "Field code", sortable: true },
  { key: "country", label: "Country", sortable: true },
  { key: "site_name", label: "Site name", sortable: true },
  { key: "latitude", label: "Latitude", sortable: true },
  { key: "longitude", label: "Longitude", sortable: true },
  { key: "state_region", label: "State/Province/Region", sortable: true },
  { key: "settlement", label: "Settlement", sortable: true },
  { key: "grid", label: "KFME Grid", sortable: true },
  { key: "subgrid", label: "Subgrid", sortable: true },
  { key: "masl", label: "m a.s.l.", sortable: true },
  { key: "locality_note", label: "Locality note", sortable: true },
  { key: "sampling_date", label: "Date", sortable: true },
  { key: "collector", label: "Collector", sortable: true },
  { key: "habitat", label: "Habitat", sortable: true },
  { key: "plot_size", label: "Plot size", sortable: true },
  { key: "volume", label: "Volume", sortable: true },
  { key: "sample_size", label: "Size", sortable: true, metaField: "size" },
  { key: "distance", label: "Distance", sortable: true },
  {
    key: "sampling_method",
    label: "Sampling method",
    sortable: true,
    metaField: "method",
  },
  { key: "ph", label: "pH", sortable: true },
  { key: "conductivity", label: "Conductivity", sortable: true },
  { key: "lot", label: "Lot no.", sortable: true },
  { key: "releve", label: "Relevé no.", sortable: true },
  { key: "data_type", label: "Data type", sortable: true },
  { key: "event", label: "PLA/Event", sortable: true },
  { key: "sampling_note", label: "Sampling note", sortable: true },
  { key: "research_type", label: "Research type", sortable: true },
];

export const SAMPLING_SPECIES_DEFAULT_SORT = "sampling_id";
export const SAMPLING_SPECIES_ENTITY = "sampling-species";
