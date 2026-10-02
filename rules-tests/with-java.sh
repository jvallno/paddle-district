#!/bin/sh
# The Firebase emulators need Java 21+. Use the one on PATH, else the user-space
# JDK at ~/.local/jdk (see AGENTS.md → Run / test), then run the given command.
if ! java -version >/dev/null 2>&1; then
  for home in "$HOME"/.local/jdk/*/Contents/Home "$HOME"/.local/jdk/*; do
    if [ -x "$home/bin/java" ]; then
      JAVA_HOME="$home"; PATH="$home/bin:$PATH"; export JAVA_HOME PATH; break
    fi
  done
fi
exec npx "$@"
