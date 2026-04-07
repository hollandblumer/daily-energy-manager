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

function getInitialCurrentHour() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    timeZone: "America/New_York",
  });
  const parts = formatter.formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 13);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 30);
  return Math.round((hour + minute / 60) * 100) / 100;
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

const initialPayload = {
  sleep_hrs: 7,
  alcohol_units: 0,
  caffeine_mg: 100,
  hours_since_caffeine: 2,
  hours_since_meal: 3,
  current_time_24h: getInitialCurrentHour(),
  target_bedtime_24h: 23,
  jet_lag_hours: 0,
  forecast_hours: 23,
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
  const peakPoint = useMemo(() => {
    if (!graphData.length) {
      return null;
    }
    return graphData.reduce((best, point) =>
      point.energy_score > best.energy_score ? point : best,
    );
  }, [graphData]);
  const indicatorLeft = useMemo(() => {
    if (!peakPoint || graphData.length <= 1) {
      return "65%";
    }
    return `${(peakPoint.time_24h / 23) * 100}%`;
  }, [graphData, peakPoint]);
  const lastDoseLabel = useMemo(() => {
    const lastDoseTime =
      (form.current_time_24h - form.hours_since_caffeine + 24) % 24;
    return formatHour(lastDoseTime);
  }, [form.current_time_24h, form.hours_since_caffeine]);

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
          <div style={styles.rec}>
            COFFEE REC: <strong>{apiResult.recommendation}</strong>
          </div>
          <div style={styles.display}>
            {Math.round(apiResult.energy_score)}%{" "}
            <span style={styles.unit}>OPTIMAL</span>
          </div>
          <div style={styles.subhead}>
            Active caffeine {apiResult.active_caffeine_mg}mg · Bedtime in{" "}
            {apiResult.hours_to_bed}h
          </div>
        </header>

        <section style={styles.graphCard}>
          <div style={styles.graphStats}>
            <div>
              Last Dose <span style={styles.timestamp}>{lastDoseLabel}</span>
            </div>
            <div>
              Peak: <span style={styles.timestamp}>{peakPoint?.label ?? "--"}</span>
            </div>
          </div>
          <div style={styles.graphArea}>
            <div style={styles.graphBars}>
              {graphData.map((point) => (
                <div
                  key={point.hour_offset}
                  style={{
                    ...styles.bar,
                    height: `${Math.max(34, point.energy_score * 1.55)}px`,
                  }}
                />
              ))}
            </div>
            <div style={{ ...styles.orangeIndicator, left: indicatorLeft }}>
              <div style={styles.orangeDot} />
              <div style={styles.orangeLabel}>{peakPoint?.label ?? "Peak"}</div>
            </div>
          </div>
          <div style={styles.axisRow}>
            {graphData.map((point) => (
              <div key={point.hour_offset} style={styles.axisLabel}>
                {point.label}
              </div>
            ))}
          </div>
        </section>

        <section style={styles.controls}>
          <div style={styles.sectionTitle}>Inputs</div>
          <div style={styles.inputGrid}>
            <div style={styles.inputRow}>
              <label>Sleep: {form.sleep_hrs}h</label>
              <input
                style={styles.slider}
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
                style={styles.slider}
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
                style={styles.slider}
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
                style={styles.slider}
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
                style={styles.slider}
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
                style={styles.slider}
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
                style={styles.slider}
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
                style={styles.slider}
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
    backgroundColor: "#F9F7F2",
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    padding: "32px 16px 48px",
    color: "#1f1a16",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  container: {
    width: "min(400px, 100%)",
    display: "flex",
    flexDirection: "column",
    gap: "22px",
  },
  header: {
    paddingTop: "8px",
  },
  headerTopline: {
    textTransform: "uppercase",
    letterSpacing: "1.4px",
    fontSize: "12px",
    color: "#767676",
    marginBottom: "18px",
  },
  rec: { fontSize: "22px", fontWeight: 400, marginBottom: "15px", letterSpacing: "0.5px" },
  display: { fontSize: "82px", margin: "0", letterSpacing: "-2px", lineHeight: 1, fontWeight: 400 },
  unit: { fontSize: "64px", fontWeight: 400 },
  subhead: { marginTop: "14px", color: "#767676", fontSize: "16px" },
  controls: {
    backgroundColor: "rgba(255,255,255,0.55)",
    padding: "18px",
    border: "1px solid rgba(0, 0, 0, 0.05)",
  },
  sectionTitle: {
    fontSize: "14px",
    textTransform: "uppercase",
    letterSpacing: "1.2px",
    marginBottom: "16px",
    color: "#767676",
  },
  inputGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: "14px",
  },
  inputRow: {
    display: "flex",
    flexDirection: "column",
    fontSize: "12px",
    fontWeight: 700,
    gap: "8px",
  },
  graphCard: {
    color: "#1a1a1a",
  },
  graphStats: {
    marginBottom: "20px",
    fontSize: "19px",
    color: "#767676",
  },
  timestamp: { fontWeight: 700, color: "#444" },
  graphArea: {
    width: "100%",
    height: "250px",
    position: "relative",
    marginTop: "20px",
    overflow: "visible",
  },
  graphBars: {
    display: "flex",
    alignItems: "flex-end",
    gap: "1px",
    width: "100%",
    height: "160px",
    position: "absolute",
    bottom: 22,
    left: 0,
    right: 0,
  },
  bar: {
    flex: 1,
    backgroundColor: "#D1D1D1",
  },
  orangeIndicator: {
    position: "absolute",
    bottom: 22,
    width: "4px",
    height: "194px",
    backgroundColor: "#F26522",
    zIndex: 10,
    transform: "translateX(-50%)",
  },
  orangeDot: {
    position: "absolute",
    top: "-5px",
    left: "50%",
    transform: "translateX(-50%)",
    width: "12px",
    height: "12px",
    backgroundColor: "#F26522",
    borderRadius: "50%",
  },
  orangeLabel: {
    position: "absolute",
    top: "-30px",
    left: "50%",
    transform: "translateX(-50%)",
    fontSize: "11px",
    fontWeight: 700,
    color: "#F26522",
    whiteSpace: "nowrap",
  },
  axisRow: {
    display: "grid",
    gridTemplateColumns: "repeat(24, minmax(0, 1fr))",
    gap: "1px",
    marginTop: "4px",
  },
  axisLabel: {
    fontSize: "8px",
    color: "#767676",
    textAlign: "center",
    whiteSpace: "nowrap",
    overflow: "hidden",
  },
  metrics: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: "14px",
  },
  metricCard: {
    backgroundColor: "rgba(255,255,255,0.55)",
    padding: "18px",
    border: "1px solid rgba(0, 0, 0, 0.05)",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  metricLabel: {
    fontSize: "12px",
    color: "#767676",
    textTransform: "uppercase",
    letterSpacing: "0.8px",
  },
  slider: {
    width: "100%",
    accentColor: "#F26522",
  },
};
