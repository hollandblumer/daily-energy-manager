import { useEffect, useMemo, useState } from "react";

function activeCaffeine(amountMg, hoursSinceCaffeine) {
  if (hoursSinceCaffeine < 0) {
    return 0;
  }
  if (hoursSinceCaffeine < 0.75) {
    return amountMg * (hoursSinceCaffeine / 0.75);
  }
  return amountMg * 0.5 ** ((hoursSinceCaffeine - 0.75) / 5);
}

function hoursToBed(currentTime24h, targetBedtime24h) {
  let delta = targetBedtime24h - currentTime24h;
  if (delta < -12) {
    delta += 24;
  }
  return delta;
}

function getRecommendation(energyScore, bedtimeDelta, currentActiveCaffeine, mealGap) {
  if (energyScore < 25 || bedtimeDelta <= 1) {
    return "SLEEP";
  }
  if (energyScore < 40 && bedtimeDelta <= 3) {
    return "WIND DOWN";
  }
  if (bedtimeDelta < 8) {
    return "SKIP COFFEE";
  }
  if (currentActiveCaffeine > 200) {
    return "HOLD OFF";
  }
  if (mealGap < 1) {
    return "WAIT A BIT";
  }
  if (energyScore > 85) {
    return "NO";
  }
  return "YES";
}

function calculateEnergy(payload, currentTime24h, mealGap, caffeineGap) {
  const sleepPenalty = Math.max(0, (7.5 - payload.sleep_hrs) * 10);
  const alcoholPenalty = payload.alcohol_units * 5;
  const jetLagPenalty = Math.abs(payload.jet_lag_hours) * 5;
  const baseScore = 100 - sleepPenalty - alcoholPenalty - jetLagPenalty;
  const currentActiveCaffeine = activeCaffeine(payload.caffeine_mg, caffeineGap);
  const caffeineBoost = Math.min(currentActiveCaffeine * 0.2, 30);
  const foodComa = mealGap > 0 && mealGap < 1.5 ? 10 : 0;
  const circadianDip = currentTime24h >= 14 && currentTime24h <= 16 ? 15 : 0;
  const bedtimeDelta = hoursToBed(currentTime24h, payload.target_bedtime_24h);

  let bedtimePenalty = 0;
  if (bedtimeDelta >= 0 && bedtimeDelta < 12) {
    bedtimePenalty = (12 - bedtimeDelta) * 3;
  } else if (bedtimeDelta < 0) {
    bedtimePenalty = 40;
  }

  const finalScore = Math.max(
    0,
    Math.min(
      100,
      baseScore + caffeineBoost - foodComa - circadianDip - bedtimePenalty,
    ),
  );

  return {
    energy_score: Math.round(finalScore * 10) / 10,
    active_caffeine_mg: Math.round(currentActiveCaffeine * 10) / 10,
    hours_to_bed: Math.round(bedtimeDelta * 10) / 10,
    recommendation: getRecommendation(
      finalScore,
      bedtimeDelta,
      currentActiveCaffeine,
      mealGap,
    ),
    breakdown: {
      base: Math.round(baseScore * 10) / 10,
      sleep_penalty: Math.round(sleepPenalty * 10) / 10,
      alcohol_penalty: Math.round(alcoholPenalty * 10) / 10,
      jet_lag_penalty: Math.round(jetLagPenalty * 10) / 10,
      boost: Math.round(caffeineBoost * 10) / 10,
      food_coma: foodComa,
      circadian_dip: circadianDip,
      bedtime_penalty: Math.round(bedtimePenalty * 10) / 10,
    },
  };
}

function formatHour(hour24h) {
  const hour = Math.floor(hour24h) % 24;
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelveHour = hour % 12 || 12;
  return `${twelveHour}${suffix}`;
}

function buildFallbackForecast(payload) {
  return Array.from({ length: payload.forecast_hours + 1 }, (_, hourOffset) => {
    const time24h = (payload.current_time_24h + hourOffset) % 24;
    const snapshot = calculateEnergy(
      payload,
      time24h,
      payload.hours_since_meal + hourOffset,
      payload.hours_since_caffeine + hourOffset,
    );

    return {
      hour_offset: hourOffset,
      time_24h: Math.round(time24h * 100) / 100,
      label: formatHour(time24h),
      energy_score: snapshot.energy_score,
    };
  });
}

