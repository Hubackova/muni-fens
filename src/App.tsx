import { useState } from "react";
import "./App.css";
import Countries from "./Countries";
import Localities from "./Localities";
import Species from "./Species";

type Tab = "species" | "countries" | "localities";

function App() {
  const [tab, setTab] = useState<Tab>("species");

  return (
    <>
      <nav className="main-nav">
        <button
          type="button"
          className={tab === "species" ? "nav-active" : ""}
          onClick={() => setTab("species")}
        >
          Species
        </button>
        <button
          type="button"
          className={tab === "countries" ? "nav-active" : ""}
          onClick={() => setTab("countries")}
        >
          Countries
        </button>
        <button
          type="button"
          className={tab === "localities" ? "nav-active" : ""}
          onClick={() => setTab("localities")}
        >
          Localities
        </button>
      </nav>
      {tab === "species" && <Species />}
      {tab === "countries" && <Countries />}
      {tab === "localities" && <Localities />}
    </>
  );
}

export default App;
