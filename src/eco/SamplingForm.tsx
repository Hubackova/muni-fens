import { useState } from "react";
import {
  API_ROOT,
  errorMessage,
  fetchJson,
  isFieldError,
  type LookupsResponse,
  type StatusIdResponse,
} from "../api";
import Autocomplete from "../Autocomplete";
import type { Locality, LocalitySearchResult } from "../localities/types";
import {
  DATA_TYPE_LOOKUP,
  METHOD_LOOKUP,
  formatDate,
  parseDecimal,
  parseInteger,
  validateDate,
  type DateParts,
} from "./types";
import ErrorBanner from "../ErrorBanner";

type Props = {
  lookups: LookupsResponse;
};

const emptyForm = {
  habitat: "",
  collector: "",
  method: "",
  data_type: "",
  plot_size: "",
  volume: "",
  size: "",
  distance: "",
  ph: "",
  conductivity: "",
  releve: "",
  event: "",
  note: "",
};

const emptyDate: DateParts = { year: "", month: "", day: "" };

// Add a sampling to an existing locality. The locality is picked first and
// only shown for confirmation - creating a sampling never touches loc_main.
function SamplingForm({ lookups }: Props) {
  const [picked, setPicked] = useState<LocalitySearchResult | null>(null);
  const [locality, setLocality] = useState<Locality | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [date, setDate] = useState<DateParts>(emptyDate);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which input the current error points at, so it can be outlined.
  const [errorField, setErrorField] = useState<string | null>(null);
  const [created, setCreated] = useState<number | null>(null);

  // Every validation failure names its field, so the banner and the outline
  // always agree.
  const fail = (field: string | null, message: string) => {
    setError(message);
    setErrorField(field);
  };
  const fieldClass = (field: string) =>
    errorField === field ? "input-error" : undefined;

  const methodOptions = lookups[METHOD_LOOKUP] ?? [];
  const dataTypeOptions = lookups[DATA_TYPE_LOOKUP] ?? [];
  const update = (patch: Partial<typeof form>) =>
    setForm((f) => ({ ...f, ...patch }));

  // Load the locality for the summary and offer its habitat as a default.
  const selectLocality = async (next: LocalitySearchResult | null) => {
    setPicked(next);
    setLocality(null);
    if (!next) return;
    try {
      setError(null);
      const detail = await fetchJson<Locality>(
        `${API_ROOT}/localities/${next.id}`,
      );
      setLocality(detail);
      if (detail.current_habitat) {
        update({ habitat: detail.current_habitat });
      }
    } catch (err) {
      setError(`Failed to load the locality. (${errorMessage(err)})`);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setErrorField(null);
    setCreated(null);

    if (!picked) {
      return fail("locality", "Pick the locality this sampling belongs to.");
    }

    const dateError = validateDate(date);
    if (dateError) return fail(dateError.field, dateError.message);

    const habitat = form.habitat.trim();
    const collector = form.collector.trim();
    if (!habitat) return fail("habitat", "Habitat is required.");
    if (!collector) return fail("collector", "Collector is required.");
    if (!form.method) return fail("method", "Method is required.");

    const optionalInt = (raw: string) =>
      raw.trim() ? parseInteger(raw) : null;
    const optionalDecimal = (raw: string) =>
      raw.trim() ? parseDecimal(raw) : null;

    try {
      setIsSaving(true);
      const result = await fetchJson<StatusIdResponse>(
        `${API_ROOT}/eco/samplings`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locality_id: picked.id,
            year: optionalInt(date.year),
            month: optionalInt(date.month),
            day: optionalInt(date.day),
            habitat,
            collector,
            sampling_method: form.method,
            data_type: form.data_type || null,
            plot_size: optionalInt(form.plot_size),
            volume: optionalInt(form.volume),
            sample_size: optionalInt(form.size),
            distance: optionalInt(form.distance),
            ph: optionalDecimal(form.ph),
            conductivity: optionalDecimal(form.conductivity),
            releve: optionalInt(form.releve),
            event: form.event.trim() || null,
            sampling_note: form.note.trim() || null,
          }),
        },
      );
      setForm(emptyForm);
      setDate(emptyDate);
      setPicked(null);
      setLocality(null);
      setCreated(result.id);
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
      {created !== null && (
        <p className="notice">Sampling #{created} created.</p>
      )}

      <div className="form-row">
        <label className="grow">
          Locality *
          <Autocomplete<LocalitySearchResult>
            url={(q) =>
              `${API_ROOT}/localities/search?q=${encodeURIComponent(q)}`
            }
            getKey={(l) => l.id}
            getLabel={(l) => l.name}
            getHint={(l) => `#${l.id}`}
            selected={picked}
            onSelect={selectLocality}
            invalid={errorField === "locality"}
            placeholder="Search the locality to sample..."
          />
        </label>
      </div>

      {locality && (
        <dl className="locality-summary">
          <div>
            <dt>Site ID</dt>
            <dd>{locality.site_id ?? "-"}</dd>
          </div>
          <div>
            <dt>Field code</dt>
            <dd>{locality.field_code ?? "-"}</dd>
          </div>
          <div>
            <dt>Coordinates</dt>
            <dd>
              {locality.latitude}, {locality.longitude}
            </dd>
          </div>
          <div>
            <dt>Country</dt>
            <dd>{locality.country}</dd>
          </div>
          <div>
            <dt>Settlement</dt>
            <dd>{locality.settlement ?? "-"}</dd>
          </div>
          <div>
            <dt>m a.s.l.</dt>
            <dd>{locality.masl ?? "-"}</dd>
          </div>
        </dl>
      )}

      <div className="form-row">
        <label>
          Year
          <input
            type="number"
            className={fieldClass("year")}
            placeholder="YYYY"
            value={date.year}
            onChange={(e) => setDate((d) => ({ ...d, year: e.target.value }))}
          />
        </label>
        <label>
          Month
          <input
            type="number"
            className={fieldClass("month")}
            placeholder="MM"
            value={date.month}
            onChange={(e) => setDate((d) => ({ ...d, month: e.target.value }))}
          />
        </label>
        <label>
          Day
          <input
            type="number"
            className={fieldClass("day")}
            placeholder="DD"
            value={date.day}
            onChange={(e) => setDate((d) => ({ ...d, day: e.target.value }))}
          />
        </label>
        <label className="grow">
          Sampling date
          <output className="date-preview">{formatDate(date)}</output>
          <small className="hint">
            Leave all three empty for an unknown date, or fill them from the
            year down - a month needs a year, a day needs both.
          </small>
        </label>
      </div>

      <div className="form-row">
        <label className="grow">
          Habitat *
          <input
            className={fieldClass("habitat")}
            value={form.habitat}
            onChange={(e) => update({ habitat: e.target.value })}
          />
          {locality?.current_habitat && (
            <small className="hint">
              Prefilled from the latest sampling on this locality.
            </small>
          )}
        </label>
        <label>
          Collector *
          <input
            className={fieldClass("collector")}
            value={form.collector}
            onChange={(e) => update({ collector: e.target.value })}
          />
        </label>
      </div>

      <div className="form-row">
        <label>
          Method *
          <select
            className={fieldClass("method")}
            value={form.method}
            onChange={(e) => update({ method: e.target.value })}
          >
            <option value="">- select -</option>
            {methodOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Data type
          <select
            value={form.data_type}
            onChange={(e) => update({ data_type: e.target.value })}
          >
            <option value="">-</option>
            {dataTypeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Event
          <input
            value={form.event}
            onChange={(e) => update({ event: e.target.value })}
          />
        </label>
      </div>

      <div className="form-row">
        <label>
          Plot size
          <input
            type="number"
            value={form.plot_size}
            onChange={(e) => update({ plot_size: e.target.value })}
          />
        </label>
        <label>
          Volume
          <input
            type="number"
            value={form.volume}
            onChange={(e) => update({ volume: e.target.value })}
          />
        </label>
        <label>
          Size
          <input
            type="number"
            value={form.size}
            onChange={(e) => update({ size: e.target.value })}
          />
        </label>
        <label>
          Distance
          <input
            type="number"
            value={form.distance}
            onChange={(e) => update({ distance: e.target.value })}
          />
        </label>
      </div>

      <div className="form-row">
        <label>
          pH
          <input
            inputMode="decimal"
            value={form.ph}
            onChange={(e) => update({ ph: e.target.value })}
          />
        </label>
        <label>
          Conductivity
          <input
            inputMode="decimal"
            value={form.conductivity}
            onChange={(e) => update({ conductivity: e.target.value })}
          />
        </label>
        <label>
          Relevé
          <input
            type="number"
            value={form.releve}
            onChange={(e) => update({ releve: e.target.value })}
          />
        </label>
      </div>

      <div className="form-row">
        <label className="grow">
          Note
          <textarea
            rows={2}
            value={form.note}
            onChange={(e) => update({ note: e.target.value })}
          />
        </label>
      </div>

      <div className="form-row">
        <button type="submit" disabled={isSaving}>
          {isSaving ? "Saving..." : "Add sampling"}
        </button>
      </div>
    </form>
  );
}

export default SamplingForm;
