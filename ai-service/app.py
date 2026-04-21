import base64
from io import BytesIO
from typing import Dict

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from PIL import Image
from transformers import pipeline

app = FastAPI(title="SkinProgress AI Analyzer", version="0.2.0")

LABELS = ["acne", "skin redness", "bags under the eyes"]
LABEL_KEY_MAP = {
    "acne": "acne",
    "skin redness": "redness",
    "bags under the eyes": "under_eye_bags",
}
KEY_LABEL_MAP = {value: key for key, value in LABEL_KEY_MAP.items()}

HEATMAP_GRID_SIZE = 7
HEATMAP_PATCH_RATIO = 0.18
HEATMAP_ALPHA_MAX = 170
HEATMAP_NEGATIVE_LABEL = "clear healthy skin"
FACE_EXPAND_X = 0.25
FACE_EXPAND_Y_TOP = 0.35
FACE_EXPAND_Y_BOTTOM = 0.45

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
        raise HTTPException(
            status_code=400,
            detail=f"Invalid image for {upload.filename}",
        ) from exc


def _predict_scores(image: Image.Image, candidate_labels: list[str]) -> Dict[str, float]:
    predictions = classifier(image, candidate_labels=candidate_labels)

    scores: Dict[str, float] = {label: 0.0 for label in candidate_labels}

    if isinstance(predictions, list):
        for item in predictions:
            if not isinstance(item, dict):
                continue
            label = item.get("label")
            score = item.get("score")
            if isinstance(label, str) and isinstance(score, (int, float)) and label in scores:
                scores[label] = float(score)
        return scores

    if isinstance(predictions, dict):
        labels = predictions.get("labels")
        raw_scores = predictions.get("scores")
        if isinstance(labels, list) and isinstance(raw_scores, list):
            for label, score in zip(labels, raw_scores):
                if isinstance(label, str) and isinstance(score, (int, float)) and label in scores:
                    scores[label] = float(score)

    return scores


def _score_image(image: Image.Image) -> Dict[str, float]:
    raw_scores = _predict_scores(image, LABELS)
    return {
        "acne": raw_scores.get("acne", 0.0),
        "redness": raw_scores.get("skin redness", 0.0),
        "under_eye_bags": raw_scores.get("bags under the eyes", 0.0),
    }


def _top_label(scores: Dict[str, float]) -> tuple[str, float]:
    best = max(scores.items(), key=lambda item: item[1])
    return best[0], float(best[1])


def _to_png_data_url(image: Image.Image) -> str:
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{encoded}"


def _build_heatmap_overlay(
    image: Image.Image,
    condition_key: str,
    grid_size: int = HEATMAP_GRID_SIZE,
) -> str | None:
    target_label = KEY_LABEL_MAP.get(condition_key)
    if not target_label:
        return None

    image_width, image_height = image.size
    if image_width < 8 or image_height < 8:
        return None

    focus_left, focus_top, focus_right, focus_bottom = _get_face_focus_bounds(
        image_width,
        image_height,
        image,
    )

    focus_width = max(1, focus_right - focus_left)
    focus_height = max(1, focus_bottom - focus_top)

    patch_width = max(18, int(focus_width * HEATMAP_PATCH_RATIO))
    patch_height = max(18, int(focus_height * HEATMAP_PATCH_RATIO))

    effective_grid_size = max(6, min(grid_size + 1, 8))

    x_centers = np.linspace(focus_left, focus_right - 1, effective_grid_size)
    y_centers = np.linspace(focus_top, focus_bottom - 1, effective_grid_size)

    heatmap_sum = np.zeros((image_height, image_width), dtype=np.float32)
    heatmap_weight = np.zeros((image_height, image_width), dtype=np.float32)

    candidate_labels = [target_label, HEATMAP_NEGATIVE_LABEL]

    for center_y in y_centers:
        for center_x in x_centers:
            left = int(round(center_x - patch_width / 2))
            top = int(round(center_y - patch_height / 2))
            right = left + patch_width
            bottom = top + patch_height

            if left < 0:
                right -= left
                left = 0
            if top < 0:
                bottom -= top
                top = 0
            if right > image_width:
                left -= right - image_width
                right = image_width
            if bottom > image_height:
                top -= bottom - image_height
                bottom = image_height

            left = max(0, left)
            top = max(0, top)

            patch = image.crop((left, top, right, bottom))
            patch_scores = _predict_scores(patch, candidate_labels)
            target_score = float(patch_scores.get(target_label, 0.0))
            heatmap_sum[top:bottom, left:right] += target_score
            heatmap_weight[top:bottom, left:right] += 1.0

    raw_heatmap = np.divide(
        heatmap_sum,
        np.maximum(heatmap_weight, 1e-6),
        out=np.zeros_like(heatmap_sum),
        where=heatmap_weight > 0,
    )

    blur_kernel = max(11, (min(image_width, image_height) // 35) | 1)
    raw_heatmap = cv2.GaussianBlur(raw_heatmap, (blur_kernel, blur_kernel), sigmaX=0)

    active_values = raw_heatmap[heatmap_weight > 0]
    if active_values.size == 0:
        return None

    lower = float(np.percentile(active_values, 35))
    upper = float(np.percentile(active_values, 95))
    if upper - lower < 1e-8:
        normalized = np.zeros_like(raw_heatmap, dtype=np.float32)
    else:
        normalized = (raw_heatmap - lower) / (upper - lower)
        normalized = np.clip(normalized, 0.0, 1.0)

    face_mask = _build_face_focus_mask(image_width, image_height, image)
    skin_mask = _build_skin_mask(image)
    combined_mask = np.clip(face_mask * skin_mask, 0.0, 1.0)

    alpha_array = normalized * combined_mask * HEATMAP_ALPHA_MAX

    alpha_channel = alpha_array.astype(np.uint8)

    overlay_rgba = np.zeros((image_height, image_width, 4), dtype=np.uint8)
    overlay_rgba[..., 0] = 239
    overlay_rgba[..., 1] = 68
    overlay_rgba[..., 2] = 68
    overlay_rgba[..., 3] = alpha_channel

    overlay_image = Image.fromarray(overlay_rgba, mode="RGBA")
    composite = Image.alpha_composite(image.convert("RGBA"), overlay_image)

    return _to_png_data_url(composite)


def _detect_face_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    image_rgb = np.array(image)
    image_gray = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2GRAY)

    face_cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml",
    )
    faces = face_cascade.detectMultiScale(
        image_gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(48, 48),
    )

    if faces is None or len(faces) == 0:
        return None

    largest = max(faces, key=lambda item: item[2] * item[3])
    x, y, w, h = [int(value) for value in largest]
    return x, y, w, h


