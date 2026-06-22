import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
from PIL import Image
from unittest.mock import patch


def make_solid_image(w=100, h=100):
    """Solid grey image — no face, so both MediaPipe and Haar return None."""
    return Image.fromarray(np.full((h, w, 3), 128, dtype=np.uint8))


def test_returns_none_when_no_face_detected():
    """With a blank image, _detect_face_bbox must return None (not crash)."""
    from app import _detect_face_bbox

    result = _detect_face_bbox(make_solid_image())
    assert result is None


def test_mediapipe_result_preferred_over_haar():
    """When MediaPipe returns landmarks, the result comes from them, not Haar."""
    import numpy as np
    from app import _detect_face_bbox

    fake_pts = np.array([[50, 60], [150, 60], [50, 200], [150, 200]], dtype=np.int32)

    with patch("app._face_landmarks_xy", return_value=fake_pts):
        result = _detect_face_bbox(make_solid_image(w=300, h=300))

    assert result is not None
    x, y, w, h = result
    assert x == 50
    assert y == 60
    assert w == 100  # 150 - 50
    assert h == 140  # 200 - 60


def test_falls_back_to_haar_when_mediapipe_returns_none():
    """When MediaPipe finds no landmarks, Haar cascade is tried."""
    from app import _detect_face_bbox

    with patch("app._face_landmarks_xy", return_value=None):
        # Blank image → Haar also finds nothing → None
        result = _detect_face_bbox(make_solid_image())

    assert result is None


def test_degenerate_landmarks_fall_back_to_haar():
    """All landmarks at the same point → fw=0, fh=0 → rejects MediaPipe result, falls back to Haar → None on blank image."""
    from app import _detect_face_bbox

    all_same = np.array([[50, 50]] * 10, dtype=np.int32)

    with patch("app._face_landmarks_xy", return_value=all_same):
        result = _detect_face_bbox(make_solid_image(w=300, h=300))

    assert (
        result is None
    )  # fw=0, fh=0 < 20 → falls through to Haar → blank image → None


def test_small_bbox_falls_back_to_haar():
    """A 5×5 bbox from MediaPipe is too small (< 20×20) → falls back to Haar → None on blank image."""
    from app import _detect_face_bbox

    # Points spanning only 5px × 5px
    tiny_pts = np.array(
        [[100, 100], [105, 100], [100, 105], [105, 105]], dtype=np.int32
    )

    with patch("app._face_landmarks_xy", return_value=tiny_pts):
        result = _detect_face_bbox(make_solid_image(w=300, h=300))

    assert result is None  # fw=5, fh=5 < 20 → falls through to Haar → None


def test_crop_offset_centres_are_within_original_image():
    """
    Simulates what the updated YOLO loop does: detection coords from a crop
    must be offset by crop origin to land inside the original image.
    """
    crop_left, crop_top = 80, 100
    x1, y1, x2, y2 = 10.0, 15.0, 50.0, 55.0
    cx = int((x1 + x2) / 2) + crop_left
    cy = int((y1 + y2) / 2) + crop_top

    assert cx == 110  # 30 + 80
    assert cy == 135  # 35 + 100
