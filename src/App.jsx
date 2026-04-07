import { useState, useMemo, useEffect } from "react";

export default function App() {
  // --- STATE (Your ML Factors) ---
  const [sleep, setSleep] = useState(7);
  const [steps, setSteps] = useState(5000);
  const [alcohol, setAlcohol] = useState(0);
  const [hoursSinceMeal, setHoursSinceMeal] = useState(3);

  // This holds the data coming back from your Python API
  const [apiResult, setApiResult] = useState({
    energy_score: 70,
    recommendation: "LOADING...",
    breakdown: { boost: 0 },
  });

  // --- API CONNECTION (The "Bridge") ---
  useEffect(() => {
    const updateFromPython = async () => {
      try {
        const response = await fetch("http://127.0.0.1:8000/predict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sleep_hrs: parseFloat(sleep),
            alcohol_units: parseInt(alcohol),
            caffeine_mg: 100,
            hours_since_caffeine: 2.0, // Hardcoded for now
            hours_since_meal: parseFloat(hoursSinceMeal),
            current_time_24h: 13.5, // Hardcoded for now
          }),
        });
        const data = await response.json();
        setApiResult(data);
      } catch (err) {
        console.error(
          "Python server is offline. Run 'uvicorn main:app --reload'",
        );
      }
    };

    updateFromPython();
  }, [sleep, alcohol, hoursSinceMeal]); // Runs whenever these sliders move

  // --- VISUAL LOGIC (The Curve) ---
  const numberOfBars = 60;
  const graphData = useMemo(() => {
    const bars = [];
    // We use the Python score as the "Now" point and simulate the rest of the curve
    const currentScore = apiResult.energy_score;

    for (let i = 0; i < numberOfBars; i++) {
      // Simulate the trend: a mix of circadian rhythm and your current score
      const circadian = Math.sin((i / numberOfBars) * Math.PI) * 20;
      const trend = currentScore + circadian - (i > 40 ? (i - 40) * 0.5 : 0);
      bars.push(Math.max(10, trend));
    }
    return bars;
  }, [apiResult]);

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Header - Driven by Python API */}
        <header style={styles.header}>
          <div style={styles.rec}>
            COFFEE REC: <strong>{apiResult.recommendation}</strong>
          </div>
          <h1 style={styles.display}>
            {Math.round(apiResult.energy_score)}%{" "}
            <span style={styles.unit}>ENERGY</span>
          </h1>
        </header>

        {/* The Graph Area */}
        <div style={styles.graphArea}>
          <div style={styles.barContainer}>
            {graphData.map((h, i) => (
              <div
                key={i}
                style={{
                  ...styles.bar,
                  height: `${h}px`,
                  backgroundColor: i > 40 ? "#D1D1D1" : "#B0B0B0",
                }}
              />
            ))}
          </div>
          <div style={styles.indicator} />
        </div>

        {/* Controls - These talk to Python */}
        <section style={styles.controls}>
          <div style={styles.inputRow}>
            <label>Sleep: {sleep}h</label>
            <input
              type="range"
              min="0"
              max="12"
              step="0.5"
              value={sleep}
              onChange={(e) => setSleep(parseFloat(e.target.value))}
            />
          </div>

          <div style={styles.inputRow}>
            <label>Alcohol Units: {alcohol}</label>
            <input
              type="range"
              min="0"
              max="10"
              step="1"
              value={alcohol}
              onChange={(e) => setAlcohol(parseInt(e.target.value))}
            />
          </div>

          <div style={styles.inputRow}>
            <label>Hours Since Meal: {hoursSinceMeal}h</label>
            <input
              type="range"
              min="0"
              max="10"
              step="0.5"
              value={hoursSinceMeal}
              onChange={(e) => setHoursSinceMeal(parseFloat(e.target.value))}
            />
          </div>

          <div style={styles.inputRow}>
            <label>Steps: {steps}</label>
            <input
              type="range"
              min="0"
              max="15000"
              step="500"
              value={steps}
              onChange={(e) => setSteps(parseInt(e.target.value))}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

// --- STYLES ---
const styles = {
  page: {
    backgroundColor: "#F9F7F2",
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    paddingTop: "50px",
    color: "#1a1a1a",
    fontFamily: "sans-serif",
  },
  container: { width: "380px", padding: "20px" },
  display: { fontSize: "72px", margin: "0", letterSpacing: "-3px" },
  unit: { fontSize: "30px", color: "#888", fontWeight: "300" },
  rec: { fontSize: "14px", letterSpacing: "1px", marginBottom: "10px" },
  graphArea: {
    position: "relative",
    height: "220px",
    marginTop: "40px",
    borderBottom: "1px solid #ddd",
  },
  barContainer: {
    display: "flex",
    alignItems: "flex-end",
    gap: "2px",
    height: "200px",
  },
  bar: { flex: 1, transition: "height 0.3s ease" },
  indicator: {
    position: "absolute",
    bottom: 0,
    left: "66%",
    width: "3px",
    height: "230px",
    backgroundColor: "#F26522",
    zIndex: 10,
  },
  controls: {
    marginTop: "40px",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  inputRow: {
    display: "flex",
    flexDirection: "column",
    fontSize: "12px",
    fontWeight: "bold",
    gap: "8px",
  },
};
