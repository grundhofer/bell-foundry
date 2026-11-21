#!/bin/bash
# Usage: make_proxies.sh [id ...]. Builds rigging proxies and previews.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
M=${BF_MODELS:-$HOME/Desktop/BellFoundry-Modelle}
BLENDER=${BLENDER:-/opt/homebrew/bin/blender}
U=$M/mixamo-upload
IDS=${*:-"blacksmith savior brokenvow darkknight_f warrior paleknight oga_knight executioner hooded infected heavyknight undead masked"}
for id in $IDS; do
  case $id in
    masked) opts="0.012 20000 0.03";;   # Thicken open shells before remeshing.
    *) opts="";;
  esac
  "$BLENDER" -b --factory-startup -P "$HERE/make_proxy.py" -- "$U/$id.fbx" "$U/${id}_proxy.fbx" $opts 2>&1 | grep -E 'PROXY|Error'
  "$BLENDER" -b --factory-startup -P "$HERE/preview_glb.py" -- "$U/${id}_proxy.fbx" "$U/${id}_proxy.png" >/dev/null 2>&1
done
