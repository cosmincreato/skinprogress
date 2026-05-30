import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from unittest.mock import patch, MagicMock
import importlib


def _reload_app():
    """Re-import app so module-level globals reset between tests."""
    import app as _app
    _app._face_landmarker = None
    return _app


def test_get_face_landmarker_returns_none_when_download_fails():
    """If model download raises, _get_face_landmarker returns None (no crash)."""
    app = _reload_app()
    with patch("app.hf_hub_download", side_effect=Exception("network error")):
        with patch("urllib.request.urlopen", side_effect=Exception("offline")):
            with patch("os.path.exists", return_value=False):
                result = app._get_face_landmarker()
    assert result is None


def test_get_face_landmarker_returns_landmarker_on_success():
    """When download and init succeed, returns a non-None object."""
    app = _reload_app()
    fake_landmarker = MagicMock()

    with patch("app.hf_hub_download", return_value="/tmp/face_landmarker.task"):
        with patch("mediapipe.tasks.python.BaseOptions"):
            with patch("mediapipe.tasks.python.vision.FaceLandmarkerOptions"):
                with patch(
                    "mediapipe.tasks.python.vision.FaceLandmarker.create_from_options",
                    return_value=fake_landmarker,
                ):
                    result = app._get_face_landmarker()

    assert result is fake_landmarker


def test_get_face_landmarker_is_cached():
    """Second call returns same instance without re-downloading."""
    app = _reload_app()
    fake_landmarker = MagicMock()
    app._face_landmarker = fake_landmarker

    with patch("app.hf_hub_download") as mock_dl:
        result = app._get_face_landmarker()

    mock_dl.assert_not_called()
    assert result is fake_landmarker


def _make_fake_landmarker(normalized_points):
    """
    Returns a mock FaceLandmarker whose detect() returns face_landmarks
    built from the given [(x_norm, y_norm), ...] list.
    If normalized_points is None, returns empty face_landmarks.
    """
    fake_result = MagicMock()
    if normalized_points is None:
        fake_result.face_landmarks = []
    else:
        fake_lms = []
        for x_norm, y_norm in normalized_points:
            lm = MagicMock()
            lm.x = x_norm
            lm.y = y_norm
            fake_lms.append(lm)
        fake_result.face_landmarks = [fake_lms]

    landmarker = MagicMock()
    landmarker.detect.return_value = fake_result
    return landmarker


def test_face_landmarks_xy_returns_none_when_landmarker_is_none():
    """If _get_face_landmarker returns None, _face_landmarks_xy returns None."""
    import numpy as np
    from PIL import Image
    app = _reload_app()
    image = Image.fromarray(np.full((100, 100, 3), 128, dtype=np.uint8))
    with patch("app._get_face_landmarker", return_value=None):
        result = app._face_landmarks_xy(image)
    assert result is None


def test_face_landmarks_xy_returns_none_when_no_face_detected():
    """If face_landmarks is empty, returns None."""
    import numpy as np
    from PIL import Image
    app = _reload_app()
    fake_lmk = _make_fake_landmarker(None)
    with patch("app._get_face_landmarker", return_value=fake_lmk):
        result = app._face_landmarks_xy(
            Image.fromarray(np.full((100, 100, 3), 128, dtype=np.uint8))
        )
    assert result is None


def test_face_landmarks_xy_converts_normalized_to_pixel_coords():
    """Normalized (0.5, 0.5) on a 200x100 image -> pixel (100, 50)."""
    import numpy as np
    from PIL import Image
    app = _reload_app()
    fake_lmk = _make_fake_landmarker([(0.5, 0.5), (1.0, 0.0)])
    image = Image.fromarray(np.full((100, 200, 3), 128, dtype=np.uint8))  # w=200, h=100
    with patch("app._get_face_landmarker", return_value=fake_lmk):
        result = app._face_landmarks_xy(image)
    assert result is not None
    assert result.shape == (2, 2)
    assert result[0, 0] == 100   # x = 0.5 * 200 = 100
    assert result[0, 1] == 50    # y = 0.5 * 100 = 50
    assert result[1, 0] == 199   # x = 1.0 * 200 = 200, clipped to 199
    assert result[1, 1] == 0     # y = 0.0 * 100 = 0
