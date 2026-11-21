#!/bin/sh
# Usage: make_uploads.sh [id ...]. Set BF_MODELS to the model directory.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
M=${BF_MODELS:-$HOME/Desktop/BellFoundry-Modelle}
BLENDER=${BLENDER:-/opt/homebrew/bin/blender}
OUT=$M/mixamo-upload
WORK=$M/upload-work
mkdir -p "$OUT" "$WORK"

run() {
  id=$1; src=$2; shift 2
  "$BLENDER" -b --factory-startup --disable-autoexec -P "$HERE/mixamo_upload.py" -- \
    --in "$src" --id "$id" --outdir "$OUT" --workdir "$WORK" "$@" > "$WORK/$id.log" 2>&1
  if grep -q UPLOAD_RESULT "$WORK/$id.log"; then grep UPLOAD_RESULT "$WORK/$id.log"
  else echo "FAILED $id (see $WORK/$id.log)"; tail -5 "$WORK/$id.log"; fi
}

sel() { [ -z "$IDS" ] && return 0; case " $IDS " in *" $1 "*) return 0;; esac; return 1; }
IDS="$*"

sel stelae      && run stelae      "$M/sketchfab/stelae_knight.glb" --remove '^Object_7$' &
sel blacksmith  && run blacksmith  "$M/sketchfab/blacksmith_4k.glb" --remove 'Long_hammer' &
sel savior      && run savior      "$M/sketchfab/the_savior__dark_fantasy_paladin.glb" &
sel brokenvow   && run brokenvow   "$M/sketchfab/the_broken_vow__dark_fantasy_flail_knight.glb" &
wait
sel warrior     && run warrior     "$M/sketchfab/warrior_-_game_ready__free__fixed_a_bug.glb" --drop-detached &
sel undead      && run undead      "$M/sketchfab/undead_knight_low-poly.glb" --remove '^(Claymore_Handle|Claymore_Blade|Arrow_Stub|Arrow_Feather|Cape)$' &
sel paleknight  && run paleknight  "$M/sketchfab/pale_knight_animated.glb" --remove '^knight_sword$' --rotx 90 &
sel heavyknight && run heavyknight "$M/sketchfab/heavy_knight.glb" --remove '^(blade|crossGuard|grip|guard0[12])$' --pose pose &
wait
sel oga_knight  && run oga_knight  "$M/opengameart/Knight_0.blend" --remove '^(Arrow|Shield|Sword)$' --rotz 180 &
sel executioner && run executioner "$M/opengameart/exec_extract/exec_rigged.blend" &
sel hooded      && run hooded      "$M/sketchfab/terrifying_hooded_horror_woman.glb" &
sel infected    && run infected    "$M/fab/the_infected_knight.glb" --rotz 45 &
sel darkknight_f && run darkknight_f "$M/fab/x_darkknight_f/Female_Dark_Knight.fbx" --remove '^Sword$' &
sel masked      && run masked      "$M/fab/masked_knight.glb" --cut-capsule=-0.38,-0.05,0.86,-0.21,-0.60,1.86,0.07,0.86 &
wait
