import sys, os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
from unittest.mock import patch
from PIL import Image as PILImage


def make_realistic_pts(w=640, h=480):
    """478 landmark points simulating a face occupying ~50% of the image."""
    pts = np.zeros((478, 2), dtype=np.int32)
    for i in range(478):
        pts[i, 0] = int(np.clip(w * 0.25 + (i % 20) * (w * 0.5 / 20), 0, w - 1))
        pts[i, 1] = int(np.clip(h * 0.15 + (i // 20) * (h * 0.65 / 24), 0, h - 1))
    return pts


def test_face_silhouette_mask_nonzero_for_valid_pts():
    """Silhouette mask must have non-zero pixels when given realistic landmarks."""
    from app import _build_face_silhouette_mask

    pts = make_realistic_pts()
    mask = _build_face_silhouette_mask(640, 480, pts)
    assert mask.shape == (480, 640)
    assert mask.max() > 0


def test_nostril_exclusion_mask_nonzero_for_valid_pts():
    """Nostril exclusion mask must have non-zero pixels with realistic landmarks."""
    from app import _build_nostril_exclusion_mask

    pts = make_realistic_pts()
    mask = _build_nostril_exclusion_mask(640, 480, pts)
    assert mask.shape == (480, 640)
    assert mask.max() > 0


def test_nostril_mask_is_valid_float_mask():
    """Nostril exclusion mask is a valid float32 mask in [0, 1]."""
    from app import _build_nostril_exclusion_mask

    pts = make_realistic_pts()
    mask = _build_nostril_exclusion_mask(640, 480, pts)
    assert mask.shape == (480, 640)
    assert mask.dtype == np.float32
    assert 0.0 <= mask.min() and mask.max() <= 1.0
    assert mask.max() > 0


def test_silhouette_mask_no_crash_on_degenerate_pts():
    """All-same-position landmark points must not crash and return a valid float mask."""
    from app import _build_face_silhouette_mask

    pts = np.zeros((478, 2), dtype=np.int32)
    mask = _build_face_silhouette_mask(100, 100, pts)
    assert mask.shape == (100, 100)
    assert mask.dtype == np.float32
    assert 0.0 <= mask.min() and mask.max() <= 1.0


def test_face_focus_mask_uses_landmarks_when_available():
    """When _face_landmarks_xy returns pts, mask uses silhouette polygon."""
    pts = make_realistic_pts(640, 480)
    img = PILImage.fromarray(np.full((480, 640, 3), 128, dtype=np.uint8))
    with patch("app._face_landmarks_xy", return_value=pts):
        from app import _build_face_focus_mask

        mask = _build_face_focus_mask(640, 480, img)
    assert mask.shape == (480, 640)
    assert mask.max() > 0


def test_face_focus_mask_falls_back_when_no_landmarks():
    """When _face_landmarks_xy returns None, fallback ellipse is used."""
    img = PILImage.fromarray(np.full((480, 640, 3), 128, dtype=np.uint8))
    with patch("app._face_landmarks_xy", return_value=None):
        from app import _build_face_focus_mask

        mask = _build_face_focus_mask(640, 480, img)
    assert mask.shape == (480, 640)
    assert mask.max() > 0


def test_get_face_focus_bounds_uses_silhouette_when_landmarks_available():
    """Bounds derived from silhouette indices min/max when landmarks available."""
    from app import _get_face_focus_bounds, FACE_SILHOUETTE_INDICES

    pts = make_realistic_pts(640, 480)
    img = PILImage.fromarray(np.full((480, 640, 3), 128, dtype=np.uint8))
    with patch("app._face_landmarks_xy", return_value=pts):
        left, top, right, bottom = _get_face_focus_bounds(640, 480, img)
    expected_left = int(np.clip(pts[FACE_SILHOUETTE_INDICES, 0].min(), 0, 639))
    expected_right = int(np.clip(pts[FACE_SILHOUETTE_INDICES, 0].max(), 0, 639))
    assert left == expected_left
    assert right == expected_right
    assert right > left
    assert bottom > top


def test_get_face_focus_bounds_falls_back_when_no_landmarks():
    """Returns valid bounds even when _face_landmarks_xy returns None."""
    from app import _get_face_focus_bounds

    img = PILImage.fromarray(np.full((480, 640, 3), 128, dtype=np.uint8))
    with patch("app._face_landmarks_xy", return_value=None):
        left, top, right, bottom = _get_face_focus_bounds(640, 480, img)
    assert right > left
    assert bottom > top
    assert left >= 0 and top >= 0
    assert right <= 640 and bottom <= 480
