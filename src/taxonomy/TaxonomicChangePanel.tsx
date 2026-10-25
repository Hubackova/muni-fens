import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { API_ROOT, errorMessage, sendJson } from "../api";
import Autocomplete from "../Autocomplete";
import ErrorBanner from "../ErrorBanner";
import type { SamplingSpeciesRow } from "../samplingSpecies/types";
import ConfirmTaxonomicChange from "./ConfirmTaxonomicChange";
import {
  OPERATIONS,
  type TaxonSearchResult,
  type TaxonomicOperation,
} from "./types";

type Props = {
  // Observations ticked in the main table; empty for merge.
  selectedIds: number[];
  // Loads every row matching the table's current filters, across pages.
  fetchMatching: () => Promise<SamplingSpeciesRow[]>;
  // Narrows the main table to the chosen source species.
  onSourceChange: (speciesIds: number[]) => void;
  onSelectAll: (ids: number[]) => void;
  // Drops every row tick in the table below.
  onClearSelection: () => void;
  onClose: () => void;
  onSaved: (message: string) => void;
};

// Long enough to swallow a burst of row ticks, short enough to feel live.
const REVIEW_DEBOUNCE_MS = 250;

const taxonUrl = (q: string, includeDeleted: boolean) =>
  `${API_ROOT}/species/taxon-search?q=${encodeURIComponent(q)}&include_deleted=${includeDeleted}`;

