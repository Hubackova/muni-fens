// Types and metadata describing the Species table.

export type Species = {
  species_id: number;
  species_name: string | null;
  abbreviation: string | null;
  species_group: string | null;
  author_year: string | null;
  history: string | null;
  note: string | null;
};

export type SpeciesListResponse = {
  data: Species[];
  total: number;
  limit: number;
  offset: number;
};

// One entry of a species' synonym history (GET /species/{id}/history).
export type SpeciesHistory = {
  unique_id: number;
  species: string;
  author_year: string | null;
  created_on: string;
  deleted: number;
};

// GET /meta/filters/{entity}
export type FilterMeta = {
  field: string;
  label: string;
  type: string; // "select" | "text_search" | ...
  options: string[];
  // Optional: the query-param name to use when filtering GET /species by this
  // field. When the backend provides it, the FE no longer needs its hardcoded
  // field->param mapping. Falls back to SpeciesColumn.filterParam.
  param?: string;
};
export type FiltersResponse = { filters: FilterMeta[] };

// GET /cleanup/{entity}
export type CleanupField = {
  field: string;
  table: string;
  column: string;
};
export type CleanupFieldsResponse = { cleanup: CleanupField[] };

// GET /meta/lookups -> { "<lookup_name>": [{ value, label }, ...] }
export type LookupOption = { value: string; label: string };
export type LookupsResponse = Record<string, LookupOption[]>;

// GET /species/search -> [{ id, name }, ...]
export type SpeciesSearchResult = { id: number; name: string };

export type SortOrder = "asc" | "desc";

export type SpeciesColumn = {
  // property in the Species row object
  key: keyof Species;
  // header text; for sortable columns this is also the sort_by value the API expects
  label: string;
  sortable: boolean;
  // field name as used by /meta/filters and /cleanup endpoints (when applicable)
  metaField?: string;
  // query parameter used to filter GET /species by this column
  filterParam?: string;
  // name of the lookup (from /meta/lookups) that constrains this column's values
  lookup?: string;
};

// Column definitions. `label` doubles as the sort_by value the backend accepts.
export const SPECIES_COLUMNS: SpeciesColumn[] = [
  { key: "species_id", label: "Species ID", sortable: true },
  { key: "species_name", label: "Species name", sortable: true },
  {
    key: "abbreviation",
    label: "Abbreviation",
    sortable: true,
    metaField: "abbreviation",
    filterParam: "filter_abb",
  },
  {
    key: "species_group",
    label: "Group",
    sortable: true,
    metaField: "group",
    filterParam: "filter_group",
    lookup: "mol_species_groups",
  },
  {
    key: "author_year",
    label: "Author and year",
    sortable: true,
    metaField: "author_year",
    filterParam: "filter_author_year",
  },
  { key: "history", label: "History", sortable: true },
  {
    key: "note",
    label: "Note",
    sortable: true,
    metaField: "note",
    filterParam: "filter_note",
  },
];

export const SPECIES_DEFAULT_SORT = "Species name";
export const SPECIES_ENTITY = "species";
