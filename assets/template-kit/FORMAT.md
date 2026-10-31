# Reccut title template format (.reccut-title)

A `.reccut-title` file is UTF-8 JSON. Reccut draws it with the same engine as its built in
lower thirds, in the viewer and in exports.

## Top level

```json
{
  "format": "reccut-title",
  "version": 1,
  "id": "my-lower-third",
  "name": "My Lower Third",
  "category": "Custom",
  "size": [1920, 1080],
  "anchor": "bottom-left",
  "font": "sans",
  "timing": { "in": 0.8, "out": 0.6 },
  "fields": [
    { "id": "name", "label": "Name", "default": "Jane Doe" },
    { "id": "title", "label": "Title", "default": "Product Designer" }
  ],
  "colors": [
    { "id": "accent", "label": "Accent", "default": "#0a84ff" }
  ],
  "layers": []
}
```

| Key | Meaning |
| --- | --- |
| `format` | Always `reccut-title`. |
| `size` | The design size. All positions and sizes are in these pixels. |
| `anchor` | Which part of the picture the design belongs to: `bottom-left`, `bottom-right`, `top-left`, `top-right`, `bottom`, `top`, `left`, `right` or `center`. In other aspect ratios the design is scaled to fit and kept in that corner. |
| `font` | Font for text layers that do not name one: `sans`, `serif`, `mono`, `rounded`, `condensed` or a font family name. The user can change it in Reccut. |
| `timing` | Default length in seconds of the in and out animations. The user can change them. |
| `fields` | Text the user types. Use `{{id}}` in text layers and colors. |
| `colors` | Colors the user can change. Use `{{id}}` as a layer color. |
| `layers` | Drawn in order, or by `z` (lowest first). |

## Layers

Text layer:

```json
{ "type": "text", "id": "name", "text": "{{name}}", "x": 150, "y": 846, "size": 54,
  "weight": 700, "color": "{{text}}", "align": "left", "uppercase": false,
  "letterSpacing": 0, "shadow": false, "font": "template" }
```

`x` is the left edge (or the center or right edge with `align`), `y` is the top of the text.

Rectangle layer:

```json
{ "type": "rect", "id": "box", "x": 120, "y": 830, "w": "max(width(name), width(title)) + 64",
  "h": 110, "color": "{{box}}", "radius": 4, "opacity": 0.8, "z": -1, "hideIfEmpty": "title" }
```

Common keys: `opacity` (0 to 1), `z`, `pivot` ([0 to 1, 0 to 1] inside the layer, the point it
scales and rotates around, default the center), `revealFrom` (`left` or `right`).

## Expressions

`x`, `y`, `w`, `h` and `size` can be numbers or small expressions, so boxes can follow the text:

- numbers, `+ - * /` and parentheses
- `width(id)`, `height(id)`, `left(id)`, `top(id)`, `right(id)`, `bottom(id)` of another layer
- `max(a, b, ...)`, `min(a, b, ...)`

## Animation

Each layer can have `in` and `out`. Each is a set of tracks, and each track is a list of
`[time, value, ease]`, where time goes from 0 to 1 across the in or out animation:

```json
"in":  { "x": [[0, -40], [0.7, 0, "out"]], "opacity": [[0, 0], [0.35, 1, "linear"]] },
"out": { "x": [[0, 0], [1, -30, "in"]],    "opacity": [[0, 1], [0.45, 0, "linear"]] }
```

| Track | Value |
| --- | --- |
| `x`, `y` | Offset in pixels, added to the position. 0 is the resting position. |
| `opacity` | Multiplied with the layer opacity. |
| `scale`, `scaleX`, `scaleY` | Multiplied, around the pivot. |
| `rotation` | Degrees, around the pivot. |
| `reveal` | 0 to 1, shows the layer from the left (or the right with `revealFrom`). |
| `revealY` | 0 to 1, shows the layer from the bottom. |

Ease is `linear`, `in`, `out` (default), `inOut`, `back` or `hold`, and applies to the
segment that ends at that point. Between the in and out animations every layer rests at its
normal position, for as long as the clip lasts.
