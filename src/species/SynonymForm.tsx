import { useState } from "react";
import {
  API_ROOT,
  errorMessage,
  fetchJson,
  isFieldError,
  type LookupsResponse,
} from "../api";
import SpeciesAutocomplete from "./SpeciesAutocomplete";
import type { SpeciesSearchResult } from "./types";
import ErrorBanner from "../ErrorBanner";

type Props = {
  lookups: LookupsResponse;
  onCreated: () => void; // reload the table after a successful create
};

// The lookup that constrains the `type` field (only species.type for now).
const TYPE_LOOKUP = "mol_species_groups";

const emptyForm = {
  species: "",
  abbreviation: "",
  author_year: "",
  note: "",
  type: "",
};

// Add a new species, or synonymize against an existing one.
// When `sp_previous` is set, the backend creates a synonym, records the
// history and renames the species across the database.
function SynonymForm({ lookups, onCreated }: Props) {
  const [form, setForm] = useState(emptyForm);
  const [previous, setPrevious] = useState<SpeciesSearchResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);

  const fail = (field: string | null, message: string) => {
    setError(message);
    setErrorField(field);
  };
  const fieldClass = (field: string) =>
    errorField === field ? "input-error" : undefined;

  const typeOptions = lookups[TYPE_LOOKUP] ?? [];

  const update = (patch: Partial<typeof form>) =>
    setForm((f) => ({ ...f, ...patch }));

  // The type-aheads keep the typed text in their own state, so Reset gives
  // them a new key and they come back empty.
  const [resetKey, setResetKey] = useState(0);

  const handleReset = () => {
    setResetKey((n) => n + 1);
    setForm(emptyForm);
    setPrevious(null);
    setError(null);
    setErrorField(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setErrorField(null);

    const species = form.species.trim();
    if (!species) return fail("species", "Species name is required.");
    if (!form.type) return fail("type", "Type is required.");

    try {
      setIsSaving(true);
      await fetchJson(`${API_ROOT}/species/synonym`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          species,
          type: form.type,
          abbreviation: form.abbreviation.trim() || null,
          author_year: form.author_year.trim() || null,
          note: form.note.trim() || null,
          // null/empty => brand new species; an id => synonym of that species
          sp_previous: previous ? previous.id : null,
        }),
      });
      setForm(emptyForm);
      setPrevious(null);
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
      setErrorField(isFieldError(err) ? err.field : null);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="modal-form" onSubmit={handleSubmit}>
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <div className="form-row">
        <label>
          Species name *
          <input
            className={fieldClass("species")}
            value={form.species}
            onChange={(e) => update({ species: e.target.value })}
          />
        </label>

        <label>
          Type *
          <select
            className={fieldClass("type")}
            value={form.type}
            onChange={(e) => update({ type: e.target.value })}
          >
            <option value="">– select –</option>
            {typeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Abbreviation
          <input
            value={form.abbreviation}
            onChange={(e) => update({ abbreviation: e.target.value })}
          />
        </label>

        <label>
          Author and year
          <input
            value={form.author_year}
            onChange={(e) => update({ author_year: e.target.value })}
          />
        </label>
      </div>

      <div className="form-row">
        <label className="grow">
          Note
          <textarea
            value={form.note}
            rows={2}
            placeholder="Optional note"
            onChange={(e) => update({ note: e.target.value })}
          />
        </label>

        <label className="grow">
          Synonym of (previous species)
          <SpeciesAutocomplete
            key={resetKey}
            selected={previous}
            onSelect={setPrevious}
            placeholder="Leave empty to create a new species"
          />
          <small className="hint">
            Pick an existing species to create a synonym; leave empty to add a
            standalone species. A synonym renames the whole taxon - use it only
            for global nomenclatural or taxonomic name changes, not for
            reassigning some populations.
          </small>
        </label>
      </div>

      <div className="form-row">
        <button type="submit" disabled={isSaving}>
          {isSaving ? "Saving..." : previous ? "Create synonym" : "Add species"}
        </button>
        <button
          type="button"
          className="btn-reset"
          disabled={isSaving}
          onClick={handleReset}
        >
          Reset
        </button>
      </div>
    </form>
  );
}

export default SynonymForm;
