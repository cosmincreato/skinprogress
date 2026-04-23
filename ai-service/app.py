import base64
import os
import threading
from io import BytesIO
from typing import Dict
from dotenv import load_dotenv

load_dotenv()

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
FACE_EXPAND_X = 0.1
FACE_EXPAND_Y_TOP = 0.15
FACE_EXPAND_Y_BOTTOM = 0.25

MODEL_BACKEND = os.getenv("MODEL_BACKEND", "acne_severity").strip().lower()
HEATMAP_ENABLED = os.getenv("HEATMAP_ENABLED", "1").strip().lower() in {"1", "true", "yes", "on"}
PRELOAD_MODELS = os.getenv("PRELOAD_MODELS", "0").strip().lower() in {"1", "true", "yes", "on"}
HEATMAP_BACKEND = os.getenv("HEATMAP_BACKEND", "yolo_acne").strip().lower()

CLIP_MODEL_ID = os.getenv("CLIP_MODEL_ID", "openai/clip-vit-base-patch32").strip()
ACNE_MODEL_ID = os.getenv("ACNE_MODEL_ID", "imfarzanansari/skintelligent-acne").strip()
ACNE_DETECT_MODEL_REPO = os.getenv("ACNE_DETECT_MODEL_REPO", "Tinny-Robot/acne").strip()
ACNE_DETECT_MODEL_FILE = os.getenv("ACNE_DETECT_MODEL_FILE", "acne.pt").strip()
ACNE_DETECT_CONF = float(os.getenv("ACNE_DETECT_CONF", "0.05"))
ACNE_DETECT_IOU = float(os.getenv("ACNE_DETECT_IOU", "0.55"))
ACNE_DETECT_MAX_DET = int(os.getenv("ACNE_DETECT_MAX_DET", "250"))
ACNE_HEATMAP_RADIUS_RATIO = float(os.getenv("ACNE_HEATMAP_RADIUS_RATIO", "0.55"))
UNIFORM_FACE_ALPHA = int(os.getenv("UNIFORM_FACE_ALPHA", "120"))

_clip_classifier = None
_acne_classifier = None
_acne_detector = None


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

    from huggingface_hub import hf_hub_download
    from ultralytics import YOLO

    weights_path = hf_hub_download(
        repo_id=ACNE_DETECT_MODEL_REPO,
        filename=ACNE_DETECT_MODEL_FILE,
    )
    _acne_detector = YOLO(weights_path)
    return _acne_detector


@app.on_event("startup")
def _startup_preload_models():
    if not PRELOAD_MODELS:
        return

    def _warmup():
        try:
            _get_clip_classifier()
            _get_acne_classifier()
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


def _predict_scores(image: Image.Image, candidate_labels: list[str]) -> Dict[str, float]:
    predictions = _get_clip_classifier()(image, candidate_labels=candidate_labels)

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
    
    print(f"DEBUG _score_acne_severity: Detected {num_blemishes} blemishes via color-based detection")
    
    # Calculate acne score based on blemish count and severity
    if num_blemishes > 0:
        # Average severity across detected blemishes
        avg_severity = np.mean([b.get('severity', 0.5) for b in blemishes])
        
        # Map blemish count to score:
        # 1-3 blemishes: 0.1-0.2 (mild)
        # 4-10 blemishes: 0.3-0.5 (moderate)
        # 11+ blemishes: 0.6-1.0 (severe)
        count_score = min(1.0, num_blemishes / 20.0)
        
        # Combine count and severity scores
        acne_score = (count_score * 0.6 + avg_severity * 0.4)
        acne_score = float(np.clip(acne_score, 0.0, 1.0))
        
        print(f"DEBUG _score_acne_severity: Using color-based score = {acne_score} (count_score={count_score}, avg_severity={avg_severity})")
        return acne_score, {"blemish_count": num_blemishes}
    
    # Fallback to classifier if no blemishes detected
    print(f"DEBUG _score_acne_severity: No blemishes found, using classifier fallback")
    
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