// Sits above the All data table: picks the operation, the species on both
// sides, and the observations the change applies to.
function TaxonomicChangePanel({
  selectedIds,
  fetchMatching,
  onSourceChange,
  onSelectAll,
  onClearSelection,
  onClose,
  onSaved,
}: Props) {
  const [operation, setOperation] = useState<TaxonomicOperation | null>(null);
  const [sources, setSources] = useState<TaxonSearchResult[]>([]);
  const [sourceDraft, setSourceDraft] = useState<TaxonSearchResult | null>(
    null,
  );
  const [target, setTarget] = useState<TaxonSearchResult | null>(null);
  // Split picks a target per observation.
  const [rowTargets, setRowTargets] = useState<
    Record<number, TaxonSearchResult>
  >({});
  const [rows, setRows] = useState<SamplingSpeciesRow[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const spec = OPERATIONS.find((o) => o.id === operation);

  const reset = () => {
    setSources([]);
    setSourceDraft(null);
    setTarget(null);
    setRowTargets({});
    setRows(null);
    setError(null);
    onSourceChange([]);
  };

  // Each operation reads the ticks differently - merge ignores them, the
  // others act on exactly those rows - so switching starts from a clean slate.
  const chooseOperation = (next: TaxonomicOperation) => {
    setOperation(next);
    reset();
    onClearSelection();
  };

  const addSource = (picked: TaxonSearchResult | null) => {
    // A single-source field hands its own selection back; "Change" clears it.
    if (!picked) {
      if (spec?.sources === "one") {
        setSources([]);
        onSourceChange([]);
      }
      return;
    }
    const next =
      spec?.sources === "one"
        ? [picked]
        : [...sources, picked].filter(
            (s, i, all) => all.findIndex((o) => o.id === s.id) === i,
          );
    setSources(next);
    setSourceDraft(null);
    onSourceChange(next.map((s) => s.id));
  };

  const removeSource = (id: number) => {
    const next = sources.filter((s) => s.id !== id);
    setSources(next);
    onSourceChange(next.map((s) => s.id));
  };

  // The table's filters change with every keystroke upstream, so the fetcher is
  // read through a ref - it must not be what re-triggers the review below.
  const fetchRef = useRef(fetchMatching);
  useEffect(() => {
    fetchRef.current = fetchMatching;
  });

  const sourceKey = sources.map((s) => s.id).join(",");
  const selectionKey = spec?.selectsRows ? selectedIds.join(",") : "";
  const selectedRef = useRef(selectedIds);
  useEffect(() => {
    selectedRef.current = selectedIds;
  });

  // The working table builds itself from whatever is picked: the ticked rows
  // for split/reassignment, every row of the source species for merge.
  useEffect(() => {
    const ready =
      !!spec &&
      sources.length > 0 &&
      (!spec.selectsRows || selectedIds.length > 0);

    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      if (!ready) {
        setRows(null);
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const matching = await fetchRef.current();
        if (cancelled) return;
        const picked = spec!.selectsRows
          ? matching.filter((row) =>
              selectedRef.current.includes(row.observation_id),
            )
          : matching;
        setRows(picked);
        if (!spec!.selectsRows && picked.length === 0) {
          setError(
            "The selected species have no observations. The merge will still record the change.",
          );
        }
      } catch (err) {
        if (cancelled) return;
        setError(`Failed to load the observations. (${errorMessage(err)})`);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    // Ticking a run of rows would otherwise refetch the whole matching set on
    // every single tick.
    const timer = setTimeout(() => void run(), REVIEW_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operation, sourceKey, selectionKey]);

  const selectAllMatching = async () => {
    try {
      setIsLoading(true);
      const matching = await fetchMatching();
      onSelectAll(matching.map((row) => row.observation_id));
    } catch (err) {
      setError(`Failed to load the observations. (${errorMessage(err)})`);
    } finally {
      setIsLoading(false);
    }
  };

  // Split needs a target on every row; the others need exactly one.
  const missingTargets = spec?.targetPerRow
    ? (rows ?? []).filter((row) => !rowTargets[row.observation_id]).length
    : 0;
  const canConfirm =
    !!spec &&
    sources.length > 0 &&
    (spec.targetPerRow
      ? (rows?.length ?? 0) > 0 && missingTargets === 0
      : !!target && (!spec.selectsRows || (rows?.length ?? 0) > 0));

  const targetNames = spec?.targetPerRow
    ? Array.from(new Set(Object.values(rowTargets).map((taxon) => taxon.name)))
    : target
      ? [target.name]
      : [];

  const countryCodes = Array.from(
    new Set((rows ?? []).map((row) => row.country).filter(Boolean)),
  );

  const save = async (date: string | null, note: string | null) => {
    if (!spec) return;
    try {
      setIsSaving(true);
      if (spec.id === "merge") {
        await sendJson(`${API_ROOT}/species/taxonomic-change/merge`, "POST", {
          source_species_ids: sources.map((s) => s.id),
          target_species_id: target?.id,
          date,
          note,
        });
      } else {
        const changes = (rows ?? []).map((row) => ({
          observation_id: row.observation_id,
          target_species_id: spec.targetPerRow
            ? rowTargets[row.observation_id].id
            : (target as TaxonSearchResult).id,
        }));
        await sendJson(
          `${API_ROOT}/species/taxonomic-change/${spec.id}`,
          "POST",
          { changes, date, note },
        );
      }
      setIsConfirming(false);
      onSaved(`Taxonomic ${spec.id} saved successfully.`);
      setOperation(null);
      reset();
    } catch (err) {
      setIsConfirming(false);
      setError(errorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="taxonomy-panel">
      <div className="taxonomy-head">
        <h2>Taxonomic changes</h2>
        <button
          type="button"
          className="modal-close"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <div className="form-row">
        {OPERATIONS.map((item) => (
          <label key={item.id} className="taxonomy-option">
            <span className="taxonomy-option-title">
              <input
                type="radio"
                name="taxonomic-operation"
                checked={operation === item.id}
                onChange={() => chooseOperation(item.id)}
              />
              <strong>{item.label}</strong>
            </span>
            <small className="hint">{item.description}</small>
          </label>
        ))}
      </div>

      {spec && (
        <>
          <br />
          <div className="form-row">
            <label className="grow">
              Source{" "}
              {spec.sources === "one" ? "species" : "species (one or more)"}
              <Autocomplete<TaxonSearchResult>
                url={(q) => taxonUrl(q, false)}
                getKey={(t) => t.id}
                getLabel={(t) => t.name}
                selected={
                  spec.sources === "one" ? (sources[0] ?? null) : sourceDraft
                }
                onSelect={addSource}
                placeholder="Search a species..."
              />
              <small className="hint">
                The species that will be{" "}
                {spec.id === "merge" ? "merged" : spec.id}. Only active species
                can be a source.
              </small>
            </label>

            {!spec.targetPerRow && (
              <label className="grow">
                Target species
                <Autocomplete<TaxonSearchResult>
                  url={(q) => taxonUrl(q, true)}
                  getKey={(t) => t.id}
                  getLabel={(t) => t.name}
                  getHint={(t) => (t.deleted ? "(deleted)" : "")}
                  selected={target}
                  onSelect={setTarget}
                  placeholder="Search a species..."
                />
                <small className="hint">Deleted species can be a target.</small>
              </label>
            )}
          </div>

          {spec.sources !== "one" && sources.length > 0 && (
            <p className="taxonomy-sources">
              {sources.map((source) => (
                <span key={source.id} className="autocomplete-chip">
                  {source.name}
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => removeSource(source.id)}
                  >
                    Remove
                  </button>
                </span>
              ))}
            </p>
          )}

          {sources.length > 0 && (
            <div className="form-row">
              {spec.selectsRows && (
                <>
                  <span className="hint">
                    {selectedIds.length} observation(s) ticked in the table
                    below.
                  </span>
                  <button
                    type="button"
                    className="toolbar-toggle"
                    disabled={isLoading}
                    onClick={selectAllMatching}
                  >
                    Select all matching
                  </button>
                </>
              )}
              {isLoading && <span className="hint">Loading review...</span>}
            </div>
          )}

          {rows && (
            <div className="table-wrap">
              <table className="merge-table">
                <thead>
                  <tr>
                    <th className="col-narrow">Sampling</th>
                    <th>Field code</th>
                    <th>Country</th>
                    <th>Date</th>
                    <th>Collector</th>
                    <th>Current species</th>
                    <th>All</th>
                    {spec.targetPerRow && (
                      <th className="col-new-species">New species</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.observation_id}>
                      <td className="col-narrow">#{row.sampling_id}</td>
                      <td>{row.field_code ?? "-"}</td>
                      <td>{row.name_en}</td>
                      <td>{row.sampling_date ?? "-"}</td>
                      <td>{row.collector ?? "-"}</td>
                      <td>{row.species_name}</td>
                      <td>{row.all_count}</td>
                      {spec.targetPerRow && (
                        <td className="col-new-species">
                          <Autocomplete<TaxonSearchResult>
                            url={(q) => taxonUrl(q, true)}
                            getKey={(t) => t.id}
                            getLabel={(t) => t.name}
                            selected={rowTargets[row.observation_id] ?? null}
                            onSelect={(picked) =>
                              setRowTargets((current) => {
                                const next = { ...current };
                                if (picked) next[row.observation_id] = picked;
                                else delete next[row.observation_id];
                                return next;
                              })
                            }
                            placeholder="Search a species..."
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="empty">
                        No observations.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {rows && spec.targetPerRow && missingTargets > 0 && (
            <p className="field-warning">
              {missingTargets} row(s) still have no new species.
            </p>
          )}

          <div className="form-row">
            <button
              type="button"
              className="btn-primary"
              disabled={!canConfirm}
              onClick={() => setIsConfirming(true)}
            >
              Confirm {spec.label.toLowerCase()}
            </button>
          </div>
        </>
      )}

      {isConfirming && spec && (
        <ConfirmTaxonomicChange
          operation={spec.label.toLowerCase()}
          sourceNames={sources.map((s) => s.name)}
          targetNames={targetNames}
          observationCount={rows?.length ?? 0}
          countryCodes={countryCodes}
          isSaving={isSaving}
          onConfirm={save}
          onCancel={() => setIsConfirming(false)}
        />
      )}
    </section>
  );
}

export default TaxonomicChangePanel;
