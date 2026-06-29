#!/bin/bash
set -e

HERMES_BIN="${TARGET_BUILD_DIR}/${FRAMEWORKS_FOLDER_PATH}/hermesvm.framework/hermesvm"

if [ -e "$HERMES_BIN" ]; then
  dsymutil "$HERMES_BIN" -o "${DWARF_DSYM_FOLDER_PATH}/hermesvm.framework.dSYM"
fi
