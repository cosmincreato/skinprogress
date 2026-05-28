import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
from unittest.mock import patch, MagicMock
from PIL import Image as PILImage


def blank_image(w=64, h=64):
    return PILImage.fromarray(np.full((h, w, 3), 128, dtype=np.uint8))


def test_get_condition_color_acne_low_severity():
    from app import _get_condition_color
    r, g, b = _get_condition_color("acne", 0.0)
    assert r == 255 and g >= 190 and b >= 190  # light pink


def test_get_condition_color_acne_high_severity():
    from app import _get_condition_color
    r, g, b = _get_condition_color("acne", 1.0)
    assert r < 230 and g < 30 and b < 30  # deep red


def test_get_condition_color_redness():
    from app import _get_condition_color
    r, g, b = _get_condition_color("redness", 0.5)
    assert r > g and g > b  # orange: red dominates, blue is lowest


def test_get_condition_color_under_eye_bags():
    from app import _get_condition_color
    r, g, b = _get_condition_color("under_eye_bags", 0.5)
    assert b > r  # purple: blue dominates


def test_composite_overlay_returns_string_or_original():
    """composite function returns a data URL (str) or None, never raises."""
    from app import _build_composite_heatmap_overlay_and_metadata
    img = blank_image()
    with patch("app._face_landmarks_xy", return_value=None):
        result, detections = _build_composite_heatmap_overlay_and_metadata(img)
    assert isinstance(detections, list)
    # result is either a data URL string or None
    assert result is None or result.startswith("data:image/")
