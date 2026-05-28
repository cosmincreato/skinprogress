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
    assert w == 100   # 150 - 50
    assert h == 140   # 200 - 60


def test_falls_back_to_haar_when_mediapipe_returns_none():
    """When MediaPipe finds no landmarks, Haar cascade is tried."""
    from app import _detect_face_bbox

    with patch("app._face_landmarks_xy", return_value=None):
        # Blank image → Haar also finds nothing → None
        result = _detect_face_bbox(make_solid_image())

    assert result is None
