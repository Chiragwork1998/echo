#!/usr/bin/env bash
# Encodes the Night Home loop (assets/video/night-home-loop.mp4) from a finished render.
#
#   scripts/encode-night-loop.sh <render.mp4> [source-matrix] [r,g,b]
#
# source-matrix  How <render.mp4> encoded its colour: bt709 (default) or bt601. ffmpeg's default for
#                an RGB-to-yuv420p encode with no flags is bt601, and it leaves no tag to say so.
# r,g,b          Levels (0 to 255, decimals fine) to add to each channel, to land the render's static
#                pixels exactly on the shipped plate. The first render was composited on the lossless
#                master, which the shipped WebP sits +1.6, +1.25, +1.4 levels above.
#
# The first render, v2, was encoded with:  scripts/encode-night-loop.sh echo-night-loop-v2.mp4 bt601 1.6,1.25,1.4
#
# What the flags are for, so that a re-render does not lose them:
#  - BT.709, limited range, explicitly tagged (primaries bt709, transfer iec61966-2-1, which is sRGB,
#    matrix bt709). An untagged file is decoded with whatever matrix a given phone assumes, and the
#    photograph shifts in the fade from the still.
#  - One closed GOP the length of the loop, no B-frames. The player loops by seeking to frame 0, so
#    the shorter the way back to a picture the better: an IDR with nothing to reorder shows at once,
#    and there is no keyframe in the middle of the loop for the picture to shimmer at.
#  - No audio track at all: nothing to mix, nothing to hold audio focus.
#  - 1080 x 2340, the plate's 1290 x 2796 within 0.04 percent. The app stretches the video onto the
#    plate's exact rectangle, so no cropping is baked in here.
set -euo pipefail

input="${1:?Pass the render to encode}"
matrix="${2:-bt709}"
offsets="${3:-0,0,0}"
crf="${CRF:-19}"
out="$(dirname "$0")/../assets/video/night-home-loop.mp4"
mkdir -p "$(dirname "$out")"

IFS=, read -r add_r add_g add_b <<<"$offsets"
# 16-bit intermediate, so a fraction of a level survives until the final rounding.
level() { awk -v v="$1" 'BEGIN { printf "%d", v * 257 + 0.5 }'; }
r16="$(level "$add_r")"
g16="$(level "$add_g")"
b16="$(level "$add_b")"

filter="scale=in_color_matrix=${matrix}:in_range=tv:out_range=pc:flags=accurate_rnd+full_chroma_int,format=gbrp16le"
filter+=",lutrgb=r='clip(val+${r16},0,maxval)':g='clip(val+${g16},0,maxval)':b='clip(val+${b16},0,maxval)'"
filter+=",scale=1080:2340:out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int+lanczos,format=yuv420p"
# The tags go on the frames too: a recent ffmpeg lets the filter graph's untagged frames win over -color_*.
filter+=",setparams=color_primaries=bt709:color_trc=iec61966-2-1:colorspace=bt709:range=tv"

ffmpeg -v error -y -i "$input" -an -vf "$filter" \
  -c:v libx264 -preset slow -crf "$crf" -profile:v high -pix_fmt yuv420p \
  -g 288 -keyint_min 288 -sc_threshold 0 -bf 0 \
  -x264-params "open-gop=0:aq-mode=3:fullrange=off:colorprim=bt709:transfer=iec61966-2-1:colormatrix=bt709" \
  -color_primaries bt709 -color_trc iec61966-2-1 -colorspace bt709 -color_range tv \
  -movflags +faststart "$out"

ffprobe -v error -select_streams v:0 \
  -show_entries stream=codec_name,profile,level,width,height,pix_fmt,color_range,color_space,color_transfer,color_primaries,nb_frames \
  -of default=nw=1 "$out"
ls -l "$out" | awk '{ printf "%.2f MB\n", $5 / 1048576 }'
