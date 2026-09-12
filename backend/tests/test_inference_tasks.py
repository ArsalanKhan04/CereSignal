"""
Celery task and dispatch tests.

Everything here runs without a broker, without torch and without model weights.
inference/infer.py imports torch, openai and everything under external/ lazily, so
the AI-disabled branches and the preprocessing chain are reachable on their own —
which is exactly what a no-AI deployment relies on.

Tasks are invoked directly (``infer.run(...)``) rather than through .delay(), so no
Redis connection is ever attempted.
"""

from unittest.mock import MagicMock

import pytest

from app.services.inference_service import InferenceService
from inference.infer import generate_report, infer, preprocess_edf


@pytest.fixture
def no_ai(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "AI_INFERENCE_ENABLED", False)
    return settings


@pytest.fixture
def stored_edf(local_storage, tiny_edf):
    """Put the synthesized EDF into the storage backend the tasks read from."""
    from app.services.storage_service import SIGNALS_BUCKET

    with open(tiny_edf["path"], "rb") as handle:
        local_storage.upload(SIGNALS_BUCKET, "signals/tiny.edf", handle.read())
    return "signals/tiny.edf"


class TestInferWithAiDisabled:
    """
    The manual-entry-only path: validate the EDF is readable, then hand it over for
    a manual normal/abnormal label. No models, no LLM.
    """

    def test_it_returns_pending_review(self, no_ai, stored_edf):
        result = infer.run(stored_edf)
        assert result["result"] == "pending_review"

    def test_it_flags_that_ai_was_disabled(self, no_ai, stored_edf):
        assert infer.run(stored_edf)["ai_enabled"] is False

    def test_it_queues_no_report_task(self, no_ai, stored_edf):
        assert infer.run(stored_edf)["report_task_id"] is None

    def test_it_produces_no_events_or_focus_points(self, no_ai, stored_edf):
        result = infer.run(stored_edf)
        assert result["events"] == {}
        assert result["focus_points"] == []

    def test_it_still_reads_the_file_metadata(self, no_ai, stored_edf, tiny_edf):
        result = infer.run(stored_edf)

        assert result["file_info"]["channels"] == tiny_edf["n_channels"]
        assert result["file_info"]["duration_seconds"] > 0

    def test_it_imports_no_torch(self, no_ai, stored_edf, monkeypatch):
        # A no-AI deployment installs neither torch nor openai. Make importing them
        # fail loudly, then confirm the task still completes.
        import builtins

        real_import = builtins.__import__

        def guarded(name, *args, **kwargs):
            if name.split(".")[0] in {"torch", "openai"}:
                raise ImportError(f"{name} must not be imported when AI is disabled")
            return real_import(name, *args, **kwargs)

        monkeypatch.setattr(builtins, "__import__", guarded)

        assert infer.run(stored_edf)["result"] == "pending_review"


class TestGenerateReportWithAiDisabled:
    def test_it_returns_blank_text_for_manual_entry(self, no_ai):
        result = generate_report.run(0.5, {}, "")

        assert result == {"factual_report": "", "impression": "", "ai_enabled": False}

    def test_it_does_not_reach_openai(self, no_ai, monkeypatch):
        # Guards a re-queued legacy task ID from pulling openai into a worker that
        # does not have it installed.
        import inference.infer as infer_module

        def explode(*args, **kwargs):
            raise AssertionError("_generate_report must not be called when AI is off")

        monkeypatch.setattr(infer_module, "_generate_report", explode)

        generate_report.run(0.9, {"Frontal": {}}, "PDR 9 Hz")


