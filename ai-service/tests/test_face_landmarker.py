import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from unittest.mock import patch, MagicMock
import importlib


def _reload_app():
    """Re-import app so module-level globals reset between tests."""
    import app as _app
    _app._face_landmarker = None
    _app._face_landmarker_initialized = False
    return _app


def test_get_face_landmarker_returns_none_when_download_fails():
    """If model download raises, _get_face_landmarker returns None (no crash)."""
    app = _reload_app()
    with patch("app.hf_hub_download", side_effect=Exception("network error")):
        with patch("urllib.request.urlretrieve", side_effect=Exception("offline")):
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
    app._face_landmarker_initialized = True

    with patch("app.hf_hub_download") as mock_dl:
        result = app._get_face_landmarker()

    mock_dl.assert_not_called()
    assert result is fake_landmarker
