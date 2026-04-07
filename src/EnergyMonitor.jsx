import React, { useMemo } from "react";

const EnergyMonitor = ({ caffeineLogs, sleepHours, stepCount }) => {
  const numberOfBars = 60;

  // This calculates the data points for the graph
  const graphData = useMemo(() => {
    const bars = [];

    // Scale sleep: 8 hours = 1.0 (neutral), 4 hours = 0.5 (penalty)
    const sleepMultiplier = Math.min(sleepHours / 8, 1.2);
    // Scale steps: 10k steps = +10% energy boost
    const activityBoost = (stepCount / 10000) * 10;

    for (let i = 0; i < numberOfBars; i++) {
      // 1. Circadian Rhythm (Simple Sine Wave)
      const circadian = Math.sin((i / numberOfBars) * Math.PI) * 40;

      // 2. Caffeine Calculation
      let caffeineEffect = 0;
      caffeineLogs.forEach((log) => {
        const hoursSince = i - log.timeIndex; // log.timeIndex is 0-60
        if (hoursSince > 0) {
          // Half-life decay formula
          caffeineEffect += log.mg * Math.pow(0.5, hoursSince / 10);
        }
      });

      // 3. Final Energy Height
      const totalHeight =
        (60 + circadian + caffeineEffect + activityBoost) * sleepMultiplier;
      bars.push(Math.max(10, totalHeight)); // Ensure bars don't disappear
    }
    return bars;
  }, [caffeineLogs, sleepHours, stepCount]);

  return (
    <div className="dashboard-container">
      <div className="header-section">
        <div className="recommendation">
          STATUS:{" "}
          <strong>
            {graphData[numberOfBars - 1] > 80 ? "OPTIMAL" : "CRASHING"}
          </strong>
        </div>
        <h1 className="main-display">
          {Math.round(graphData[numberOfBars - 1])}%{" "}
          <span className="unit">ENERGY</span>
        </h1>
      </div>

      <div className="graph-area">
        <div className="graph-stats">
          <div>
            Activity{" "}
            <span className="timestamp">
              {stepCount.toLocaleString()} steps
            </span>
          </div>
          <div>Sleep: {sleepHours}h</div>
        </div>

        <div className="graph-bars">
          {graphData.map((height, i) => (
            <div
              key={i}
              className="bar"
              style={{
                height: `${height}px`,
                backgroundColor: i === 40 ? "#F26522" : "#D1D1D1", // Highlights "Now"
              }}
            />
          ))}
        </div>

        {/* The Orange Indicator moves based on current time */}
        <div className="orange-indicator" style={{ left: "66%" }}></div>
      </div>

      <style jsx>{`
        .dashboard-container {
          width: 400px;
          padding: 40px;
          background: #f9f7f2;
        }
        .main-display {
          font-size: 82px;
          letter-spacing: -2px;
        }
        .graph-bars {
          display: flex;
          align-items: flex-end;
          gap: 2.5px;
          height: 200px;
        }
        .bar {
          flex: 1;
          border-radius: 1px;
          transition: height 0.3s ease;
        }
        .orange-indicator {
          position: absolute;
          bottom: 0;
          width: 4px;
          height: 220px;
          background: #f26522;
          z-index: 10;
        }
        .unit {
          font-size: 30px;
          color: #767676;
        }
      `}</style>
    </div>
  );
};

export default EnergyMonitor;