class TestGenerateReportBackend:
    """
    OpenAI when OPENAI_API_KEY is set, otherwise Ollama through the same client.
    openai itself is stubbed: CI does not install it.
    """

    @pytest.fixture
    def openai_stub(self, monkeypatch):
        import sys
        import types

        client = MagicMock()
        client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(
                content='{"factual_report": "Alpha background.", "impression": "Normal EEG."}'
            ))]
        )
        module = types.SimpleNamespace(OpenAI=MagicMock(return_value=client))
        monkeypatch.setitem(sys.modules, "openai", module)
        return module

    @pytest.fixture
    def settings(self, monkeypatch):
        from app.core.config import settings

        monkeypatch.setattr(settings, "OPENAI_API_KEY", "")
        monkeypatch.setattr(settings, "OLLAMA_MODEL", "")
        return settings

    def _installed(self, openai_stub, *models):
        client = openai_stub.OpenAI.return_value
        client.models.list.return_value = [
            MagicMock(id=model_id, created=created) for model_id, created in models
        ]
        return client

    def _model_used(self, openai_stub):
        return openai_stub.OpenAI.return_value.chat.completions.create.call_args.kwargs["model"]

    def test_with_a_key_it_calls_openai(self, openai_stub, settings, monkeypatch):
        from inference.infer import _generate_report

        monkeypatch.setattr(settings, "OPENAI_API_KEY", "sk-test")

        result = _generate_report(50.0, {}, "PDR 9 Hz")

        openai_stub.OpenAI.assert_called_once_with(api_key="sk-test")
        assert self._model_used(openai_stub) == settings.OPENAI_MODEL
        # gpt-4o-mini rejects reasoning_effort.
        create = openai_stub.OpenAI.return_value.chat.completions.create
        assert "reasoning_effort" not in create.call_args.kwargs
        assert result == ("Alpha background.", "Normal EEG.")

    def test_without_a_key_a_pinned_ollama_model_is_used(
        self, openai_stub, settings, monkeypatch
    ):
        from inference.infer import _generate_report

        monkeypatch.setattr(settings, "OLLAMA_MODEL", "llama3.2")

        result = _generate_report(50.0, {}, "PDR 9 Hz")

        assert openai_stub.OpenAI.call_args.kwargs["base_url"] == settings.OLLAMA_BASE_URL
        assert self._model_used(openai_stub) == "llama3.2"
        openai_stub.OpenAI.return_value.models.list.assert_not_called()
        # A thinking model otherwise spends the whole context reasoning and returns nothing.
        create = openai_stub.OpenAI.return_value.chat.completions.create
        assert create.call_args.kwargs["reasoning_effort"] == "none"
        assert result == ("Alpha background.", "Normal EEG.")

    def test_without_a_model_the_newest_chat_model_is_used(self, openai_stub, settings):
        from inference.infer import _generate_report

        self._installed(
            openai_stub,
            ("qwen3:8b", 100),
            ("nomic-embed-text", 300),
            ("llama3.2", 200),
        )

        _generate_report(50.0, {}, "PDR 9 Hz")

        assert self._model_used(openai_stub) == "llama3.2"

    def test_with_only_embedding_models_the_report_is_blank(self, openai_stub, settings):
        from inference.infer import _generate_report

        client = self._installed(openai_stub, ("nomic-embed-text", 300))

        assert _generate_report(50.0, {}, "PDR 9 Hz") == ("", "")
        client.chat.completions.create.assert_not_called()

    def test_with_no_models_installed_the_report_is_blank(self, openai_stub, settings):
        from inference.infer import _generate_report

        client = self._installed(openai_stub)

        assert _generate_report(50.0, {}, "PDR 9 Hz") == ("", "")
        client.chat.completions.create.assert_not_called()

    def test_json_without_the_expected_keys_is_blank_not_a_placeholder(
        self, openai_stub, settings
    ):
        from inference.infer import _generate_report

        client = self._installed(openai_stub, ("qwen3:8b", 100))
        client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content='{"summary": "off-format"}'))]
        )

        # "invalid" would reach report-status as a finished report and be shown to
        # the doctor as the report text.
        assert _generate_report(50.0, {}, "PDR 9 Hz") == ("", "")

    def test_an_unreachable_llm_leaves_the_report_blank(self, openai_stub, settings):
        from inference.infer import _generate_report

        client = self._installed(openai_stub, ("qwen3:8b", 100))
        client.chat.completions.create.side_effect = ConnectionError("refused")

        assert _generate_report(50.0, {}, "PDR 9 Hz") == ("", "")


