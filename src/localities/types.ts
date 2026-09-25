// Types and metadata describing the Localities table.

export type Locality = {
  id: number;
  site_id: string | null;
  field_code: string | null;
  name: string;
  latitude: number;
  longitude: number;
  // alpha3 everywhere: list, detail and PATCH all speak the country code.
  country: string;
  // The country's English name, read-only, for display next to that code.
  name_en: string;
  settlement: string | null;
  state: string | null;
  masl: number | null;
  current_habitat: string | null;
  eur_grid: number | null;
  eur_subgrid: string | null;
  note: string | null;
  entry_point: string; // ECO / DNA - the interface the locality was entered through
  deleted: number;
  // Only the list endpoint reports it; a referenced locality cannot be pruned.
  in_use?: boolean;
};

export type LocalityListResponse = {
  data: Locality[];
  total: number;
  limit: number;
  offset: number;
};

// GET /countries/search -> capped at 20 results, so it drives a type-ahead
// rather than a full dropdown.
export type CountrySearchResult = {
  id: number;
  alpha2: string;
  alpha3: string;
  name_cs: string | null;
  name_en: string;
};

// How a column is edited when the row is in edit mode. Columns without an
// `input` are read-only (id, current_habitat, entry_point, deleted).
type EditInput = "text" | "decimal" | "integer" | "country" | "lookup";

export type LocalityColumn = {
  key: keyof Locality;
  // header text (display only - sort_by uses `key`)
  label: string;
  sortable: boolean;
  // field name as used by /meta/filters (when the backend offers the filter)
  metaField?: string;
  input?: EditInput;
  // false => PATCH refuses to null the field, so an empty input is an error
  nullable?: boolean;
  // name of the lookup (from /meta/lookups) that constrains this column
  lookup?: string;
};

export const LOCALITY_COLUMNS: LocalityColumn[] = [
  { key: "id", label: "ID", sortable: true },
  {
    key: "site_id",
    label: "Site ID",
    sortable: true,
    metaField: "site_id",
    input: "text",
    nullable: true,
  },
  {
    key: "field_code",
    label: "Field code",
    sortable: true,
    metaField: "field_code",
    input: "text",
    nullable: true,
  },
  {
    key: "name",
    label: "Site name",
    sortable: true,
    metaField: "name",
    input: "text",
    nullable: false,
  },
  // WGS84 decimal degrees. The API also refuses to null them.
  {
    key: "latitude",
    label: "Latitude",
    sortable: true,
    metaField: "latitude",
    input: "decimal",
    nullable: false,
  },
  {
    key: "longitude",
    label: "Longitude",
    sortable: true,
    metaField: "longitude",
    input: "decimal",
    nullable: false,
  },
  {
    key: "country",
    label: "Country",
    sortable: true,
    metaField: "country",
    input: "country",
    nullable: false,
  },
  {
    key: "settlement",
    label: "Settlement",
    sortable: true,
    metaField: "settlement",
    input: "text",
    nullable: true,
  },
  {
    key: "state",
    label: "State/Province/Region",
    sortable: true,
    metaField: "state",
    input: "text",
    nullable: true,
  },
  {
    key: "masl",
    label: "m a.s.l.",
    sortable: true,
    metaField: "masl",
    input: "integer",
    nullable: true,
  },
  { key: "current_habitat", label: "Current habitat", sortable: true },
  {
    key: "eur_grid",
    label: "Grid",
    sortable: true,
    metaField: "eur_grid",
    input: "integer",
    nullable: true,
  },
  {
    key: "eur_subgrid",
    label: "Subgrid",
    // the only column the API still rejects as a sort key
    sortable: false,
    metaField: "eur_subgrid",
    input: "lookup",
    lookup: "loc_eur_subgrid",
    nullable: true,
  },
  {
    key: "note",
    label: "Note",
    sortable: true,
    metaField: "note",
    input: "text",
    nullable: true,
  },
  {
    key: "entry_point",
    label: "Entry point",
    sortable: true,
    metaField: "entry_point",
  },
  { key: "deleted", label: "Deleted", sortable: true },
];

// Columns the PATCH body can carry, in the order they appear in the table.
export const LOCALITY_EDITABLE = LOCALITY_COLUMNS.filter((c) => c.input);

export const LOCALITY_DEFAULT_SORT = "id";
export const LOCALITY_ENTITY = "localities";
export const SUBGRID_LOOKUP = "loc_eur_subgrid";

// GET /localities/search -> [{ id, site_id, field_code, name }, ...]
export type LocalitySearchResult = {
  id: number;
  site_id: string | null;
  field_code: string | null;
  name: string;
};
