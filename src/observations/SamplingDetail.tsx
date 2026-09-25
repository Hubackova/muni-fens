import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import {
  API_ROOT,
  errorMessage,
  fetchJson,
  sendJson,
  type LookupsResponse,
} from "../api";
import Autocomplete from "../Autocomplete";
import ErrorBanner from "../ErrorBanner";
import SynonymForm from "../species/SynonymForm";
import type { SpeciesSearchResult } from "../species/types";
import { formatSamplingDate, type Sampling } from "../samplings/types";
import ImportDialog from "./ImportDialog";
import {
  SPECIFICATION_LOOKUP,
  countsPayload,
  emptyCounts,
  totalIndividuals,
  validateCounts,
  type CountsDraft,
  type Observation,
} from "./types";

type Props = {
  samplingId: number;
  lookups: LookupsResponse;
  onBack: () => void;
};

// Everything recorded during one sampling: a read-only reminder of where and
// when it happened, the species found, and the two ways of adding more.
function SamplingDetail({ samplingId, lookups, onBack }: Props) {
  const [sampling, setSampling] = useState<Sampling | null>(null);
  const [rows, setRows] = useState<Observation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // New row
  const [species, setSpecies] = useState<SpeciesSearchResult | null>(null);
  const [draft, setDraft] = useState<CountsDraft>(emptyCounts);
  const [isSaving, setIsSaving] = useState(false);

  // Inline editing of an existing row
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<CountsDraft>(emptyCounts);
  // Set only when the row is re-pointed at a different species.
  const [editSpecies, setEditSpecies] = useState<SpeciesSearchResult | null>(
    null,
  );

  const [isImportOpen, setIsImportOpen] = useState(false);

  const load = async (signal?: AbortSignal) => {
    try {
      setIsLoading(true);
      const opts = signal ? { signal } : undefined;
      const [detail, observations] = await Promise.all([
        fetchJson<Sampling>(`${API_ROOT}/eco/samplings/${samplingId}`, opts),
        fetchJson<Observation[]>(
          `${API_ROOT}/eco/samplings/${samplingId}/observations`,
          opts,
        ),
      ]);
      setSampling(detail);
      setRows(observations);
      setError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(`Failed to load the sampling. (${errorMessage(err)})`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      await load(controller.signal);
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [samplingId]);

  const specificationOptions = lookups[SPECIFICATION_LOOKUP] ?? [];

  const fail = (field: string | null, message: string) => {
    setError(message);
    setErrorField(field);
  };

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setErrorField(null);
    setNotice(null);

    if (!species) return fail("species", "Pick the species observed.");
    const problem = validateCounts(draft);
    if (problem) return fail(problem.field, problem.message);

    try {
      setIsSaving(true);
      await sendJson(
        `${API_ROOT}/eco/samplings/${samplingId}/observations`,
        "POST",
        { species_id: species.id, ...countsPayload(draft) },
      );
      setSpecies(null);
      setDraft(emptyCounts);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const startEditing = (row: Observation) => {
    setEditingId(row.observation_id);
    setEditSpecies(null);
    setEditDraft({
      alive: row.alive === null ? "" : String(row.alive),
      empty: row.empty === null ? "" : String(row.empty),
      undefined: row.undefined === null ? "" : String(row.undefined),
      lot: row.lot === null ? "" : String(row.lot),
      vouchers: row.vouchers === null ? "" : String(row.vouchers),
      specification: row.specification ?? "",
      note: row.note ?? "",
    });
  };

  const saveEditing = async (row: Observation) => {
    setError(null);
    setErrorField(null);
    const problem = validateCounts(editDraft);
    if (problem) return fail(problem.field, problem.message);

    try {
      setIsSaving(true);
      await sendJson(
        `${API_ROOT}/eco/observations/${row.observation_id}`,
        "PATCH",
        {
          ...countsPayload(editDraft),
          ...(editSpecies ? { species_id: editSpecies.id } : {}),
        },
      );
      setEditingId(null);
      setEditSpecies(null);
      await load();
    } catch (err) {
      setError(`Failed to save the observation. (${errorMessage(err)})`);
    } finally {
      setIsSaving(false);
    }
  };

  // Hard delete here - the row is really removed, not just hidden.
  const handleDelete = async (row: Observation) => {
    const confirmed = window.confirm(
      `Remove "${row.species_name}" from this sampling? This cannot be undone.`,
    );
    if (!confirmed) return;
    try {
      setIsSaving(true);
      await sendJson(
        `${API_ROOT}/eco/observations/${row.observation_id}`,
        "DELETE",
      );
      if (editingId === row.observation_id) setEditingId(null);
      await load();
    } catch (err) {
      setError(`Failed to remove the observation. (${errorMessage(err)})`);
    } finally {
      setIsSaving(false);
    }
  };

  // Specification is an enum, so it is picked rather than typed.
  const specificationSelect = (
    value: CountsDraft,
    setValue: (next: CountsDraft) => void,
  ) => (
    <select
      className={errorField === "specification" ? "input-error" : undefined}
      value={value.specification}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setValue({ ...value, specification: e.target.value })}
    >
      <option value="">-</option>
      {specificationOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );

  const countInput = (
    value: CountsDraft,
    setValue: (next: CountsDraft) => void,
    field: keyof CountsDraft,
    type: "number" | "text" = "number",
  ) => (
    <input
      className={errorField === field ? "input-error" : undefined}
      type={type}
      value={value[field]}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setValue({ ...value, [field]: e.target.value })}
    />
  );

  return (
    <section className="page">
      <div className="detail-head">
        <button type="button" className="link-btn" onClick={onBack}>
          <ArrowLeft size={14} /> Back to samplings
        </button>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      {notice && <p className="notice">{notice}</p>}

      {isLoading && !sampling && <p>Loading...</p>}

      {sampling && (
        <>
          <h2>
            Species at sampling #{sampling.sampling_id} - {sampling.site_name}
          </h2>
          <dl className="locality-summary">
            <div>
              <dt>Site ID</dt>
              <dd>{sampling.site_id ?? "-"}</dd>
            </div>
            <div>
              <dt>Field code</dt>
              <dd>{sampling.field_code ?? "-"}</dd>
            </div>
            <div>
              <dt>Country</dt>
              <dd>{sampling.name_en}</dd>
            </div>
            <div>
              <dt>Settlement</dt>
              <dd>{sampling.settlement ?? "-"}</dd>
            </div>
            <div>
              <dt>Coordinates</dt>
              <dd>
                {sampling.latitude}, {sampling.longitude}
              </dd>
            </div>
            <div>
              <dt>m a.s.l.</dt>
              <dd>{sampling.masl ?? "-"}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>{formatSamplingDate(sampling)}</dd>
            </div>
            <div>
              <dt>Habitat</dt>
              <dd>{sampling.habitat}</dd>
            </div>
            <div>
              <dt>Collector</dt>
              <dd>{sampling.collector}</dd>
            </div>
            <div>
              <dt>Method</dt>
              <dd>{sampling.sampling_method}</dd>
            </div>
          </dl>

          <div className="toolbar">
            <button
              type="button"
              className="btn-add"
              onClick={() => setIsImportOpen(true)}
            >
              Import CSV
            </button>
          </div>

          <div className="table-wrap">
            <table className="observations-table">
              <thead>
                <tr>
                  <th>Species</th>
                  <th>Specification</th>
                  <th>Alive</th>
                  <th>Empty</th>
                  <th>Undefined</th>
                  <th>All</th>
                  <th>Lot</th>
                  <th>Vouchers</th>
                  <th>Note</th>
                  <th className="col-actions"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isEditing = editingId === row.observation_id;
                  return (
                    <tr
                      key={row.observation_id}
                      className={isEditing ? "row-editing" : "row-clickable"}
                      onClick={() => !isEditing && startEditing(row)}
                    >
                      <td>
                        {isEditing ? (
                          <Autocomplete<SpeciesSearchResult>
                            url={(q) =>
                              `${API_ROOT}/species/search?q=${encodeURIComponent(q)}`
                            }
                            getKey={(sp) => sp.id}
                            getLabel={(sp) => sp.name}
                            selected={editSpecies}
                            onSelect={setEditSpecies}
                            placeholder={row.species_name}
                          />
                        ) : (
                          row.species_name
                        )}
                      </td>
                      <td>
                        {isEditing
                          ? specificationSelect(editDraft, setEditDraft)
                          : (row.specification ?? "-")}
                      </td>
                      <td>
                        {isEditing
                          ? countInput(editDraft, setEditDraft, "alive")
                          : (row.alive ?? "-")}
                      </td>
                      <td>
                        {isEditing
                          ? countInput(editDraft, setEditDraft, "empty")
                          : (row.empty ?? "-")}
                      </td>
                      <td>
                        {isEditing
                          ? countInput(editDraft, setEditDraft, "undefined")
                          : (row.undefined ?? "-")}
                      </td>
                      <td>
                        {isEditing
                          ? totalIndividuals(editDraft)
                          : row.all_individuals}
                      </td>
                      <td>
                        {isEditing
                          ? countInput(editDraft, setEditDraft, "lot")
                          : (row.lot ?? "-")}
                      </td>
                      <td>
                        {isEditing
                          ? countInput(editDraft, setEditDraft, "vouchers")
                          : (row.vouchers ?? "-")}
                      </td>
                      <td>
                        {isEditing
                          ? countInput(editDraft, setEditDraft, "note", "text")
                          : (row.note ?? "-")}
                      </td>
                      <td className="cell-actions">
                        {isEditing ? (
                          <span onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => saveEditing(row)}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => {
                                setEditingId(null);
                                setEditSpecies(null);
                              }}
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="btn-delete"
                            title="Remove from this sampling"
                            disabled={isSaving}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(row);
                            }}
                          >
                            &times;
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="empty">
                      No species recorded for this sampling yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <br />
          <section className="form-section">
            <h2>Add species to this sampling</h2>
            <form className="modal-form" onSubmit={handleAdd}>
              <div className="form-row">
                <label className="grow">
                  Species *
                  <Autocomplete<SpeciesSearchResult>
                    url={(q) =>
                      `${API_ROOT}/species/search?q=${encodeURIComponent(q)}`
                    }
                    getKey={(s) => s.id}
                    getLabel={(s) => s.name}
                    selected={species}
                    onSelect={setSpecies}
                    invalid={errorField === "species"}
                    placeholder="Search a valid species name..."
                  />
                </label>
                <label>
                  Specification
                  {specificationSelect(draft, setDraft)}
                </label>
              </div>

              <div className="form-row">
                <label>Alive{countInput(draft, setDraft, "alive")}</label>
                <label>Empty{countInput(draft, setDraft, "empty")}</label>
                <label>
                  Undefined{countInput(draft, setDraft, "undefined")}
                </label>
                <label>
                  All
                  <output className="date-preview">
                    {totalIndividuals(draft)}
                  </output>
                </label>
                <label>Lot{countInput(draft, setDraft, "lot")}</label>
                <label>Vouchers{countInput(draft, setDraft, "vouchers")}</label>
                <label className="grow">
                  Note{countInput(draft, setDraft, "note", "text")}
                </label>
              </div>

              <div className="form-row">
                <button type="submit" disabled={isSaving}>
                  {isSaving ? "Saving..." : "Add species"}
                </button>
              </div>
            </form>
          </section>

          <section className="form-section">
            <h2>Add a species that does not exist yet</h2>
            <p className="hint">
              Creates the species itself. Add it to this sampling afterwards
              using the form above.
            </p>
            <SynonymForm
              lookups={lookups}
              onCreated={() => setNotice("Species created.")}
            />
          </section>
        </>
      )}

      {isImportOpen && (
        <ImportDialog
          samplingId={samplingId}
          onClose={() => setIsImportOpen(false)}
          onImported={async (inserted) => {
            setNotice(`${inserted} observation(s) imported.`);
            await load();
          }}
        />
      )}
    </section>
  );
}

export default SamplingDetail;