def _build_face_focus_mask(
    image_width: int,
    image_height: int,
    image: Image.Image,
) -> np.ndarray:
    mask = np.zeros((image_height, image_width), dtype=np.float32)

    bbox = _detect_face_bbox(image)
    if bbox is not None:
        x, y, w, h = bbox
        left = max(0, int(x - w * FACE_EXPAND_X))
        right = min(image_width, int(x + w + w * FACE_EXPAND_X))
        top = max(0, int(y - h * FACE_EXPAND_Y_TOP))
        bottom = min(image_height, int(y + h + h * FACE_EXPAND_Y_BOTTOM))
        mask[top:bottom, left:right] = 1.0
    else:
        center_x = image_width // 2
        center_y = int(image_height * 0.42)
        radius_x = int(image_width * 0.22)
        radius_y = int(image_height * 0.30)

        y_indices, x_indices = np.ogrid[:image_height, :image_width]
        ellipse = (
            ((x_indices - center_x) ** 2) / max(radius_x**2, 1)
            + ((y_indices - center_y) ** 2) / max(radius_y**2, 1)
        ) <= 1.0
        mask[ellipse] = 1.0

    blur_kernel = max(21, (min(image_width, image_height) // 20) | 1)
    mask = cv2.GaussianBlur(mask, (blur_kernel, blur_kernel), sigmaX=0)
    return np.clip(mask, 0.0, 1.0)


def _get_face_focus_bounds(
    image_width: int,
    image_height: int,
    image: Image.Image,
) -> tuple[int, int, int, int]:
    bbox = _detect_face_bbox(image)
    if bbox is not None:
        x, y, w, h = bbox
        left = max(0, int(x - w * FACE_EXPAND_X))
        right = min(image_width, int(x + w + w * FACE_EXPAND_X))
        top = max(0, int(y - h * FACE_EXPAND_Y_TOP))
        bottom = min(image_height, int(y + h + h * FACE_EXPAND_Y_BOTTOM))
        return left, top, right, bottom

    center_x = image_width // 2
    center_y = int(image_height * 0.42)
    radius_x = int(image_width * 0.22)
    radius_y = int(image_height * 0.30)
    left = max(0, center_x - radius_x)
    right = min(image_width, center_x + radius_x)
    top = max(0, center_y - radius_y)
    bottom = min(image_height, center_y + radius_y)
    return left, top, right, bottom


def _build_skin_mask(image: Image.Image) -> np.ndarray:
    image_rgb = np.array(image)
    image_ycrcb = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2YCrCb)

    y_channel = image_ycrcb[:, :, 0]
    cr_channel = image_ycrcb[:, :, 1]
    cb_channel = image_ycrcb[:, :, 2]

    skin_mask = (
        (y_channel > 35)
        & (cr_channel > 125)
        & (cr_channel < 180)
        & (cb_channel > 75)
        & (cb_channel < 140)
    ).astype(np.float32)

    blur_kernel = max(9, (min(image.width, image.height) // 55) | 1)
    skin_mask = cv2.GaussianBlur(skin_mask, (blur_kernel, blur_kernel), sigmaX=0)
    return np.clip(skin_mask, 0.0, 1.0)


def _safe_build_heatmap_overlay(image: Image.Image, condition_key: str) -> str | None:
    try:
        return _build_heatmap_overlay(image, condition_key)
    except Exception:
        return None


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
        heatmap_overlay_data_url = _safe_build_heatmap_overlay(image, label)

        per_angle[angle] = {
            "label": label,
            "confidence": confidence,
            "scores": scores,
            "heatmap_target": label,
            "heatmap_overlay_data_url": heatmap_overlay_data_url,
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
        "disclaimer": "The output is informational only and not a medical diagnosis.",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=8001, reload=True)
