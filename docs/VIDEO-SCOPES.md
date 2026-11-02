# Video scopes in Reccut

Open **View → Video Scopes**, use **Cmd+7** on Mac / **Ctrl+7** on Windows, or press the scope icon by the viewer's playback controls. The panel is off by default. You can also find it by searching for waveform, RGB, histogram or vectorscope in the command search.

Choose four scopes at once or one larger scope:

| Scope | Shows | Useful for |
| --- | --- | --- |
| Luma waveform | Luma Y′ from 0 to 100 %, with the left side of the image on the left | Comparing shadows, midtones and highlights at specific places in the image |
| RGB waveform | Red, green and blue channels overlaid on the same graph | Comparing channel levels at the same image position |
| RGB parade | Red, green and blue channels each in their own part of the graph | Finding color casts and differences between the channels |
| Histogram | Number of pixels at each RGB and luma level from 0 to 255 | Seeing the distribution of signal levels; RGB is colored, luma is light gray |
| Vectorscope | Rec.709 Cb/Cr: neutral in the center, hue by direction and saturation by distance | Comparing saturation and the direction of a color cast |

**Gain** changes the brightness of the traces without changing the measurements. **Log** selects logarithmic or linear histogram height. The vectorscope has target marks for 75 % color bars and an optional, approximate skin tone line. The skin guide is a reference direction, not a rule for all skin tones or lighting setups.

**Hold** freezes the scopes while the video can keep playing. **Resume** starts reading new frames again. Drag the panel's lower right corner to change its height within the space in the viewer. Four scopes are shown in two rows in narrower views and in one row when there is enough room. Close with the cross or the same menu item that opened the panel. The view, type and gain settings are remembered between sessions. The panel is hidden during full screen playback.

## What is measured

The scopes read the finished image drawn in the viewer canvas, after color correction, LUTs, effects, masks and compositing. They therefore follow the visible source or timeline image. The editing handles are separate on-screen elements and are not included. The scopes are not added to exported video.

These are **sampled 8-bit SDR display values**, not measurements taken directly from the RAW or HDR source. Luma Y′ is computed with the coefficients in [ITU-R BT.709](https://www.itu.int/rec/R-REC-BT.709-6-201506-I). Y′ is the signal's luma, not a physical luminance measurement in nits. HDR or LOG is measured as it is converted for the visible preview. Values outside what that image can represent cannot be reconstructed by the scopes.

The text **RGB at 255** shows the share of sampled pixels where at least one RGB channel is at the top code value. A saturated color can trigger this without the original footage being overexposed. It is therefore not an automatic clipping assessment or a broadcast level check.

To limit the workload, up to 512 × 288 pixels are sampled, at most eight times per second. Small details or short peaks can be missed, and a reduced viewer resolution affects the analysis. When the image and settings are unchanged, the analysis and drawing are reused. When the panel is closed, no frames are read. Hold stops new frame reads; hidden views are not sampled.

## Verification

- `node --test test/scopes.test.mjs` checks histogram counting, waveform position, primary colors, grayscale, Cb/Cr directions and alpha handling.
- `npm run test:scopes` uses a separate Electron window and a temporary user profile. It checks that hidden and closed scopes do not read frames, that Hold and Resume work, that every scope view can be selected, that the panel fits at 320 pixels, and that the settings are saved.
