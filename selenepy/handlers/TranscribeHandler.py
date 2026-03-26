import io
import json

import tornado
from jupyter_server.base.handlers import APIHandler

from selenepy.utils.logging import get_logger
from selenepy.utils.openai_config import resolve_openai_api_key
from selenepy.utils.utils import handle_exceptions

LOGGER = get_logger(__name__)

try:
    from langfuse.openai import OpenAI
except (ImportError, AttributeError):
    from openai import OpenAI


class TranscribeHandler(APIHandler):
    @tornado.web.authenticated
    @handle_exceptions
    def post(self) -> None:
        body = self.request.body_arguments
        if "audio" not in self.request.files:
            self.set_status(400)
            self.finish(json.dumps({"error": "audio is required"}))
            return

        audio_info = self.request.files["audio"][0]
        audio_data = audio_info["body"]
        filename = audio_info["filename"]
        content_type = audio_info["content_type"]

        if not audio_data:
            self.set_status(400)
            self.finish(json.dumps({"error": "audio file is empty"}))
            return

        # try:
        #     os.makedirs("audiodumps", exist_ok=True)
        #     _dump_path = os.path.join("audiodumps", f"audio-{time.time_ns()}" + ".webm")
        #     with open(_dump_path, "wb") as _f:
        #         _f.write(audio_data)
        # except Exception as _e:
        #     LOGGER.warning(f"Failed to save debug audio: {_e}")

        LOGGER.info(
            f"Received audio file: {filename} ({content_type}, {len(audio_data)} bytes)",
        )

        api_key = resolve_openai_api_key(body_arguments=body)
        if not api_key:
            self.set_status(400)
            self.finish(
                json.dumps(
                    {
                        "error": (
                            "OpenAI API key is required. Provide openaiApiKey "
                            "from the frontend or set OPENAI_API_KEY in the environment."
                        )
                    }
                )
            )
            return

        try:
            client = OpenAI(api_key=api_key)

            audio_file = io.BytesIO(audio_data)
            audio_file.name = filename or "audio.webm"

            transcript = client.audio.transcriptions.create(
                model="whisper-1", file=audio_file
            )
            LOGGER.info(f"Transcript: {transcript.text}")

            self.finish(json.dumps({"text": transcript.text}))
        except Exception as e:
            LOGGER.error(f"Transcription error: {str(e)}")
            self.set_status(500)
            self.finish(json.dumps({"error": f"Transcription failed: {str(e)}"}))
