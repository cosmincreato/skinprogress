from io import BytesIO
from typing import Dict

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from PIL import Image
from transformers import pipeline

app = FastAPI(title="SkinProgress AI Analyzer", version="0.1.0")

LABELS = ["acne", "skin redness", "bags under the eyes"]
LABEL_KEY_MAP = {
    "acne": "acne",
    "skin redness": "redness",
    "bags under the eyes": "under_eye_bags",
}

classifier = pipeline(
    "zero-shot-image-classification",
    model="openai/clip-vit-base-patch32",
)


def _load_image(upload: UploadFile) -> Image.Image:
    try:
        raw = upload.file.read()
        image = Image.open(BytesIO(raw)).convert("RGB")
        return image
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid image for {upload.filename}") from exc


def _score_image(image: Image.Image) -> Dict[str, float]:
    predictions = classifier(image, candidate_labels=LABELS)

    scores: Dict[str, float] = {"acne": 0.0, "redness": 0.0, "under_eye_bags": 0.0}

    if isinstance(predictions, list):
        for item in predictions:
            if not isinstance(item, dict):
                continue
            label = item.get("label")
            score = item.get("score")
            mapped = LABEL_KEY_MAP.get(label) if isinstance(label, str) else None
            if mapped and isinstance(score, (int, float)):
                scores[mapped] = float(score)
        return scores

    if isinstance(predictions, dict):
        labels = predictions.get("labels")
        raw_scores = predictions.get("scores")
        if isinstance(labels, list) and isinstance(raw_scores, list):
            for label, score in zip(labels, raw_scores):
                mapped = LABEL_KEY_MAP.get(label) if isinstance(label, str) else None
                if mapped and isinstance(score, (int, float)):
                    scores[mapped] = float(score)

    return scores


def _top_label(scores: Dict[str, float]) -> tuple[str, float]:
    best = max(scores.items(), key=lambda item: item[1])
    return best[0], float(best[1])


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze-set")
def analyze_set(
    front: UploadFile = File(...),
    left: UploadFile = File(...),
    right: UploadFile = File(...),
    user_id: str = Form(""),
    date: str = Form(""),
):
    images = {
        "front": _load_image(front),
        "left": _load_image(left),
        "right": _load_image(right),
    }

    per_angle = {}
    overall_scores = {"acne": 0.0, "redness": 0.0, "under_eye_bags": 0.0}

    for angle, image in images.items():
        scores = _score_image(image)
        label, confidence = _top_label(scores)

        per_angle[angle] = {
            "label": label,
            "confidence": confidence,
            "scores": scores,
        }

        for key in overall_scores:
            overall_scores[key] += scores[key]

    for key in overall_scores:
        overall_scores[key] /= len(images)

    overall_label, overall_confidence = _top_label(overall_scores)

    summary = (
        f"Most likely condition trend: {overall_label.replace('_', ' ')} "
        f"({overall_confidence * 100:.1f}% confidence)."
    )

    return {
        "user_id": user_id,
        "date": date,
        "overall_label": overall_label,
        "overall_confidence": overall_confidence,
        "overall_scores": overall_scores,
        "per_angle": per_angle,
        "summary": summary,
        "disclaimer": "AI output is informational only and not a medical diagnosis.",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=8001, reload=True)
