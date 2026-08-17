import base64
import os
import threading
from io import BytesIO
from typing import Dict
from dotenv import load_dotenv, find_dotenv
import cv2
import mediapipe as mp
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from PIL import Image

from transformers import pipeline
from huggingface_hub import hf_hub_download
from ultralytics import YOLO

_DOTENV_PATH = (
    os.getenv("DOTENV_PATH")
    or find_dotenv(".env", usecwd=True)
    or os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env"))
)
load_dotenv(_DOTENV_PATH, override=False)


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
FACE_EXPAND_X = 0.1
FACE_EXPAND_Y_TOP = 0.15
FACE_EXPAND_Y_BOTTOM = 0.25
FACE_SILHOUETTE_INDICES = [
    10,
    338,
    297,
    332,
    284,
    251,
    389,
    356,
    454,
    323,
    361,
    288,
    397,
    365,
    379,
    378,
    400,
    377,
    152,
    148,
    176,
    149,
    150,
    136,
    172,
    58,
    132,
    93,
    234,
    127,
    162,
    21,
    54,
    103,
    67,
    109,
]
NOSE_NOSTRIL_INDICES = [
    1,
    2,
    4,
    5,
    19,
    48,
    49,
    64,
    94,
    97,
    98,
    115,
    125,
    129,
    131,
    279,
    278,
    294,
    326,
    327,
    344,
    358,
    360,
]

MODEL_BACKEND = os.getenv("MODEL_BACKEND", "acne_severity").strip().lower()
HEATMAP_ENABLED = os.getenv("HEATMAP_ENABLED", "1").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
PRELOAD_MODELS = os.getenv("PRELOAD_MODELS", "0").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
HEATMAP_BACKEND = os.getenv("HEATMAP_BACKEND", "yolo_acne").strip().lower()

CLIP_MODEL_ID = os.getenv("CLIP_MODEL_ID", "openai/clip-vit-base-patch32").strip()
ACNE_MODEL_ID = os.getenv("ACNE_MODEL_ID", "imfarzanansari/skintelligent-acne").strip()
ACNE_DETECT_MODEL_REPO = os.getenv("ACNE_DETECT_MODEL_REPO", "Tinny-Robot/acne").strip()
ACNE_DETECT_MODEL_FILE = os.getenv("ACNE_DETECT_MODEL_FILE", "acne.pt").strip()
FACE_LANDMARKER_MODEL_REPO = os.getenv(
    "FACE_LANDMARKER_MODEL_REPO", "google/mediapipe"
).strip()
FACE_LANDMARKER_MODEL_FILE = os.getenv(
    "FACE_LANDMARKER_MODEL_FILE", "face_landmarker.task"
).strip()
ACNE_DETECT_CONF = float(os.getenv("ACNE_DETECT_CONF", "0.05"))
ACNE_DETECT_IOU = float(os.getenv("ACNE_DETECT_IOU", "0.55"))
ACNE_DETECT_MAX_DET = int(os.getenv("ACNE_DETECT_MAX_DET", "250"))
ACNE_HEATMAP_RADIUS_RATIO = float(os.getenv("ACNE_HEATMAP_RADIUS_RATIO", "0.55"))
UNIFORM_FACE_ALPHA = int(os.getenv("UNIFORM_FACE_ALPHA", "120"))

_clip_classifier = None
_acne_classifier = None
_acne_detector = None
_face_landmarker = None
_face_landmarker_lock = threading.Lock()


def _get_clip_classifier():
    global _clip_classifier
    if _clip_classifier is None:
        _clip_classifier = pipeline(
            "zero-shot-image-classification",
            model=CLIP_MODEL_ID,
        )
    return _clip_classifier


def _get_acne_classifier():
    global _acne_classifier
    if _acne_classifier is None:
        _acne_classifier = pipeline(
            "image-classification",
            model=ACNE_MODEL_ID,
        )
    return _acne_classifier


def _get_acne_detector():
    """
    Loads a YOLOv8 detector for acne localization.
    Uses Hugging Face Hub to download weights into the container cache.
    """
    global _acne_detector
    if _acne_detector is not None:
        return _acne_detector

    weights_path = hf_hub_download(
        repo_id=ACNE_DETECT_MODEL_REPO,
        filename=ACNE_DETECT_MODEL_FILE,
    )
    _acne_detector = YOLO(weights_path)
    return _acne_detector


def _get_face_landmarker():
    global _face_landmarker
    if _face_landmarker is not None:
        return _face_landmarker
    with _face_landmarker_lock:
        if _face_landmarker is not None:
            return _face_landmarker

        # Try HuggingFace Hub first (if repo configured), fall back to Google CDN
        model_path = None
        if FACE_LANDMARKER_MODEL_REPO:
            try:
                model_path = hf_hub_download(
                    repo_id=FACE_LANDMARKER_MODEL_REPO,
                    filename=FACE_LANDMARKER_MODEL_FILE,
                )
            except Exception as e:
                print(
                    f"WARNING: hf_hub_download failed ({e}), trying Google CDN",
                    flush=True,
                )
        if model_path is None:
            try:
                import urllib.request
                import tempfile

                url = (
                    "https://storage.googleapis.com/mediapipe-models/"
                    "face_landmarker/face_landmarker/float16/1/face_landmarker.task"
                )
                cache_dir = os.path.join(tempfile.gettempdir(), "mediapipe_models")
                os.makedirs(cache_dir, exist_ok=True)
                model_path = os.path.join(cache_dir, "face_landmarker.task")
                if not os.path.exists(model_path):
                    with urllib.request.urlopen(url, timeout=30) as resp:
                        with open(model_path, "wb") as f:
                            f.write(resp.read())
            except Exception as e2:
                print(f"WARNING: CDN download also failed ({e2})", flush=True)
                return None

        try:
            from mediapipe.tasks import python as _mp_python
            from mediapipe.tasks.python import vision as _mp_vision

            base_options = _mp_python.BaseOptions(model_asset_path=model_path)
            options = _mp_vision.FaceLandmarkerOptions(
                base_options=base_options,
                num_faces=1,
                min_face_detection_confidence=0.3,
                min_face_presence_confidence=0.3,
                min_tracking_confidence=0.3,
                output_face_blendshapes=False,
                output_facial_transformation_matrixes=False,
            )
            _face_landmarker = _mp_vision.FaceLandmarker.create_from_options(options)
        except Exception as e:
            print(f"WARNING: FaceLandmarker init failed: {e}", flush=True)

    return _face_landmarker