def _detect_blemishes_by_color(image: Image.Image, skin_mask: np.ndarray, face_mask: np.ndarray) -> list[dict]:
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
        is_reddish = ((h_channel < 25) | (h_channel > 155)) & (s_channel > 40) & (v_channel < 200)
        
        # Further refine: look for spots that are darker than surrounding skin
        local_v_mean = cv2.GaussianBlur(v_channel, (31, 31), 0)
        is_darker = v_channel < (local_v_mean - 15)
        
        blemish_mask = detection_region & is_reddish & is_darker
        
        print(f"DEBUG: Blemish detection - is_reddish:{is_reddish.sum()}, is_darker:{is_darker.sum()}, combined:{blemish_mask.sum()}")
        
        # Find connected components (individual blemishes)
        num_labels, labels = cv2.connectedComponents(blemish_mask.astype(np.uint8))
        
        blemishes = []
        for label in range(1, num_labels):
            component = (labels == label)
            if component.sum() < 10:  # Skip tiny noise (< 10 pixels)
                continue
            
            y_indices, x_indices = np.where(component)
            cx = int(np.mean(x_indices))
            cy = int(np.mean(y_indices))
            area = component.sum()
            radius = max(3, int(np.sqrt(area / np.pi)))
            
            # Estimate severity based on how dark and saturated the spot is
            spot_v = v_channel[component].mean()
            spot_s = s_channel[component].mean()
            severity = np.clip(1.0 - (spot_v / 255.0), 0.1, 1.0)  # Darker = higher severity
            
            blemishes.append({
                'cx': cx,
                'cy': cy,
                'radius': radius,
                'severity': severity,
                'area': area,
            })
        
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

    detector = _get_acne_detector()
    results = detector.predict(
        np.array(image),
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

    xyxy_np = xyxy.detach().cpu().numpy() if hasattr(xyxy, "detach") else np.array(xyxy)
    conf_np = (
        conf.detach().cpu().numpy()
        if conf is not None and hasattr(conf, "detach")
        else (np.array(conf) if conf is not None else None)
    )

    # Build face and skin masks for stricter filtering
    face_mask = _build_face_focus_mask(image_width, image_height, image)
    skin_mask = _build_skin_mask(image)
    combined_mask = np.clip(face_mask * skin_mask, 0.0, 1.0)

    # Try color-based detection first (more robust for actual blemishes)
    blemishes = _detect_blemishes_by_color(image, skin_mask, face_mask)
    print(f"DEBUG: Color-based detection found {len(blemishes)} blemishes")
    
    # Create heatmap from blemishes
    heatmap = np.zeros((image_height, image_width), dtype=np.float32)
    
    for blemish in blemishes:
        cx = blemish['cx']
        cy = blemish['cy']
        severity = float(blemish['severity'])
        
        # Create Gaussian blob centered at blemish with intensity based on severity
        y_indices, x_indices = np.ogrid[:image_height, :image_width]
        distance = np.sqrt((x_indices - cx) ** 2 + (y_indices - cy) ** 2)
        
        # Gaussian with sigma=50 for smooth gradient
        gaussian_blob = severity * np.exp(-(distance ** 2) / (2 * 50 ** 2))
        heatmap = np.maximum(heatmap, gaussian_blob)
    
    # Apply face/skin mask to heatmap
    heatmap *= face_mask * skin_mask
    
    # Gaussian blur for extra smoothing
    heatmap = cv2.GaussianBlur(heatmap, (61, 61), 0)
    
    # Normalize heatmap to [0, 1]
    heatmap_max = heatmap.max()
    if heatmap_max > 0:
        heatmap = heatmap / heatmap_max
    
    print(f"DEBUG: Heatmap generated, min={heatmap.min():.3f}, max={heatmap.max():.3f}, mean={heatmap.mean():.3f}")
    
    # Create overlay with gradient colors based on heatmap
    overlay_rgba = np.zeros((image_height, image_width, 4), dtype=np.uint8)
    
    # Apply heatmap as base (green for healthy, ramping to red for problems)
    for y in range(image_height):
        for x in range(image_width):
            if heatmap[y, x] > 0.01:  # Only render where heatmap has significant value
                severity = heatmap[y, x]
                r, g, b = _get_severity_color(severity)
                alpha = int(severity * HEATMAP_ALPHA_MAX)
                overlay_rgba[y, x, 0] = r
                overlay_rgba[y, x, 1] = g
                overlay_rgba[y, x, 2] = b
                overlay_rgba[y, x, 3] = alpha
    
    detections_found = (overlay_rgba[..., 3] > 0).any()

    if not detections_found:
        print(f"DEBUG: No detections found, returning None")
        return None

    print(f"DEBUG: Final overlay: non-zero alpha pixels = {(overlay_rgba[..., 3] > 0).sum()}, RGB values: min={overlay_rgba[..., :3].min()}, max={overlay_rgba[..., :3].max()}")
    
    overlay_image = Image.fromarray(overlay_rgba, mode="RGBA")
    composite = Image.alpha_composite(image.convert("RGBA"), overlay_image)
    result = _to_png_data_url(composite)
    print(f"DEBUG: Overlay generated successfully, result length={len(result) if result else 0}")
    return result


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
        print(f"DEBUG: Haar face bbox: x={x}, y={y}, w={w}, h={h}, expanded: left={left}, top={top}, right={right}, bottom={bottom}")
        mask[top:bottom, left:right] = 1.0
    else:
        print(f"DEBUG: Haar face detection failed, using fallback ellipse")
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
        if HEATMAP_BACKEND == "yolo_acne" and condition_key == "acne":
            return _build_acne_yolo_heatmap_overlay(image)
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
        heatmap_target = label
        if HEATMAP_BACKEND == "yolo_acne":
            # If the main visual indicator is acne localization, always generate the acne overlay
            # even when the top label is "redness" or "under_eye_bags".
            heatmap_target = "acne"

        heatmap_overlay_data_url = (
            _safe_build_heatmap_overlay(image, heatmap_target) if HEATMAP_ENABLED else None
        )

        per_angle[angle] = {
            "label": label,
            "confidence": confidence,
            "scores": scores,
            "heatmap_target": heatmap_target,
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
    
    print(f"[analyze_set] Returning response with overall_scores: {overall_scores}")
    print(f"[analyze_set] Per-angle scores: {[(angle, scores['scores']) for angle, scores in per_angle.items()]}")

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