function buildFallbackResult(payload) {
  const current = calculateEnergy(
    payload,
    payload.current_time_24h,
    payload.hours_since_meal,
    payload.hours_since_caffeine,
  );
  return {
    ...current,
    forecast: buildFallbackForecast(payload),
    inputs: payload,
  };
}

function getCurvePoint(point, index, total) {
  const width = 1000;
  const height = 260;
  const leftPad = 28;
  const rightPad = 28;
  const topPad = 18;
  const bottomPad = 26;
  const usableWidth = width - leftPad - rightPad;
  const usableHeight = height - topPad - bottomPad;
  const x =
    total <= 1 ? width / 2 : leftPad + (index / (total - 1)) * usableWidth;
  const y = topPad + ((100 - point.energy_score) / 100) * usableHeight;
  return { x, y };
}

function buildCurvePath(points) {
  if (!points.length) {
    return "";
  }
  return points
    .map((point, index) => {
      const { x, y } = getCurvePoint(point, index, points.length);
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

function buildAreaPath(points) {
  if (!points.length) {
    return "";
  }
  const height = 260;
  const bottomPad = 26;
  const first = getCurvePoint(points[0], 0, points.length);
  const last = getCurvePoint(points.at(-1), points.length - 1, points.length);
  return `${buildCurvePath(points)} L ${last.x} ${height - bottomPad} L ${first.x} ${height - bottomPad} Z`;
}

const initialPayload = {
  sleep_hrs: 7,
  alcohol_units: 0,
  caffeine_mg: 100,
  hours_since_caffeine: 2,
  hours_since_meal: 3,
  current_time_24h: 13.5,
  target_bedtime_24h: 23,
  jet_lag_hours: 0,
  forecast_hours: 12,
};

export default function App() {
  const [form, setForm] = useState(initialPayload);
  const [apiResult, setApiResult] = useState(() => buildFallbackResult(initialPayload));

  useEffect(() => {
    const apiBaseUrl =
      import.meta.env.VITE_API_BASE_URL ||
      (window.location.hostname === "localhost" ? "http://127.0.0.1:8000" : "");

    const updateFromApi = async () => {
      if (!apiBaseUrl) {
        setApiResult(buildFallbackResult(form));
        return;
      }

      try {
        const response = await fetch(`${apiBaseUrl}/predict`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });

        if (!response.ok) {
          throw new Error(`API request failed with ${response.status}`);
        }

        setApiResult(await response.json());
      } catch {
        setApiResult(buildFallbackResult(form));
      }
    };

    updateFromApi();
  }, [form]);

  const graphData = useMemo(() => apiResult.forecast ?? [], [apiResult.forecast]);
  const curvePath = useMemo(() => buildCurvePath(graphData), [graphData]);
  const areaPath = useMemo(() => buildAreaPath(graphData), [graphData]);

  const updateField = (field, parser = parseFloat) => (event) => {
    setForm((current) => ({
      ...current,
      [field]: parser(event.target.value),
    }));
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <div style={styles.headerTopline}>Daily Energy Manager</div>
          <div style={styles.heroRow}>
            <div>
              <h1 style={styles.title}>Daily Energy Manager</h1>
              <div style={styles.rec}>
                COFFEE REC: <strong>{apiResult.recommendation}</strong>
              </div>
              <div style={styles.display}>
                {Math.round(apiResult.energy_score)}%{" "}
                <span style={styles.unit}>ENERGY</span>
              </div>
              <div style={styles.subhead}>
                Active caffeine {apiResult.active_caffeine_mg}mg · Bedtime in{" "}
                {apiResult.hours_to_bed}h
              </div>
            </div>
            <div style={styles.scorePanel}>
              <div style={styles.scoreCaption}>Live status</div>
              <div style={styles.scoreDial}>{Math.round(apiResult.energy_score)}</div>
              <div style={styles.scoreCaption}>forecast-driven</div>
            </div>
          </div>
        </header>

        <section style={styles.controls}>
          <div style={styles.sectionTitle}>Inputs</div>
          <div style={styles.inputGrid}>
            <div style={styles.inputRow}>
              <label>Sleep: {form.sleep_hrs}h</label>
              <input
                type="range"
                min="0"
                max="12"
                step="0.5"
                value={form.sleep_hrs}
                onChange={updateField("sleep_hrs")}
              />
            </div>
            <div style={styles.inputRow}>
              <label>Alcohol: {form.alcohol_units}</label>
              <input
                type="range"
                min="0"
                max="10"
                step="1"
                value={form.alcohol_units}
                onChange={updateField("alcohol_units", Number)}
              />
            </div>
            <div style={styles.inputRow}>
              <label>Caffeine: {form.caffeine_mg}mg</label>
              <input
                type="range"
                min="0"
                max="400"
                step="25"
                value={form.caffeine_mg}
                onChange={updateField("caffeine_mg")}
              />
            </div>
            <div style={styles.inputRow}>
              <label>Since caffeine: {form.hours_since_caffeine}h</label>
              <input
                type="range"
                min="0"
                max="12"
                step="0.25"
                value={form.hours_since_caffeine}
                onChange={updateField("hours_since_caffeine")}
              />
            </div>
            <div style={styles.inputRow}>
              <label>Since meal: {form.hours_since_meal}h</label>
              <input
                type="range"
                min="0"
                max="12"
                step="0.25"
                value={form.hours_since_meal}
                onChange={updateField("hours_since_meal")}
              />
            </div>
            <div style={styles.inputRow}>
              <label>Current time: {form.current_time_24h}h</label>
              <input
                type="range"
                min="0"
                max="23.5"
                step="0.5"
                value={form.current_time_24h}
                onChange={updateField("current_time_24h")}
              />
            </div>
            <div style={styles.inputRow}>
              <label>Bedtime: {form.target_bedtime_24h}h</label>
              <input
                type="range"
                min="0"
                max="23.5"
                step="0.5"
                value={form.target_bedtime_24h}
                onChange={updateField("target_bedtime_24h")}
              />
            </div>
            <div style={styles.inputRow}>
              <label>Jet lag: {form.jet_lag_hours}h</label>
              <input
                type="range"
                min="-12"
                max="12"
                step="1"
                value={form.jet_lag_hours}
                onChange={updateField("jet_lag_hours", Number)}
              />
            </div>
          </div>
        </section>

        <section style={styles.graphCard}>
          <div style={styles.graphHeader}>
            <span>Energy curve</span>
            <span>Next {form.forecast_hours} hours</span>
          </div>
          <div style={styles.graphArea}>
            <svg viewBox="0 0 1000 260" preserveAspectRatio="none" style={styles.svg}>
              <defs>
                <linearGradient id="energyArea" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#ff8a3d" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#ff8a3d" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              {[20, 40, 60, 80].map((level) => {
                const y = 18 + ((100 - level) / 100) * (260 - 18 - 26);
                return (
                  <line
                    key={level}
                    x1="28"
                    x2="972"
                    y1={y}
                    y2={y}
                    stroke="rgba(255,255,255,0.08)"
                    strokeDasharray="4 8"
                  />
                );
              })}
              <path d={areaPath} fill="url(#energyArea)" />
              <path
                d={curvePath}
                fill="none"
                stroke="#ff8a3d"
                strokeWidth="8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {graphData.map((point, index) => {
                const { x, y } = getCurvePoint(point, index, graphData.length);
                return (
                  <g key={point.hour_offset}>
                    <circle
                      cx={x}
                      cy={y}
                      r={index === 0 ? 9 : 5}
                      fill={index === 0 ? "#fff4dd" : "#ffc387"}
                      stroke="#ff8a3d"
                      strokeWidth={index === 0 ? 4 : 2}
                    />
                  </g>
                );
              })}
              <line
                x1="28"
                x2="972"
                y1="234"
                y2="234"
                stroke="rgba(255,255,255,0.25)"
                strokeWidth="2"
              />
            </svg>
          </div>
          <div style={styles.axisTitle}>Time</div>
          <div style={styles.axisRow}>
            {graphData.map((point) => (
              <div key={point.hour_offset} style={styles.axisLabel}>
                <strong>{point.label}</strong>
                <span>{Math.round(point.energy_score)} energy</span>
              </div>
            ))}
          </div>
        </section>

        <section style={styles.metrics}>
          <div style={styles.metricCard}>
            <span style={styles.metricLabel}>Base</span>
            <strong>{apiResult.breakdown.base}</strong>
          </div>
          <div style={styles.metricCard}>
            <span style={styles.metricLabel}>Boost</span>
            <strong>+{apiResult.breakdown.boost}</strong>
          </div>
          <div style={styles.metricCard}>
            <span style={styles.metricLabel}>Bedtime hit</span>
            <strong>-{apiResult.breakdown.bedtime_penalty}</strong>
          </div>
          <div style={styles.metricCard}>
            <span style={styles.metricLabel}>Circadian dip</span>
            <strong>-{apiResult.breakdown.circadian_dip}</strong>
          </div>
        </section>
      </div>
    </div>
  );
}