def _face_landmarks_xy(image: Image.Image) -> np.ndarray | None:
    """Returns (N,2) array of landmark pixel coords, or None."""
    landmarker = _get_face_landmarker()
    if landmarker is None:
        return None
    try:
        w, h = image.size
        img_rgb = np.array(image)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_rgb)
        result = landmarker.detect(mp_image)

        if not result.face_landmarks:
            # Right-facing profiles often fail — try horizontally flipped, then mirror x back
            print(
                "DEBUG: FaceLandmarker found no face, retrying with flipped image",
                flush=True,
            )
            img_flipped = np.fliplr(img_rgb).copy()
            mp_image_flipped = mp.Image(
                image_format=mp.ImageFormat.SRGB, data=img_flipped
            )
            result = landmarker.detect(mp_image_flipped)
            if not result.face_landmarks:
                return None
            lms = result.face_landmarks[0]
            pts = np.array(
                [
                    [
                        int(np.clip((1.0 - lm.x) * w, 0, w - 1)),
                        int(np.clip(lm.y * h, 0, h - 1)),
                    ]
                    for lm in lms
                ],
                dtype=np.int32,
            )
            print(
                "DEBUG: Flipped detection succeeded, mirrored landmarks back",
                flush=True,
            )
            return pts

        lms = result.face_landmarks[0]
        pts = np.array(
            [
                [int(np.clip(lm.x * w, 0, w - 1)), int(np.clip(lm.y * h, 0, h - 1))]
                for lm in lms
            ],
            dtype=np.int32,
        )
        return pts
    except Exception as e:
        print(f"WARNING: FaceLandmarker detection failed: {e}", flush=True)
        return None


