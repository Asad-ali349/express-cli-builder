# Demo recording

`docs/demo.svg` (the animation in the main README) is a real terminal session, recorded and rendered with these two scripts. They use only the Python standard library.

```bash
# 1. Record: runs a real shell, types the demo commands and saves an asciinema v2 cast.
#    <work-dir> must be empty; <bin-dir> must contain the express-cli command.
#    NODE_DIR is the folder that contains the node binary.
NODE_DIR="$(dirname "$(command -v node)")" python3 scripts/demo/record.py <work-dir> <bin-dir> demo.cast

# 2. Render: turns the cast into an animated SVG.
python3 scripts/demo/cast2svg.py demo.cast docs/demo.svg
```

The demo starts an app on port 4100 and calls it with curl, so a local MongoDB must be running. It creates a `shop-api` database, which you can drop afterwards. Long pauses (npm install, server start) are shortened in the recording; the output is unchanged.
