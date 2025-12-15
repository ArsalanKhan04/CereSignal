This directory stores generated topomap PNGs created by the inference task.
Files are named as <recording_basename>_topomap.png and are served via the endpoint:

GET /api/v1/signals/files/{file_id}/topomap

If this directory is empty it means no topomap has been generated for a file yet.