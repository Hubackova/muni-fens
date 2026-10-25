// Taxonomic changes: moving observations from one species to another while
// keeping the move in the species history.

// GET /species/taxon-search - a different id space than /species/search, so
// the two autocompletes are not interchangeable.
export type TaxonSearchResult = {
  id: number;
  name: string;
  deleted: boolean;
};

export type TaxonomicOperation = "split" | "merge" | "reassignment";

export const OPERATIONS: {
  id: TaxonomicOperation;
  label: string;
  description: string;
  // How many species each side takes.
  sources: "one" | "many";
  // Split picks a target per row; the others use a single one.
  targetPerRow: boolean;
  // Merge takes every observation of its sources, chosen by the backend.
  selectsRows: boolean;
}[] = [
  {
    id: "split",
    label: "Split",
    description:
      "Reassign SOME populations of one species to one or more other species.",
    sources: "one",
    targetPerRow: true,
    selectsRows: true,
  },
  {
    id: "merge",
    label: "Merge",
    description:
      "Reassign ALL observations of one or more species to another species.",
    sources: "many",
    targetPerRow: false,
    selectsRows: false,
  },
  {
    id: "reassignment",
    label: "Reassignment",
    description:
      "Reassign selected observations to another species and keep this change in species history.",
    sources: "one",
    targetPerRow: false,
    selectsRows: true,
  },
];

// POST /species/taxonomic-change/{split,reassignment}
export type TaxonObservationChange = {
  changes: { observation_id: number; target_species_id: number }[];
  date: string | null;
  note: string | null;
};

// POST /species/taxonomic-change/merge
export type TaxonMerge = {
  source_species_ids: number[];
  target_species_id: number;
  date: string | null;
  note: string | null;
};
