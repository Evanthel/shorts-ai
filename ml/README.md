# SWAOP ranker

This directory contains the first-party training pipeline for the ShortsAI Weather–Activity–Outfit Preference Dataset (SWAOP). It does not download or ingest external data.

Export authenticated outcomes with `npm run dataset:export -- ./swaop.jsonl`, then install `ml/requirements.txt` in an isolated Python environment and run:

```sh
python ml/train_ranker.py swaop.jsonl ranker.json
```

The export removes email, location labels, raw AI questions, guest data, and rows where the recommendation was not followed. A pseudonymous user belongs wholly to either training or evaluation; training rows precede the chronological cutoff and evaluation rows follow it. Production validates the JSON artifact and remains rule-ranked until every activation gate is met.
