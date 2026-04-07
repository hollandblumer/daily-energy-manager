import { useState, useMemo } from "react";

export default function App() {
  // --- STATE (Your ML Factors) ---
  const [sleep, setSleep] = useState(7);
  const [steps, setSteps] = useState(5000);
  const [caffeineLogs, setCaffeineLogs] = useState([
    { mg: 100, timeIndex: 10 },
  ]);

  // --- LOGIC (The Curve) ---
  const numberOfBars = 60;
  const graphData = useMemo(() => {
    const bars = [];
    const sleepMultiplier = Math.min(sleep / 8, 1.1);

    for (let i = 0; i < numberOfBars; i++) {
      // 1. Natural Circadian Rhythm
      const circadian = Math.sin((i / numberOfBars) * Math.PI) * 30;

      // 2. Caffeine Decay (Half-life)
      let caffeineEffect = 0;
      caffeineLogs.forEach((log) => {
        const hoursSince = i - log.timeIndex;
        if (hoursSince > 0) {
          caffeineEffect += log.mg * Math.pow(0.5, hoursSince / 10);
        }
      });

      // Calculate total height
      const h =
        (50 + circadian + caffeineEffect + steps / 200) * sleepMultiplier;
      bars.push(Math.max(5, h)); // Minimum 5px height
    }
    return bars;
  }, [sleep, steps, caffeineLogs]);

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Header */}
        <header style={styles.header}>
          <div style={styles.rec}>
            COFFEE REC: <strong>{graphData[40] > 90 ? "WAIT" : "YES"}</strong>
          </div>
          <h1 style={styles.display}>
            {Math.round(graphData[40])}% <span style={styles.unit}>ENERGY</span>
          </h1>
        </header>

        {/* The Graph Area (The Curve) */}
        <div style={styles.graphArea}>
          <div style={styles.barContainer}>
            {graphData.map((h, i) => (
              <div
                key={i}
                style={{
                  ...styles.bar,
                  height: `${h}px`,
                  backgroundColor: i > 40 ? "#D1D1D1" : "#B0B0B0", // Future vs Past
                }}
              />
            ))}
          </div>
          {/* The Orange "Now" Line */}
          <div style={styles.indicator} />
        </div>

        {/* Controls */}
        <section style={styles.controls}>
          <div style={styles.inputRow}>
            <label>Sleep: {sleep}h</label>
            <input
              type="range"
              min="0"
              max="12"
              step="0.5"
              value={sleep}
              onChange={(e) => setSleep(e.target.value)}
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
              onChange={(e) => setSteps(e.target.value)}
            />
          </div>
          <button
            style={styles.btn}
            onClick={() =>
              setCaffeineLogs([...caffeineLogs, { mg: 80, timeIndex: 40 }])
            }
          >
            + Log 80mg Caffeine
          </button>
        </section>
      </div>
    </div>
  );
}

// --- STYLES (New Yorker / Minimalist) ---
const styles = {
  page: {
    backgroundColor: "#F9F7F2",
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center", // Centers the app horizontally
    alignItems: "flex-start", // Starts it from the top
    paddingTop: "50px",
    color: "#1a1a1a",
    fontFamily: "sans-serif",
  },
  container: {
    width: "380px", // Forces it to stay mobile-sized/small
    padding: "20px",
  },
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
  bar: {
    flex: 1,
    transition: "height 0.3s ease",
  },
  indicator: {
    position: "absolute",
    bottom: 0,
    left: "66%", // Represents "Now"
    width: "3px",
    height: "230px",
    backgroundColor: "#F26522",
    zIndex: 10,
  },
  controls: {
    marginTop: "40px",
    display: "flex",
    flexDirection: "column",
    gap: "15px",
  },
  inputRow: {
    display: "flex",
    flexDirection: "column",
    fontSize: "12px",
    fontWeight: "bold",
  },
  btn: {
    background: "#000",
    color: "#fff",
    border: "none",
    padding: "12px",
    cursor: "pointer",
    fontWeight: "bold",
  },
};
