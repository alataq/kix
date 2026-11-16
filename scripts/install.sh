#!/bin/sh
set -eu

if [ "$#" -ne 6 ]; then
    echo "usage: install.sh <dist-dir> <bindir> <libdir> <docdir> <licensedir> <source-root>" >&2
    exit 2
fi

dist="$1"
bindir="$2"
libdir="$3"
docdir="$4"
licensedir="$5"

install -d "$bindir"
install -d "$libdir"
install -d "$docdir"
install -d "$licensedir"

install -m 755 "$dist/kixt" "$bindir/kixt"
rm -rf "$libdir/modules"
cp -R "$dist/modules" "$libdir/modules"
rm -rf "$docdir"
cp -R "$dist/docs" "$docdir"
install -m 644 "$dist/LICENSE" "$licensedir/LICENSE"

printf 'Installed kixt to %s\n' "$bindir/kixt"
printf 'Installed modules to %s\n' "$libdir/modules"
