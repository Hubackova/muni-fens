import { useEffect, useState } from "react";
import { API_ROOT, errorMessage, fetchJson } from "../api";
import Autocomplete from "../Autocomplete";
import type { Locality, LocalitySearchResult } from "./types";

type Props = {
  onClose: () => void;
  onDone: () => void; // reload the table after a successful merge
};

type Side = "A" | "B";
type EntryPoint = "ECO" | "DNA";

// Every A/B decision the merge body carries. `coordinates` covers latitude and
// longitude together - the API takes one choice for the pair.
type ChoiceKey =
  | "site_id"
  | "field_code"
  | "name"
  | "coordinates"
  | "country"
  | "settlement"
  | "state"
  | "masl"
  | "eur_grid"
  | "eur_subgrid"
  | "note";

const CHOICES: { key: ChoiceKey; label: string; show: (l: Locality) => string }[] =
  [
    { key: "site_id", label: "Site ID", show: (l) => l.site_id ?? "-" },
    { key: "field_code", label: "Field code", show: (l) => l.field_code ?? "-" },
    { key: "name", label: "Site name", show: (l) => l.name },
    {
      key: "coordinates",
      label: "Coordinates",
      show: (l) => `${l.latitude}, ${l.longitude}`,
    },
    { key: "country", label: "Country", show: (l) => l.country },
    { key: "settlement", label: "Settlement", show: (l) => l.settlement ?? "-" },
    { key: "state", label: "State/Province/Region", show: (l) => l.state ?? "-" },
    { key: "masl", label: "m a.s.l.", show: (l) => String(l.masl ?? "-") },
    { key: "eur_grid", label: "Grid", show: (l) => String(l.eur_grid ?? "-") },
    { key: "eur_subgrid", label: "Subgrid", show: (l) => l.eur_subgrid ?? "-" },
    { key: "note", label: "Note", show: (l) => l.note ?? "-" },
  ];

const defaultChoices = Object.fromEntries(
  CHOICES.map((c) => [c.key, "A" as Side]),
) as Record<ChoiceKey, Side>;

// Merge two localities into a new one: the user picks, field by field, which
// side the new locality inherits. The originals are kept (renamed by the
// backend), and every sampling moves to the new locality - hence the extra
// confirmation step.
function MergeDialog({ onClose, onDone }: Props) {
  const [pickA, setPickA] = useState<LocalitySearchResult | null>(null);
  const [pickB, setPickB] = useState<LocalitySearchResult | null>(null);
  const [detailA, setDetailA] = useState<Locality | null>(null);
  const [detailB, setDetailB] = useState<Locality | null>(null);
  const [choices, setChoices] = useState(defaultChoices);
  // Null until the user picks: the default follows locality A.
  const [entryPoint, setEntryPoint] = useState<EntryPoint | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sameLocality = !!pickA && !!pickB && pickA.id === pickB.id;
  const effectiveEntryPoint: EntryPoint =
    entryPoint ?? (detailA?.entry_point === "DNA" ? "DNA" : "ECO");
  const ready = !!detailA && !!detailB && !sameLocality;

  // Pull the full records: /localities/search only returns id and the codes.
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        setError(null);
        const [a, b] = await Promise.all([
          pickA
            ? fetchJson<Locality>(`${API_ROOT}/localities/${pickA.id}`, {
                signal: controller.signal,
              })
            : Promise.resolve(null),
          pickB
            ? fetchJson<Locality>(`${API_ROOT}/localities/${pickB.id}`, {
                signal: controller.signal,
              })
            : Promise.resolve(null),
        ]);
        setDetailA(a);
        setDetailB(b);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(`Failed to load the selected localities. (${errorMessage(err)})`);
      }
    })();
    return () => controller.abort();
  }, [pickA, pickB]);

  const handleMerge = async () => {
    if (!pickA || !pickB || sameLocality) return;
    try {
      setIsMerging(true);
      setError(null);
      await fetchJson(`${API_ROOT}/localities/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locality_a_id: pickA.id,
          locality_b_id: pickB.id,
          ...choices,
          entry_point: effectiveEntryPoint,
        }),
      });
      onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setIsConfirming(false);
    } finally {
      setIsMerging(false);
    }
  };

  const searchUrl = (q: string) =>
    `${API_ROOT}/localities/search?q=${encodeURIComponent(q)}`;
  const pickLabel = (l: LocalitySearchResult) =>
    `${l.name}${l.site_id ? ` (${l.site_id})` : ""}`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>Merge localities</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="form-row">
          <label className="grow">
            Locality A
            <Autocomplete<LocalitySearchResult>
              url={searchUrl}
              getKey={(l) => l.id}
              getLabel={pickLabel}
              getHint={(l) => `#${l.id}`}
              selected={pickA}
              onSelect={setPickA}
              placeholder="Search localities..."
            />
          </label>
          <label className="grow">
            Locality B
            <Autocomplete<LocalitySearchResult>
              url={searchUrl}
              getKey={(l) => l.id}
              getLabel={pickLabel}
              getHint={(l) => `#${l.id}`}
              selected={pickB}
              onSelect={setPickB}
              placeholder="Search localities..."
            />
          </label>
        </div>

        {sameLocality && (
          <p className="error">
            A and B must be two different localities.
          </p>
        )}

        {ready && detailA && detailB && (
          <>
            <p className="hint">
              Pick the value the new locality inherits for every field.
            </p>
            <div className="table-wrap">
              <table className="merge-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>A: {detailA.name}</th>
                    <th>B: {detailB.name}</th>
                  </tr>
                </thead>
                <tbody>
                  {CHOICES.map((field) => (
                    <tr key={field.key}>
                      <td>{field.label}</td>
                      {(["A", "B"] as Side[]).map((side) => (
                        <td key={side}>
                          <label className="merge-option">
                            <input
                              type="radio"
                              name={`merge-${field.key}`}
                              checked={choices[field.key] === side}
                              onChange={() =>
                                setChoices((c) => ({ ...c, [field.key]: side }))
                              }
                            />
                            <span>
                              {field.show(side === "A" ? detailA : detailB)}
                            </span>
                          </label>
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <td>Entry point</td>
                    <td colSpan={2}>
                      <select
                        value={effectiveEntryPoint}
                        onChange={(e) =>
                          setEntryPoint(e.target.value as EntryPoint)
                        }
                      >
                        <option value="ECO">ECO</option>
                        <option value="DNA">DNA</option>
                      </select>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}

        {isConfirming && detailA && detailB && (
          <div className="danger-note">
            <strong>Are you sure?</strong> This creates a new locality and moves
            every sampling from <em>{detailA.name}</em> (#{detailA.id}) and{" "}
            <em>{detailB.name}</em> (#{detailB.id}) onto it, together with all
            records attached to them. Both originals are kept, but their Site ID
            and Field code get an <code>M_&lt;ID&gt;_</code> prefix and their
            note is marked <code>MERGED INTO &lt;new ID&gt;</code>.
          </div>
        )}

        <div className="modal-foot">
          {isConfirming ? (
            <>
              <button
                type="button"
                className="btn-danger"
                disabled={isMerging}
                onClick={handleMerge}
              >
                {isMerging ? "Merging..." : "Yes, merge them"}
              </button>
              <button
                type="button"
                disabled={isMerging}
                onClick={() => setIsConfirming(false)}
              >
                Back
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn-primary"
                disabled={!ready}
                onClick={() => setIsConfirming(true)}
              >
                Merge
              </button>
              <button type="button" onClick={onClose}>
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default MergeDialog;
