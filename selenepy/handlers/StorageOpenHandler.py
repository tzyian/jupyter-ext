import json
import os
import subprocess
import sys

import tornado
from jupyter_server.base.handlers import APIHandler

from selenepy.utils.logging import get_logger

LOGGER = get_logger(__name__)


class StorageOpenHandler(APIHandler):
    """Open the local storage directory (e.g., ~/.selenepy) in the OS file manager.

    This runs on the server where Jupyter is running and therefore will open
    the directory on the user's machine when the server is local.
    """

    @tornado.web.authenticated
    def post(self) -> None:
        try:
            from ..utils.paths import get_selenepy_dir

            storage_path = str(get_selenepy_dir())

            try:
                # Cross-platform open
                if os.name == "nt":
                    os.startfile(storage_path)
                elif sys.platform == "darwin":
                    subprocess.Popen(["open", storage_path])
                else:
                    subprocess.Popen(["xdg-open", storage_path])
            except Exception as e:
                LOGGER.error("Failed to open storage directory: %s", e, exc_info=e)
                self.set_status(500)
                self.finish(json.dumps({"error": str(e)}))
                return

            self.finish(json.dumps({"path": storage_path}))
        except Exception as err:
            LOGGER.error("Error in StorageOpenHandler: %s", err, exc_info=err)
            self.set_status(500)
            self.finish(json.dumps({"error": str(err)}))
