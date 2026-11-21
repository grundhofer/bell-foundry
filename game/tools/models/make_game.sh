#!/bin/sh
# Usage: make_game.sh [id ...]. Models and previews are under BF_MODELS.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
GAME=$(cd "$HERE/../.." && pwd)
M=${BF_MODELS:-$HOME/Desktop/BellFoundry-Modelle}
BLENDER=${BLENDER:-/opt/homebrew/bin/blender}
OUT=$GAME/assets/models/alt
REP=$HERE/reports
LOGS=$M/game-logs
PREV=$M/game-previews
mkdir -p "$OUT" "$REP" "$LOGS" "$PREV"
IDS="$*"
sel() { [ -z "$IDS" ] && return 0; case " $IDS " in *" $1 "*) return 0;; esac; return 1; }

run() {
  id=$1; src=$2; shift 2
  if [ ! -f "$src" ]; then echo "SKIP $id (no source: $src)"; return; fi
  "$BLENDER" -b --factory-startup --disable-autoexec -P "$HERE/to_game.py" -- \
    --in "$src" --id "$id" --out "$OUT/$id.glb" --report "$REP/$id.json" "$@" > "$LOGS/$id.log" 2>&1
  if grep -q GAME_RESULT "$LOGS/$id.log"; then
    grep GAME_RESULT "$LOGS/$id.log"; grep '^WARNING [^:]' "$LOGS/$id.log"
    "$BLENDER" -b --factory-startup --disable-autoexec -P "$HERE/preview_glb.py" -- "$OUT/$id.glb" "$PREV/$id.png" > "$LOGS/$id.preview.log" 2>&1
  else echo "FAILED $id (see $LOGS/$id.log)"; grep -A3 Traceback "$LOGS/$id.log" | tail -4; fi
}
MX="$M/mixamo"; MR="$M/mixamo-rigged"; W="$M/upload-work"
stock() { run "$@" --metallic 0; }
auto() { id=$1; shift; run "$id" "$MR/$id.fbx" --materials-from "$W/$id.blend" "$@"; }

sel paladin && stock paladin "$MX/Paladin J Nordstrom.fbx" &
sel maria   && stock maria   "$MX/Maria WProp J J Ong.fbx" --remove '^Maria_sword$' &
sel uriel   && stock uriel   "$MX/Uriel A Plotexia.fbx" &
sel demon   && stock demon   "$MX/Demon T Wiezzorek.fbx" &
wait
sel warrok  && stock warrok  "$MX/Warrok W Kurniawan.fbx" &
sel vampire && stock vampire "$MX/Vampire A Lusth.fbx" &
sel mutant  && stock mutant  "$MX/Mutant.fbx" &
sel sculpture && run sculpture "$M/sketchfab/medieval_knight_sculpture_4k.glb" &
wait
# Transfer weights from the rigged proxy to the original mesh.
proxy() { id=$1; shift; run "$id" "$W/$id.blend" --proxy "$MR/${id}_proxy.fbx" --proxy-src "$M/mixamo-upload/${id}_proxy.fbx" "$@"; }
extra() {
  case $1 in
    executioner) T="$M/opengameart/exec_extract/tex"; echo "--build-textures exec_mat=base:$T/diffus2.jpg,normal:$T/normal.jpg,spec:$T/spec.jpg,ao:$T/ao.jpg";;
    darkknight_f) echo "--basecolor Female_Dark_Knight_Hair=$M/fab/x_darkknight_f/Textures/Female_Dark_Knight_Hair_Color.png";;
  esac
}
for id in stelae blacksmith brokenvow warrior undead paleknight heavyknight oga_knight executioner hooded infected darkknight_f; do
  if sel $id; then
    if [ -f "$MR/$id.fbx" ]; then auto $id $(extra $id) &
    elif [ -f "$MR/${id}_proxy.fbx" ]; then proxy $id $(extra $id) &
    fi
  fi
done
wait
sel q_knight && [ -f "$M/quaternius/work/q_knight.blend" ] && run q_knight "$M/quaternius/work/q_knight.blend" --rig quaternius
node "$HERE/check_glb.mjs" "$OUT"/*.glb
python3 -I "$HERE/gen_roster.py"