const styles = {
  page: {
    background:
      "radial-gradient(circle at top, #fff4e6 0%, #f6f0e8 45%, #ece5db 100%)",
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    padding: "32px 16px 48px",
    color: "#1f1a16",
    fontFamily: "system-ui, sans-serif",
  },
  container: {
    width: "min(960px, 100%)",
    display: "flex",
    flexDirection: "column",
    gap: "24px",
  },
  header: {
    background:
      "linear-gradient(135deg, rgba(255, 247, 235, 0.98) 0%, rgba(255, 234, 204, 0.92) 100%)",
    borderRadius: "30px",
    padding: "28px",
    border: "1px solid rgba(60, 40, 20, 0.08)",
    boxShadow: "0 20px 50px rgba(75, 45, 20, 0.08)",
  },
  headerTopline: {
    textTransform: "uppercase",
    letterSpacing: "1.4px",
    fontSize: "12px",
    color: "#9a6d43",
    marginBottom: "14px",
  },
  heroRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "24px",
    alignItems: "center",
    flexWrap: "wrap",
  },
  title: {
    margin: "0 0 10px",
    fontSize: "clamp(34px, 6vw, 56px)",
    lineHeight: 0.95,
    letterSpacing: "-2px",
  },
  rec: { fontSize: "13px", letterSpacing: "1.2px", marginBottom: "8px" },
  display: { fontSize: "72px", margin: "0", letterSpacing: "-4px", lineHeight: 1 },
  unit: { fontSize: "30px", color: "#7d6d5c", fontWeight: 400 },
  subhead: { marginTop: "10px", color: "#6c5b4c", fontSize: "15px" },
  scorePanel: {
    minWidth: "160px",
    padding: "18px 20px",
    borderRadius: "24px",
    background: "#201a17",
    color: "#fff2e2",
    textAlign: "center",
  },
  scoreDial: {
    fontSize: "56px",
    lineHeight: 1,
    fontWeight: 700,
    margin: "8px 0",
  },
  scoreCaption: {
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "1px",
    color: "#d4bca8",
  },
  controls: {
    background:
      "linear-gradient(180deg, rgba(255, 251, 246, 0.95) 0%, rgba(246, 237, 226, 0.92) 100%)",
    borderRadius: "30px",
    padding: "24px",
    border: "1px solid rgba(60, 40, 20, 0.08)",
  },
  sectionTitle: {
    fontSize: "14px",
    textTransform: "uppercase",
    letterSpacing: "1.2px",
    marginBottom: "16px",
    color: "#8c6340",
  },
  inputGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "18px 20px",
  },
  inputRow: {
    display: "flex",
    flexDirection: "column",
    fontSize: "13px",
    fontWeight: 700,
    gap: "8px",
  },
  graphCard: {
    background:
      "radial-gradient(circle at top left, #3b2d24 0%, #201a17 55%, #15100e 100%)",
    color: "#f7efe6",
    borderRadius: "28px",
    padding: "22px 22px 18px",
    boxShadow: "0 24px 60px rgba(29, 18, 10, 0.24)",
  },
  graphHeader: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "14px",
    marginBottom: "18px",
    color: "#d7c4b1",
  },
  graphArea: {
    minHeight: "280px",
    display: "flex",
    alignItems: "flex-end",
  },
  svg: {
    width: "100%",
    height: "280px",
  },
  axisRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(56px, 1fr))",
    gap: "8px",
    marginTop: "8px",
  },
  axisTitle: {
    marginTop: "4px",
    fontSize: "12px",
    letterSpacing: "1px",
    textTransform: "uppercase",
    color: "#d7c4b1",
  },
  axisLabel: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "3px",
    fontSize: "11px",
    color: "#b59f8a",
  },
  metrics: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: "14px",
  },
  metricCard: {
    backgroundColor: "rgba(255, 251, 246, 0.88)",
    borderRadius: "18px",
    padding: "18px",
    border: "1px solid rgba(60, 40, 20, 0.08)",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  metricLabel: {
    fontSize: "12px",
    color: "#7d6d5c",
    textTransform: "uppercase",
    letterSpacing: "0.8px",
  },
};
