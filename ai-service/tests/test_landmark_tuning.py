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


def test_nostril_mask_smaller_than_silhouette():
    """Nostril mask covers less area than the full face silhouette."""
    from app import _build_face_silhouette_mask, _build_nostril_exclusion_mask
    pts = make_realistic_pts()
    silhouette = _build_face_silhouette_mask(640, 480, pts)
    nostril = _build_nostril_exclusion_mask(640, 480, pts)
    assert nostril.sum() < silhouette.sum()


def test_silhouette_mask_no_crash_on_degenerate_pts():
    """All-same-position landmark points must not crash and return a valid float mask."""
    from app import _build_face_silhouette_mask
    pts = np.zeros((478, 2), dtype=np.int32)
    mask = _build_face_silhouette_mask(100, 100, pts)
    assert mask.shape == (100, 100)
    assert mask.dtype == np.float32
    assert 0.0 <= mask.min() and mask.max() <= 1.0
