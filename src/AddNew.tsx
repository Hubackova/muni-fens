import { useEffect, useState } from "react";
import { API_ROOT, fetchJson, type LookupsResponse } from "./api";
import LocalityForm from "./eco/LocalityForm";
import SamplingForm from "./eco/SamplingForm";
import SynonymForm from "./species/SynonymForm";

// The ECO "Add new" page. Localities and samplings used to be one record; they
// are now created separately, so the old single form is split in two.
function AddNew() {
  const [lookups, setLookups] = useState<LookupsResponse>({});
  const [speciesCreated, setSpeciesCreated] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const data = await fetchJson<LookupsResponse>(
          `${API_ROOT}/meta/lookups`,
          { signal: controller.signal },
        );
        setLookups(data ?? {});
      } catch {
        // The forms still work; only the dropdowns stay empty.
      }
    })();
    return () => controller.abort();
  }, []);

  return (
    <section className="page">
      <section className="form-section">
        <h2>Add new locality</h2>
        <LocalityForm lookups={lookups} />
      </section>

      <section className="form-section">
        <h2>Add new sampling</h2>
        <p className="hint">
          A sampling belongs to an existing locality. Creating one never changes
          the locality itself.
        </p>
        <SamplingForm lookups={lookups} />
      </section>

      <section className="form-section">
        <h2>Add new species</h2>
        {speciesCreated && <p className="notice">Species created.</p>}
        <SynonymForm
          lookups={lookups}
          onCreated={() => setSpeciesCreated(true)}
        />
      </section>
    </section>
  );
}

export default AddNew;
