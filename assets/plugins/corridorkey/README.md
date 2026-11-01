# CorridorKey in Reccut

CorridorKey is an AI keyer from Corridor Digital. It runs on your own computer and needs Python
and a graphics card. Reccut does not include it; this plugin connects Reccut to your own installation.

1. Install CorridorKey (the open version from GitHub, or the engine or GUI forks). Follow its own
   instructions so that you can key a folder of PNG images from the command line.
2. In Reccut, open Settings, Plugins, and set:
   - **Python**: the Python that has CorridorKey installed (for example its virtual environment).
   - **CorridorKey folder**: where CorridorKey is installed.
   - **Command**: the command line that keys the images in `{inputDir}` and writes PNG images with
     transparency to `{outputDir}`, named `frame_00001.png` and so on. Adjust it to match the
     version you installed.
3. Select a clip and choose Clip, Run Plugin, CorridorKey.

Reccut writes every frame of the clip as `frame_00001.png`, `frame_00002.png` ... to `{inputDir}`,
runs the command, and turns the images in `{outputDir}` into a video with transparency that
replaces the clip. Lines printed as `PROGRESS 0.42` update the progress bar.

Check the CorridorKey license before commercial use. The commercial CorridorKey 2.0 plugins for
Resolve, Nuke, After Effects and Premiere use those programs' own plugin formats and cannot be
loaded by Reccut.
