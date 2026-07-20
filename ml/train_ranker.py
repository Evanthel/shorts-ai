#!/usr/bin/env python3
"""Train the first-party SWAOP multinomial logistic ranker and export JSON weights."""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, log_loss
from sklearn.preprocessing import StandardScaler

CLASSES = ["too_cold", "good", "too_warm"]
GARMENTS = ["shorts", "long_pants", "t_shirt", "long_sleeve", "hoodie", "light_jacket", "rain_jacket", "gloves", "hat"]
FEATURES = [
    "start_temperature_c", "start_feels_like_c", "finish_feels_like_c", "return_feels_like_c",
    "return_delta_c", "wind_kph", "rain_probability", "humidity_percent", "duration_minutes",
    "outdoor_minutes", "comfort_offset_c", "activity_running", "activity_walking", "activity_commute",
    "intensity_easy", "intensity_medium", "intensity_hard", "commute_walking", "commute_transit",
    "commute_bicycle", "commute_car", "can_carry_layer",
    "variant_lighter", "variant_standard", "variant_warmer",
] + [f"item_{item}" for item in GARMENTS]


def feature_row(row):
    weather, finish, returned = row["weather"], row["finishWeather"], row["returnWeather"]
    activity, candidate = row["activity"], row["candidate"]
    if activity["mode"] == "running":
        context = f"running:{activity.get('intensity') or 'medium'}"
    elif activity["mode"] == "commute":
        context = f"commute:{activity.get('commuteMode') or 'walking'}"
    else:
        context = "walking"
    values = {
        "start_temperature_c": weather.get("temperatureC", 0),
        "start_feels_like_c": weather.get("feelsLikeC", 0),
        "finish_feels_like_c": finish.get("feelsLikeC", 0),
        "return_feels_like_c": returned.get("feelsLikeC", 0),
        "return_delta_c": returned.get("feelsLikeC", 0) - weather.get("feelsLikeC", 0),
        "wind_kph": max(weather.get("windKph", 0), returned.get("windKph", 0)),
        "rain_probability": max(weather.get("rainProbabilityPercent", 0), returned.get("rainProbabilityPercent", 0)),
        "humidity_percent": weather.get("humidityPercent", 0),
        "duration_minutes": activity.get("durationMinutes") or 0,
        "outdoor_minutes": activity.get("outdoorMinutes") or 0,
        "comfort_offset_c": row.get("comfortMemory", {}).get(context, {}).get("offsetC", row.get("contextTemperatureOffsetC", 0)),
        "activity_running": int(activity["mode"] == "running"),
        "activity_walking": int(activity["mode"] == "walking"),
        "activity_commute": int(activity["mode"] == "commute"),
        "intensity_easy": int(activity.get("intensity") == "easy"),
        "intensity_medium": int(activity["mode"] == "running" and (activity.get("intensity") or "medium") == "medium"),
        "intensity_hard": int(activity.get("intensity") == "hard"),
        "commute_walking": int(activity.get("commuteMode") == "walking"),
        "commute_transit": int(activity.get("commuteMode") == "transit"),
        "commute_bicycle": int(activity.get("commuteMode") == "bicycle"),
        "commute_car": int(activity.get("commuteMode") == "car"),
        "can_carry_layer": int(bool(activity.get("canCarryLayer"))),
        "variant_lighter": int(candidate["kind"] == "lighter"),
        "variant_standard": int(candidate["kind"] == "standard"),
        "variant_warmer": int(candidate["kind"] == "warmer"),
    }
    items = set(candidate.get("items", []))
    values.update({f"item_{item}": int(item in items) for item in GARMENTS})
    return [float(values[name]) for name in FEATURES]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--model-version", default="swaop-logreg-v1")
    args = parser.parse_args()
    rows = [json.loads(line) for line in args.dataset.read_text().splitlines() if line.strip()]
    rows = [row for row in rows if row["candidate"]["userSelected"] and row["outcome"]["actuallyWorn"] != "no" and row["outcome"]["adjustment"] != "did_not_follow"]
    train = sorted((row for row in rows if row["split"] == "training"), key=lambda row: row["observedAt"])
    evaluation = sorted((row for row in rows if row["split"] == "evaluation"), key=lambda row: row["observedAt"])
    if not train or not evaluation:
        raise SystemExit("Both user-separated training and evaluation rows are required.")

    x_train = np.asarray([feature_row(row) for row in train])
    y_train = np.asarray([row["outcome"]["comfort"] for row in train])
    x_eval = np.asarray([feature_row(row) for row in evaluation])
    y_eval = np.asarray([row["outcome"]["comfort"] for row in evaluation])
    scaler = StandardScaler().fit(x_train)
    model = LogisticRegression(max_iter=2000).fit(scaler.transform(x_train), y_train)
    probabilities = model.predict_proba(scaler.transform(x_eval))
    predictions = model.predict(scaler.transform(x_eval))
    coefficient_by_class = {label: values.tolist() for label, values in zip(model.classes_, model.coef_)}
    intercept_by_class = {label: float(value) for label, value in zip(model.classes_, model.intercept_)}
    if set(coefficient_by_class) != set(CLASSES):
        raise SystemExit("Training data must contain too_cold, good, and too_warm outcomes.")

    artifact = {
        "artifactType": "shortsai-multinomial-logistic-regression",
        "datasetVersion": "swaop-v1",
        "modelVersion": args.model_version,
        "featureSchema": FEATURES,
        "normalization": {name: {"mean": float(scaler.mean_[index]), "scale": float(scaler.scale_[index])} for index, name in enumerate(FEATURES)},
        "classOrder": CLASSES,
        "coefficients": [coefficient_by_class[label] for label in CLASSES],
        "intercepts": [intercept_by_class[label] for label in CLASSES],
        "calibration": {"method": "none"},
        "metrics": {"accuracy": float(accuracy_score(y_eval, predictions)), "logLoss": float(log_loss(y_eval, probabilities, labels=model.classes_)), "trainingRows": len(train), "evaluationRows": len(evaluation)},
        "trainedAt": datetime.now(timezone.utc).isoformat(),
    }
    args.output.write_text(json.dumps(artifact, indent=2) + "\n")


if __name__ == "__main__":
    main()
