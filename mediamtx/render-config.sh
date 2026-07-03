#!/bin/bash
# Renders mediamtx.yml.template -> mediamtx.yml, substituting the host's
# real reachable IP/hostname so WebRTC ICE candidates work for external
# clients (the mediamtx image has no shell, so this can't be done inside
# the container -- see the comment in the template).
set -euo pipefail

cd "$(dirname "$0")"

HOST="${PUBLIC_HOST:-}"
if [ -z "$HOST" ]; then
    HOST=$(hostname -I 2>/dev/null | awk '{print $1}')
fi
if [ -z "$HOST" ]; then
    echo "render-config.sh: could not determine a host IP; set PUBLIC_HOST explicitly" >&2
    exit 1
fi

sed "s/__PUBLIC_HOST__/${HOST}/" mediamtx.yml.template > mediamtx.yml
echo "render-config.sh: wrote mediamtx.yml with webrtcAdditionalHosts=[${HOST}]"
