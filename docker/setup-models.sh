#!/usr/bin/env bash

set -euo pipefail

docker exec heita_ollama ollama pull llama3.2
docker exec heita_ollama ollama pull mxbai-embed-large
docker run --rm --network host minio/mc alias set local http://127.0.0.1:9000 minioadmin minioadmin
docker run --rm --network host minio/mc mb --ignore-existing local/heita-files