class TestPreprocessEdf:
    def test_a_non_conforming_file_is_converted_and_uploaded(
        self, local_storage, stored_edf, monkeypatch
    ):
        from app.services.storage_service import SIGNALS_BUCKET
        import inference.infer as infer_module

        queued = MagicMock()
        queued.id = "chained-task-id"
        monkeypatch.setattr(infer_module.infer, "delay", MagicMock(return_value=queued))

        result = preprocess_edf.run(stored_edf)

        assert result["stage"] == "preprocessed"
        assert result["processed_file_path"] == "signals/tiny_processed.edf"
        assert result["inference_task_id"] == "chained-task-id"
        # The converted file must actually be in storage for the viewer to plot.
        assert local_storage.download(SIGNALS_BUCKET, "signals/tiny_processed.edf")

    def test_it_chains_inference_with_the_processed_path(
        self, local_storage, stored_edf, monkeypatch
    ):
        import inference.infer as infer_module

        delay = MagicMock(return_value=MagicMock(id="t"))
        monkeypatch.setattr(infer_module.infer, "delay", delay)

        preprocess_edf.run(stored_edf)

        delay.assert_called_once_with("signals/tiny_processed.edf")

    def test_an_already_conforming_file_passes_straight_through(
        self, local_storage, stored_edf, monkeypatch
    ):
        import inference.infer as infer_module

        delay = MagicMock(return_value=MagicMock(id="t"))
        monkeypatch.setattr(infer_module.infer, "delay", delay)
        monkeypatch.setattr(
            "external.edf_preprocess.needs_preprocessing", lambda path: False
        )

        result = preprocess_edf.run(stored_edf)

        # Re-chunking an already-converted file scrambles every channel, so the
        # pass-through branch matters.
        assert result["processed_file_path"] is None
        delay.assert_called_once_with(stored_edf)

    def test_a_conversion_failure_still_chains_with_the_raw_file(
        self, local_storage, stored_edf, monkeypatch
    ):
        import inference.infer as infer_module

        delay = MagicMock(return_value=MagicMock(id="t"))
        monkeypatch.setattr(infer_module.infer, "delay", delay)

        def boom(*args, **kwargs):
            raise RuntimeError("conversion exploded")

        monkeypatch.setattr("external.edf_preprocess.process_edf", boom)

        result = preprocess_edf.run(stored_edf)

        assert result["processed_file_path"] is None
        delay.assert_called_once_with(stored_edf)


class TestGetTaskStatus:
    """
    Maps Celery states onto the shape the frontend polls. A stub AsyncResult keeps
    this away from a broker.
    """

    @pytest.fixture
    def service(self):
        return InferenceService()

    def _stub(self, monkeypatch, **attrs):
        from app.services import inference_service as module

        result = MagicMock(**attrs)
        monkeypatch.setattr(module, "AsyncResult", lambda task_id, app=None: result)
        return result

    def test_pending(self, service, monkeypatch):
        self._stub(monkeypatch, state="PENDING")
        assert service.get_task_status("t")["status"] == "pending"

    def test_progress_carries_the_percentage(self, service, monkeypatch):
        self._stub(monkeypatch, state="PROGRESS", info={"progress": 42})
        status = service.get_task_status("t")
        assert status["status"] == "processing"
        assert status["progress"] == 42

    def test_progress_without_info_defaults_to_zero(self, service, monkeypatch):
        self._stub(monkeypatch, state="PROGRESS", info=None)
        assert service.get_task_status("t")["progress"] == 0

    def test_success_carries_the_result(self, service, monkeypatch):
        self._stub(monkeypatch, state="SUCCESS", result={"result": "normal"})
        status = service.get_task_status("t")
        assert status["status"] == "completed"
        assert status["result"] == {"result": "normal"}

    def test_failure_carries_the_error(self, service, monkeypatch):
        self._stub(monkeypatch, state="FAILURE", info=RuntimeError("boom"))
        status = service.get_task_status("t")
        assert status["status"] == "failed"
        assert "boom" in status["error"]

    def test_an_unrecognised_state_is_reported_as_unknown(self, service, monkeypatch):
        self._stub(monkeypatch, state="RETRY")
        status = service.get_task_status("t")
        assert status["status"] == "unknown"
        assert "RETRY" in status["message"]

    def test_a_broker_error_is_swallowed_into_an_error_status(self, service, monkeypatch):
        from app.services import inference_service as module

        def explode(task_id, app=None):
            raise ConnectionError("redis is down")

        monkeypatch.setattr(module, "AsyncResult", explode)

        status = service.get_task_status("t")

        assert status["status"] == "error"
        assert "redis is down" in status["message"]

    @pytest.mark.parametrize(
        "state, completed",
        [("SUCCESS", True), ("FAILURE", True), ("PENDING", False), ("PROGRESS", False)],
    )
    def test_is_task_completed(self, service, monkeypatch, state, completed):
        self._stub(monkeypatch, state=state, info=None, result=None)
        assert service.is_task_completed("t") is completed

    def test_get_inference_result_returns_the_payload_only_when_complete(
        self, service, monkeypatch
    ):
        self._stub(monkeypatch, state="SUCCESS", result={"result": "abnormal"})
        assert service.get_inference_result("t") == {"result": "abnormal"}

    def test_get_inference_result_is_none_while_pending(self, service, monkeypatch):
        self._stub(monkeypatch, state="PENDING")
        assert service.get_inference_result("t") is None