def _mask_from_polygon(
    image_width: int, image_height: int, poly: np.ndarray
) -> np.ndarray:
    mask = np.zeros((image_height, image_width), dtype=np.float32)
    if poly is None or len(poly) < 3:
        return mask
    cv2.fillPoly(mask, [poly.astype(np.int32)], 1.0)
    blur_kernel = max(31, (min(image_width, image_height) // 22) | 1)
    mask = cv2.GaussianBlur(mask, (blur_kernel, blur_kernel), sigmaX=0)
    return np.clip(mask, 0.0, 1.0)


def _build_redness_heatmap(image: Image.Image) -> np.ndarray:
    """Returns float heatmap [0,1] emphasizing red a* channel on facial skin."""
    w, h = image.size
    img = np.array(image)
    lab = cv2.cvtColor(img, cv2.COLOR_RGB2LAB).astype(np.float32)
    a = lab[:, :, 1]  # ~[0,255], higher => more red/magenta

    face_mask = _build_face_focus_mask(w, h, image)
    skin_mask = _build_skin_mask(image)
    region = face_mask * skin_mask

    vals = a[region > 0.25]
    if vals.size < 200:
        return np.zeros((h, w), dtype=np.float32)

    # Robust normalize (percentiles) to avoid "all red"
    lo = float(np.percentile(vals, 55))
    hi = float(np.percentile(vals, 92))
    if hi - lo < 1e-6:
        return np.zeros((h, w), dtype=np.float32)

    heat = (a - lo) / (hi - lo)
    heat = np.clip(heat, 0.0, 1.0)
    heat *= region
    heat = cv2.GaussianBlur(heat, (51, 51), 0)
    return np.clip(heat, 0.0, 1.0)


def _build_under_eye_heatmap(image: Image.Image) -> np.ndarray:
    """Returns float heatmap [0,1] for under-eye darkness/puffiness region."""
    w, h = image.size
    pts = _face_landmarks_xy(image)
    if pts is None:
        return np.zeros((h, w), dtype=np.float32)

    # MediaPipe FaceMesh indices for eye contours (approx)
    left_eye = np.array(
        [pts[i] for i in [33, 133, 159, 145, 153, 154, 155]], dtype=np.int32
    )
    right_eye = np.array(
        [pts[i] for i in [362, 263, 386, 374, 380, 381, 382]], dtype=np.int32
    )

    # Create "below-eye" polygons by shifting eye contours downward slightly
    def shift_down(poly: np.ndarray, dy: float) -> np.ndarray:
        out = poly.copy().astype(np.float32)
        out[:, 1] += dy
        return out.astype(np.int32)

    dy = max(6.0, h * 0.02)
    left_under = np.concatenate([left_eye, shift_down(left_eye[::-1], dy)], axis=0)
    right_under = np.concatenate([right_eye, shift_down(right_eye[::-1], dy)], axis=0)

    region_mask = np.clip(
        _mask_from_polygon(w, h, left_under) + _mask_from_polygon(w, h, right_under),
        0.0,
        1.0,
    )

    img = np.array(image)
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
    face_mask = _build_face_focus_mask(w, h, image)
    skin_mask = _build_skin_mask(image)
    region = region_mask * face_mask * skin_mask

    vals = gray[region > 0.2]
    if vals.size < 100:
        return np.zeros((h, w), dtype=np.float32)

    # Darkness => higher severity
    lo = float(np.percentile(vals, 15))
    hi = float(np.percentile(vals, 55))
    if hi - lo < 1e-6:
        return np.zeros((h, w), dtype=np.float32)
    darkness = (hi - gray) / (hi - lo)
    darkness = np.clip(darkness, 0.0, 1.0)
    darkness *= region
    darkness = cv2.GaussianBlur(darkness, (41, 41), 0)
    return np.clip(darkness, 0.0, 1.0)


@app.on_event("startup")
def _startup_preload_models():
    if not PRELOAD_MODELS:
        return

    def _warmup():
        try:
            _get_clip_classifier()
            _get_acne_classifier()
            _get_face_landmarker()
            if HEATMAP_BACKEND == "yolo_acne":
                _get_acne_detector()
        except Exception:
            # Warmup failures shouldn't block the service from starting.
            pass

    threading.Thread(target=_warmup, daemon=True).start()


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


def _predict_scores(
    image: Image.Image, candidate_labels: list[str]
) -> Dict[str, float]:
    predictions = _get_clip_classifier()(image, candidate_labels=candidate_labels)

    scores: Dict[str, float] = {label: 0.0 for label in candidate_labels}

    if isinstance(predictions, list):
        for item in predictions:
            if not isinstance(item, dict):
                continue
            label = item.get("label")
            score = item.get("score")
            if (
                isinstance(label, str)
                and isinstance(score, (int, float))
                and label in scores
            ):
                scores[label] = float(score)
        return scores

    if isinstance(predictions, dict):
        labels = predictions.get("labels")
        raw_scores = predictions.get("scores")
        if isinstance(labels, list) and isinstance(raw_scores, list):
            for label, score in zip(labels, raw_scores):
                if (
                    isinstance(label, str)
                    and isinstance(score, (int, float))
                    and label in scores
                ):
                    scores[label] = float(score)

    return scores


def _score_acne_severity(image: Image.Image) -> tuple[float, Dict[str, float]]:
    """
    Returns:
      - acne_score: float in [0, 1]
      - raw_scores: per-severity probability distribution (label -> prob)

    Uses blemish detection (HSV color-based) for more accurate acne scoring.
    Falls back to classifier if detection fails.
    """
    # First try to detect blemishes via color-based method
    skin_mask = _build_skin_mask(image)
    face_mask = _build_face_focus_mask(image.width, image.height, image)

    blemishes = _detect_blemishes_by_color(image, skin_mask, face_mask)
    num_blemishes = len(blemishes)

    print(
        f"DEBUG _score_acne_severity: Detected {num_blemishes} blemishes via color-based detection"
    )

    # Calculate acne score based on blemish count and severity
    if num_blemishes > 0:
        # Average severity across detected blemishes
        avg_severity = np.mean([b.get("severity", 0.5) for b in blemishes])

        # Map blemish count to score:
        # 1-3 blemishes: 0.1-0.2 (mild)
        # 4-10 blemishes: 0.3-0.5 (moderate)
        # 11+ blemishes: 0.6-1.0 (severe)
        count_score = min(1.0, num_blemishes / 20.0)

        # Combine count and severity scores
        acne_score = count_score * 0.6 + avg_severity * 0.4
        acne_score = float(np.clip(acne_score, 0.0, 1.0))

        print(
            f"DEBUG _score_acne_severity: Using color-based score = {acne_score} (count_score={count_score}, avg_severity={avg_severity})"
        )
        return acne_score, {"blemish_count": num_blemishes}

    # Fallback to classifier if no blemishes detected
    print("DEBUG _score_acne_severity: No blemishes found, using classifier fallback")

    predictions = _get_acne_classifier()(image)

    items: list[dict] = predictions if isinstance(predictions, list) else []
    raw_scores: Dict[str, float] = {}
    expected = 0.0
    total = 0.0

    for item in items:
        if not isinstance(item, dict):
            continue
        label = item.get("label")
        score = item.get("score")
        if not isinstance(label, str) or not isinstance(score, (int, float)):
            continue

        prob = float(score)
        raw_scores[label] = prob

        # Extract the numeric severity if present at the start of the label.
        # Common formats: "-1 (Clear Skin)", "4 (Very Severe Acne)", "Level 4: ..."
        severity: int | None = None
        try:
            token = label.strip().split()[0]
            severity = int(token)
        except Exception:
            severity = None

        if severity is not None:
            expected += severity * prob
            total += prob

    if total <= 1e-8:
        return 0.0, raw_scores

    expected /= total  # expected severity in [-1, 4] for the default model
    acne_score = (expected + 1.0) / 5.0
    acne_score = float(np.clip(acne_score, 0.0, 1.0))
    return acne_score, raw_scores


def _score_image(image: Image.Image) -> Dict[str, float]:
    if MODEL_BACKEND == "clip":
        raw_scores = _predict_scores(image, LABELS)
        return {
            "acne": raw_scores.get("acne", 0.0),
            "redness": raw_scores.get("skin redness", 0.0),
            "under_eye_bags": raw_scores.get("bags under the eyes", 0.0),
        }

    if MODEL_BACKEND == "acne_severity":
        acne_score, _ = _score_acne_severity(image)
        clip_scores = _predict_scores(image, ["skin redness", "bags under the eyes"])
        return {
            "acne": acne_score,
            "redness": clip_scores.get("skin redness", 0.0),
            "under_eye_bags": clip_scores.get("bags under the eyes", 0.0),
        }

    # Fallback: behave like original implementation.
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


def _get_severity_color(severity_score: float) -> tuple[int, int, int]:
    """
    Maps severity score (0-1) to RGB color:
    0.0-0.33 (mild) = Green (34, 197, 94)
    0.33-0.67 (moderate) = Yellow (250, 204, 21)
    0.67-1.0 (severe) = Red (239, 68, 68)
    """
    severity = np.clip(float(severity_score), 0.0, 1.0)

    if severity < 0.33:
        # Green for mild
        return (34, 197, 94)
    elif severity < 0.67:
        # Yellow for moderate
        return (250, 204, 21)
    else:
        # Red for severe
        return (239, 68, 68)


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

    # Apply severity-based colors: use normalized values to determine color
    for y in range(image_height):
        for x in range(image_width):
            if alpha_channel[y, x] > 0:
                severity = normalized[y, x]
                r, g, b = _get_severity_color(severity)
                overlay_rgba[y, x, 0] = r
                overlay_rgba[y, x, 1] = g
                overlay_rgba[y, x, 2] = b
                overlay_rgba[y, x, 3] = alpha_channel[y, x]

    overlay_image = Image.fromarray(overlay_rgba, mode="RGBA")
    composite = Image.alpha_composite(image.convert("RGBA"), overlay_image)

    return _to_png_data_url(composite)


def _detect_blemishes_by_color(
    image: Image.Image, skin_mask: np.ndarray, face_mask: np.ndarray
) -> list[dict]:
    """
    Detect blemishes using color analysis on skin regions.
    Looks for reddish/brownish spots that stand out from surrounding skin.
    """
    try:
        image_rgb = np.array(image)
        image_hsv = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2HSV)

        # Create detection region: intersection of skin and face masks
        detection_region = (skin_mask > 0.5) & (face_mask > 0.3)

        if detection_region.sum() < 100:
            print(f"DEBUG: detection_region too small: {detection_region.sum()} pixels")
            return []

        # Extract HSV channels
        h_channel = image_hsv[:, :, 0].astype(np.float32)
        s_channel = image_hsv[:, :, 1].astype(np.float32)
        v_channel = image_hsv[:, :, 2].astype(np.float32)

        # Detect reddish/brownish spots (acne is typically darker and more saturated)
        # Red hues: 0-20 or 160-180, but acne can be brownish (10-30)
        is_reddish = (
            ((h_channel < 25) | (h_channel > 155))
            & (s_channel > 40)
            & (v_channel < 200)
        )

        # Further refine: look for spots that are darker than surrounding skin
        local_v_mean = cv2.GaussianBlur(v_channel, (31, 31), 0)
        is_darker = v_channel < (local_v_mean - 15)

        blemish_mask = detection_region & is_reddish & is_darker

        print(
            f"DEBUG: Blemish detection - is_reddish:{is_reddish.sum()}, is_darker:{is_darker.sum()}, combined:{blemish_mask.sum()}"
        )

        # Find connected components (individual blemishes)
        num_labels, labels = cv2.connectedComponents(blemish_mask.astype(np.uint8))

        blemishes = []
        for label in range(1, num_labels):
            component = labels == label
            if component.sum() < 10:  # Skip tiny noise (< 10 pixels)
                continue

            y_indices, x_indices = np.where(component)
            cx = int(np.mean(x_indices))
            cy = int(np.mean(y_indices))
            area = component.sum()
            radius = max(3, int(np.sqrt(area / np.pi)))

            # Estimate severity based on how dark and saturated the spot is
            spot_v = v_channel[component].mean()

            severity = np.clip(
                1.0 - (spot_v / 255.0), 0.1, 1.0
            )  # Darker = higher severity

            blemishes.append(
                {
                    "cx": cx,
                    "cy": cy,
                    "radius": radius,
                    "severity": severity,
                    "area": area,
                }
            )

        print(f"DEBUG: Blemish detection complete: {len(blemishes)} blemishes found")
        return blemishes
    except Exception as e:
        print(f"DEBUG: Error in _detect_blemishes_by_color: {e}")
        import traceback

        traceback.print_exc()
        return []


def _build_acne_yolo_heatmap_overlay(image: Image.Image) -> str | None:
    image_width, image_height = image.size
    if image_width < 8 or image_height < 8:
        return None

    focus_left, focus_top, focus_right, focus_bottom = _get_face_focus_bounds(
        image_width,
        image_height,
        image,
    )

    # Crop to face region — YOLO only sees the face, not hands/hair/background
    crop_left, crop_top = focus_left, focus_top
    face_crop = image.crop((crop_left, crop_top, focus_right, focus_bottom))
    crop_w, crop_h = face_crop.size
    if crop_w < 8 or crop_h < 8:
        print("WARNING: Face crop too small, running YOLO on full image", flush=True)
        face_crop = image
        crop_left, crop_top = 0, 0

    detector = _get_acne_detector()
    results = detector.predict(
        np.array(face_crop),
        verbose=False,
        conf=ACNE_DETECT_CONF,
        iou=ACNE_DETECT_IOU,
        max_det=ACNE_DETECT_MAX_DET,
    )
    if not results:
        return None

    result = results[0]
    boxes = getattr(result, "boxes", None)
    if boxes is None or getattr(boxes, "xyxy", None) is None:
        return None

    xyxy = boxes.xyxy
    conf = getattr(boxes, "conf", None)
    if xyxy is None:
        return None

    # Build face and skin masks for stricter filtering
    face_mask = _build_face_focus_mask(image_width, image_height, image)
    skin_mask = _build_skin_mask(image)

    # Create heatmap from YOLO detections (local model)
    heatmap = np.zeros((image_height, image_width), dtype=np.float32)

    y_indices, x_indices = np.ogrid[:image_height, :image_width]

    det_count = int(xyxy.shape[0]) if hasattr(xyxy, "shape") else 0
    print(f"DEBUG: YOLO detections: {det_count}")

    # If YOLO returns nothing usable, fall back to color-based spot detection
    use_color_fallback = det_count == 0
    if not use_color_fallback:
        for i in range(det_count):
            x1, y1, x2, y2 = [float(v) for v in xyxy[i].tolist()]
            # Offset crop-relative coordinates back to full image space
            cx = int((x1 + x2) / 2) + crop_left
            cy = int((y1 + y2) / 2) + crop_top
            bw = max(2.0, x2 - x1)
            bh = max(2.0, y2 - y1)
            radius = max(6.0, 0.5 * (bw + bh) * 0.5 * ACNE_HEATMAP_RADIUS_RATIO)
            sigma = max(6.0, radius / 1.8)
            c = float(conf[i]) if conf is not None else 0.6
            intensity = float(np.clip(c, 0.15, 1.0))

            # Gaussian blob
            distance2 = (x_indices - cx) ** 2 + (y_indices - cy) ** 2
            blob = intensity * np.exp(-distance2 / (2.0 * sigma**2))
            heatmap = np.maximum(heatmap, blob.astype(np.float32))

    if use_color_fallback:
        blemishes = _detect_blemishes_by_color(image, skin_mask, face_mask)
        print(f"DEBUG: Color-based fallback blemishes: {len(blemishes)}")
        for b in blemishes:
            cx = int(b["cx"])
            cy = int(b["cy"])
            severity = float(b.get("severity", 0.5))
            sigma = 18.0
            distance2 = (x_indices - cx) ** 2 + (y_indices - cy) ** 2
            blob = severity * np.exp(-distance2 / (2.0 * sigma**2))
            heatmap = np.maximum(heatmap, blob.astype(np.float32))

    # Apply face/skin mask to heatmap
    heatmap *= face_mask * skin_mask

    # Light smoothing (too much blur makes the whole face "light up")
    blur_k = max(25, (min(image_width, image_height) // 28) | 1)
    heatmap = cv2.GaussianBlur(heatmap, (blur_k, blur_k), 0)

    # Normalize heatmap to [0, 1]
    heatmap_max = heatmap.max()
    if heatmap_max > 0:
        heatmap = heatmap / heatmap_max

    print(
        f"DEBUG: Heatmap generated, min={heatmap.min():.3f}, max={heatmap.max():.3f}, mean={heatmap.mean():.3f}"
    )

    # Create overlay with gradient colors based on heatmap
    overlay_rgba = np.zeros((image_height, image_width, 4), dtype=np.uint8)

    # Apply heatmap as base (green for mild → red for severe)
    for y in range(image_height):
        for x in range(image_width):
            # Higher cutoff prevents "whole-face tint" from blur/normalization tails
            if heatmap[y, x] > 0.08:
                severity = heatmap[y, x]
                r, g, b = _get_severity_color(severity)
                alpha = int(severity * HEATMAP_ALPHA_MAX)
                overlay_rgba[y, x, 0] = r
                overlay_rgba[y, x, 1] = g
                overlay_rgba[y, x, 2] = b
                overlay_rgba[y, x, 3] = alpha

    detections_found = (overlay_rgba[..., 3] > 0).any()

    if not detections_found:
        print("DEBUG: No detections found, returning None")
        return None

    print(
        f"DEBUG: Final overlay: non-zero alpha pixels = {(overlay_rgba[..., 3] > 0).sum()}, RGB values: min={overlay_rgba[..., :3].min()}, max={overlay_rgba[..., :3].max()}"
    )

    overlay_image = Image.fromarray(overlay_rgba, mode="RGBA")
    composite = Image.alpha_composite(image.convert("RGBA"), overlay_image)
    result = _to_png_data_url(composite)
    print(
        f"DEBUG: Overlay generated successfully, result length={len(result) if result else 0}"
    )
    return result


def _build_combined_condition_overlay(
    image: Image.Image, condition_key: str
) -> str | None:
    """
    Local, realistic overlay:
    - acne: YOLO/localization heatmap
    - redness: LAB a* based heatmap
    - under_eye_bags: under-eye darkness heatmap
    """
    w, h = image.size
    if w < 8 or h < 8:
        return None

    if condition_key == "acne":
        # Reuse the acne pipeline but return heatmap overlay only.
        return _build_acne_yolo_heatmap_overlay(image)

    if condition_key == "redness":
        heat = _build_redness_heatmap(image)
    elif condition_key == "under_eye_bags":
        heat = _build_under_eye_heatmap(image)
    else:
        return None

    if float(heat.max()) <= 1e-6:
        return None

    overlay_rgba = np.zeros((h, w, 4), dtype=np.uint8)
    # Cut off low-intensity noise so the overlay is localized.
    heat = np.where(heat > 0.12, heat, 0.0).astype(np.float32)
    alpha = (heat * HEATMAP_ALPHA_MAX).astype(np.uint8)
    for y in range(h):
        for x in range(w):
            a = int(alpha[y, x])
            if a <= 0:
                continue
            sev = float(heat[y, x])
            r, g, b = _get_severity_color(sev)
            overlay_rgba[y, x, 0] = r
            overlay_rgba[y, x, 1] = g
            overlay_rgba[y, x, 2] = b
            overlay_rgba[y, x, 3] = a

    overlay_image = Image.fromarray(overlay_rgba, mode="RGBA")
    composite = Image.alpha_composite(image.convert("RGBA"), overlay_image)
    return _to_png_data_url(composite)


def _build_uniform_face_overlay(image: Image.Image) -> str | None:
    """
    Uniform overlay across facial skin (no localization).
    Uses a conservative yellow color to indicate skin region.
    """
    image_width, image_height = image.size
    if image_width < 8 or image_height < 8:
        return None

    face_mask = _build_face_focus_mask(image_width, image_height, image)
    skin_mask = _build_skin_mask(image)
    combined_mask = np.clip(face_mask * skin_mask, 0.0, 1.0)

    alpha = int(np.clip(UNIFORM_FACE_ALPHA, 0, 255))
    alpha_array = combined_mask * float(alpha)
    alpha_channel = alpha_array.astype(np.uint8)

    overlay_rgba = np.zeros((image_height, image_width, 4), dtype=np.uint8)
    # Use yellow for general face detection
    overlay_rgba[..., 0] = 250
    overlay_rgba[..., 1] = 204
    overlay_rgba[..., 2] = 21
    overlay_rgba[..., 3] = alpha_channel

    overlay_image = Image.fromarray(overlay_rgba, mode="RGBA")
    composite = Image.alpha_composite(image.convert("RGBA"), overlay_image)
    return _to_png_data_url(composite)


def _build_composite_heatmap_overlay_and_metadata(
    image: Image.Image,
) -> tuple[str | None, list[dict]]:
    """
    Builds detection metadata for all conditions (acne, redness, under-eye bags)
    and returns the standard acne heatmap overlay with detection metadata for hover tooltips.
    Returns (data_url_or_None, detections_list).
    """
    w, h = image.size
    detections: list[dict] = []

    # Detection thresholds for zone detection
    REDNESS_DETECTION_THRESHOLD = 0.3
    UNDEREYE_DETECTION_THRESHOLD = 0.3

    # Build detection metadata for all conditions
    # Redness zone detection
    try:
        redness_heat = _build_redness_heatmap(image)
        zone_mask = redness_heat > REDNESS_DETECTION_THRESHOLD
        if zone_mask.any():
            ys, xs = np.where(zone_mask)
            detections.append(
                {
                    "condition": "redness",
                    "type": "zone",
                    "x1": int(xs.min()),
                    "y1": int(ys.min()),
                    "x2": int(xs.max()),
                    "y2": int(ys.max()),
                    "severity": float(np.clip(redness_heat[zone_mask].mean(), 0, 1)),
                }
            )
    except Exception as e:
        print(f"WARNING: redness detection failed: {e}", flush=True)

    # Under-eye bags zone detection
    try:
        undereye_heat = _build_under_eye_heatmap(image)
        zone_mask = undereye_heat > UNDEREYE_DETECTION_THRESHOLD
        if zone_mask.any():
            ys, xs = np.where(zone_mask)
            detections.append(
                {
                    "condition": "under_eye_bags",
                    "type": "zone",
                    "x1": int(xs.min()),
                    "y1": int(ys.min()),
                    "x2": int(xs.max()),
                    "y2": int(ys.max()),
                    "severity": float(np.clip(undereye_heat[zone_mask].mean(), 0, 1)),
                }
            )
    except Exception as e:
        print(f"WARNING: under-eye detection failed: {e}", flush=True)

    # Use the standard acne heatmap overlay (green→yellow→red gradient)
    # with acne spot detection metadata added
    face_mask = _build_face_focus_mask(w, h, image)
    skin_mask = _build_skin_mask(image)
    y_indices, x_indices = np.ogrid[:h, :w]

    try:
        focus_left, focus_top, focus_right, focus_bottom = _get_face_focus_bounds(
            w, h, image
        )
        crop_left, crop_top = focus_left, focus_top
        face_crop = image.crop((crop_left, crop_top, focus_right, focus_bottom))
        if face_crop.size[0] < 8 or face_crop.size[1] < 8:
            face_crop, crop_left, crop_top = image, 0, 0

        acne_heat = np.zeros((h, w), dtype=np.float32)
        det_count = 0
        yolo_xyxy, yolo_conf = None, None

        detector = _get_acne_detector()
        results = detector.predict(
            np.array(face_crop),
            verbose=False,
            conf=ACNE_DETECT_CONF,
            iou=ACNE_DETECT_IOU,
            max_det=ACNE_DETECT_MAX_DET,
        )
        if results:
            boxes = getattr(results[0], "boxes", None)
            if boxes is not None and getattr(boxes, "xyxy", None) is not None:
                yolo_xyxy = boxes.xyxy
                yolo_conf = getattr(boxes, "conf", None)
                det_count = (
                    int(yolo_xyxy.shape[0]) if hasattr(yolo_xyxy, "shape") else 0
                )

        use_color = det_count == 0
        if not use_color:
            for i in range(det_count):
                x1, y1, x2, y2 = [float(v) for v in yolo_xyxy[i].tolist()]
                cx = int((x1 + x2) / 2) + crop_left
                cy = int((y1 + y2) / 2) + crop_top
                bw, bh = max(2.0, x2 - x1), max(2.0, y2 - y1)
                radius = max(6.0, 0.5 * (bw + bh) * 0.5 * ACNE_HEATMAP_RADIUS_RATIO)
                sigma = max(6.0, radius / 1.8)
                c = float(yolo_conf[i]) if yolo_conf is not None else 0.6
                intensity = float(np.clip(c, 0.15, 1.0))
                d2 = (x_indices - cx) ** 2 + (y_indices - cy) ** 2
                acne_heat = np.maximum(
                    acne_heat,
                    (intensity * np.exp(-d2 / (2 * sigma**2))).astype(np.float32),
                )
                detections.append(
                    {
                        "condition": "acne",
                        "type": "spot",
                        "x": cx,
                        "y": cy,
                        "radius": max(6, int(0.5 * (bw + bh) * 0.5)),
                        "severity": float(np.clip(c, 0, 1)),
                    }
                )

        if use_color:
            blemishes = _detect_blemishes_by_color(image, skin_mask, face_mask)
            for b in blemishes:
                cx, cy = int(b["cx"]), int(b["cy"])
                sev = float(b.get("severity", 0.5))
                sigma = 18.0
                d2 = (x_indices - cx) ** 2 + (y_indices - cy) ** 2
                acne_heat = np.maximum(
                    acne_heat, (sev * np.exp(-d2 / (2 * sigma**2))).astype(np.float32)
                )
                detections.append(
                    {
                        "condition": "acne",
                        "type": "spot",
                        "x": cx,
                        "y": cy,
                        "radius": max(6, int(b.get("radius", 8))),
                        "severity": float(np.clip(sev, 0, 1)),
                    }
                )

        acne_heat *= face_mask * skin_mask
    except Exception as e:
        print(f"WARNING: acne detection failed: {e}", flush=True)
        acne_heat = np.zeros((h, w), dtype=np.float32)

    # Render using standard gradient overlay
    heatmap_overlay_url = (
        _safe_build_heatmap_overlay(image, "acne") if acne_heat.max() > 0 else None
    )
    return heatmap_overlay_url, detections


def _build_face_silhouette_mask(
    image_width: int, image_height: int, pts: np.ndarray
) -> np.ndarray:
    mask = np.zeros((image_height, image_width), dtype=np.float32)
    # pts is expected to be the 478-landmark array from _face_landmarks_xy
    sil_pts = pts[FACE_SILHOUETTE_INDICES]
    cv2.fillPoly(mask, [sil_pts.astype(np.int32)], 1.0)
    blur_kernel = max(21, (min(image_width, image_height) // 20) | 1)
    mask = cv2.GaussianBlur(mask, (blur_kernel, blur_kernel), sigmaX=0)
    return np.clip(mask, 0.0, 1.0)


def _build_nostril_exclusion_mask(
    image_width: int, image_height: int, pts: np.ndarray
) -> np.ndarray:
    mask = np.zeros((image_height, image_width), dtype=np.float32)
    # pts is expected to be the 478-landmark array from _face_landmarks_xy
    nostril_pts = pts[NOSE_NOSTRIL_INDICES]
    hull = cv2.convexHull(nostril_pts.astype(np.int32))
    cv2.fillPoly(mask, [hull.reshape(-1, 2)], 1.0)
    # Use same kernel size as silhouette mask so subtraction is strong enough
    blur_kernel = max(21, (min(image_width, image_height) // 20) | 1)
    mask = cv2.GaussianBlur(mask, (blur_kernel, blur_kernel), sigmaX=0)
    return np.clip(mask, 0.0, 1.0)


def _detect_face_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    # Try MediaPipe face mesh first — handles frontal and side-facing photos
    pts = _face_landmarks_xy(image)
    if pts is not None:
        iw, ih = image.size
        x1 = int(np.clip(pts[:, 0].min(), 0, iw - 1))
        y1 = int(np.clip(pts[:, 1].min(), 0, ih - 1))
        x2 = int(np.clip(pts[:, 0].max(), 0, iw - 1))
        y2 = int(np.clip(pts[:, 1].max(), 0, ih - 1))
        fw, fh = x2 - x1, y2 - y1
        if fw >= 20 and fh >= 20:
            print(f"DEBUG: MediaPipe face bbox: x={x1}, y={y1}, w={fw}, h={fh}")
            return x1, y1, fw, fh

    # Fall back to Haar cascade for frontal faces
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
    pts = _face_landmarks_xy(image)
    if pts is not None:
        silhouette = _build_face_silhouette_mask(image_width, image_height, pts)
        nostril = _build_nostril_exclusion_mask(image_width, image_height, pts)
        mask = np.clip(silhouette - nostril, 0.0, 1.0)
        if mask.max() > 0:
            return mask

    # Fallback: Haar bbox or center ellipse
    mask = np.zeros((image_height, image_width), dtype=np.float32)
    bbox = _detect_face_bbox(image)
    if bbox is not None:
        x, y, w, h = bbox
        left = max(0, int(x - w * FACE_EXPAND_X))
        right = min(image_width, int(x + w + w * FACE_EXPAND_X))
        top = max(0, int(y - h * FACE_EXPAND_Y_TOP))
        bottom = min(image_height, int(y + h + h * FACE_EXPAND_Y_BOTTOM))
        print(
            f"DEBUG: Face bbox: x={x}, y={y}, w={w}, h={h}, expanded: left={left}, top={top}, right={right}, bottom={bottom}"
        )
        cx = int((left + right) / 2)
        cy = int((top + bottom) / 2)
        ax = max(1, int((right - left) / 2))
        ay = max(1, int((bottom - top) / 2))
        cv2.ellipse(mask, (cx, cy), (ax, ay), 0, 0, 360, 1.0, -1)
    else:
        print("DEBUG: Haar face detection failed, using fallback ellipse")
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
    pts = _face_landmarks_xy(image)
    if pts is not None:
        sil_pts = pts[FACE_SILHOUETTE_INDICES]
        left = int(np.clip(sil_pts[:, 0].min(), 0, image_width - 1))
        right = int(np.clip(sil_pts[:, 0].max(), 0, image_width - 1))
        top = int(np.clip(sil_pts[:, 1].min(), 0, image_height - 1))
        bottom = int(np.clip(sil_pts[:, 1].max(), 0, image_height - 1))
        if right > left and bottom > top:
            return left, top, right, bottom

    # Fallback: Haar bbox or center ellipse
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

    # Stricter skin detection thresholds to exclude hair/background
    skin_mask = (
        (y_channel > 40)
        & (y_channel < 240)
        & (cr_channel > 130)
        & (cr_channel < 170)
        & (cb_channel > 80)
        & (cb_channel < 135)
    ).astype(np.float32)

    # Morphological operations to clean up isolated pixels and hair
    blur_kernel = max(9, (min(image.width, image.height) // 55) | 1)
    skin_mask = cv2.GaussianBlur(skin_mask, (blur_kernel, blur_kernel), sigmaX=0)

    # Apply morphological closing to fill small holes
    morph_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    skin_mask = cv2.morphologyEx(skin_mask, cv2.MORPH_CLOSE, morph_kernel)

    return np.clip(skin_mask, 0.0, 1.0)


def _safe_build_heatmap_overlay(image: Image.Image, condition_key: str) -> str | None:
    try:
        if HEATMAP_BACKEND == "uniform_face":
            return _build_uniform_face_overlay(image)
        if HEATMAP_BACKEND == "local_regions":
            return _build_combined_condition_overlay(image, condition_key)
        if HEATMAP_BACKEND == "yolo_acne" and condition_key == "acne":
            result = _build_acne_yolo_heatmap_overlay(image)
            if result is None:
                print(
                    "WARNING: yolo_acne returned None, returning original photo",
                    flush=True,
                )
                return _to_png_data_url(image)
            return result
        return _build_heatmap_overlay(image, condition_key)
    except Exception as e:
        print(
            f"ERROR in _safe_build_heatmap_overlay: {type(e).__name__}: {str(e)}",
            flush=True,
        )
        import traceback

        traceback.print_exc()
        return None


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/debug/config")
def debug_config() -> Dict[str, str]:
    # Keep values stringified to avoid leaking large objects
    return {
        "dotenv_path": str(_DOTENV_PATH),
        "MODEL_BACKEND": str(MODEL_BACKEND),
        "HEATMAP_ENABLED": str(int(HEATMAP_ENABLED)),
        "HEATMAP_BACKEND": str(HEATMAP_BACKEND),
        "CLIP_MODEL_ID": str(CLIP_MODEL_ID),
        "ACNE_MODEL_ID": str(ACNE_MODEL_ID),
        "ACNE_DETECT_MODEL_REPO": str(ACNE_DETECT_MODEL_REPO),
        "ACNE_DETECT_MODEL_FILE": str(ACNE_DETECT_MODEL_FILE),
        "ACNE_DETECT_CONF": str(ACNE_DETECT_CONF),
        "ACNE_DETECT_IOU": str(ACNE_DETECT_IOU),
        "ACNE_DETECT_MAX_DET": str(ACNE_DETECT_MAX_DET),
        "PRELOAD_MODELS": str(int(PRELOAD_MODELS)),
    }


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
        heatmap_target = label
        if HEATMAP_BACKEND == "yolo_acne":
            # If the main visual indicator is acne localization, always generate the acne overlay
            # even when the top label is "redness" or "under_eye_bags".
            heatmap_target = "acne"

        detections: list[dict] = []
        if HEATMAP_ENABLED and HEATMAP_BACKEND == "yolo_acne":
            heatmap_overlay_data_url, detections = (
                _build_composite_heatmap_overlay_and_metadata(image)
            )
        elif HEATMAP_ENABLED:
            heatmap_overlay_data_url = _safe_build_heatmap_overlay(
                image, heatmap_target
            )
        else:
            heatmap_overlay_data_url = None

        per_angle[angle] = {
            "label": label,
            "confidence": confidence,
            "scores": scores,
            "heatmap_target": heatmap_target,
            "heatmap_overlay_data_url": heatmap_overlay_data_url,
            "detections": detections,
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

    print(f"[analyze_set] Returning response with overall_scores: {overall_scores}")
    print(
        f"[analyze_set] Per-angle scores: {[(angle, scores['scores']) for angle, scores in per_angle.items()]}"
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
