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

// GET /species/{id}/history returns two kinds of history side by side.
export type SpeciesHistory = {
  unique_id: number;
  species: string;
  abbreviation: string | null;
  author_year: string | null;
  created_on: string;
  deleted: number;
};

// One taxonomic change (split / merge / reassignment) this species took part
// in, either as a source or as a target.
export type SpeciesTaxonomicChange = {
  change_id: number | null;
  type: string | null;
  role: string | null;
  date: string | null;
  created_on: string | null;
  note: string | null;
  source_species: string[] | null;
  target_species: string[] | null;
  affected_observations: number | null;
  // Localities touched, grouped by the species they were taken from.
  affected_localities_by_species: Record<string, string[]> | null;
  // Set instead of the data when there is nothing to report.
  message: string | null;
};

export type SpeciesFullHistory = {
  name_history: SpeciesHistory[];
  taxonomic_history: SpeciesTaxonomicChange[];
};

// GET /cleanup/{entity}
export type CleanupField = {
  field: string;
  table: string;
  column: string;
};
export type CleanupFieldsResponse = { cleanup: CleanupField[] };

// GET /species/search -> [{ id, name }, ...]
export type SpeciesSearchResult = { id: number; name: string };

export type SortOrder = "asc" | "desc";

export type SpeciesColumn = {
  // property in the Species row object
  key: keyof Species;
  // header text (display only - sort_by uses `key`)
  label: string;
  sortable: boolean;
  // field name as used by /meta/filters and /cleanup endpoints (when applicable)
  // the matching filter's query param comes from /meta/filters
  metaField?: string;
  // name of the lookup (from /meta/lookups) that constrains this column's values
  lookup?: string;
};

// Column definitions. The API sorts by the field name, which matches `key`.
export const SPECIES_COLUMNS: SpeciesColumn[] = [
  { key: "species_id", label: "Species ID", sortable: true },
  { key: "species_name", label: "Species name", sortable: true },
  {
    key: "abbreviation",
    label: "Abbreviation",
    sortable: true,
    metaField: "abbreviation",
  },
  {
    key: "species_group",
    label: "Group",
    sortable: true,
    metaField: "group",
    lookup: "mol_species_groups",
  },
  {
    key: "author_year",
    label: "Author and year",
    sortable: true,
    metaField: "author_year",
  },
  { key: "history", label: "History", sortable: true },
  {
    key: "note",
    label: "Note",
    sortable: true,
    metaField: "note",
  },
];

export const SPECIES_DEFAULT_SORT = "species_name";
export const SPECIES_ENTITY = "species";
