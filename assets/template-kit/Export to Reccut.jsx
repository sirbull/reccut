// Export to Reccut
// Turns the active After Effects composition into a Reccut title template (.reccut-title).
//
// How to use:
// 1. Design the lower third in a composition. Write {{name}} and {{title}} (or any {{field}})
//    in text layers where the text should be typed in Reccut.
// 2. Add two composition markers: "in" where the in animation ends, and "out" where the out
//    animation starts. Everything between them is stretched to the length of the clip in Reccut.
// 3. Optional layer comments (Layer > Layer Settings is not needed, use the Comment column):
//      color=accent        the layer's color becomes a color the user can change in Reccut
//      w=width(name) + 64  the width follows the text (also h=, x=, y=)
//      id=box              the name other layers use in expressions (default: the layer name)
// 4. Run File > Scripts > Run Script File and choose this file. Save the .reccut-title file,
//    then import it in Reccut (Titles > Custom > Import Template).
//
// Supported: text layers, shape layers with one rectangle, and solids. Animated position,
// scale, rotation and opacity are exported. Effects, masks and track mattes are not.

(function () {
  var comp = app.project.activeItem;
  if (!(comp && comp instanceof CompItem)) {
    alert('Open the composition you want to export first.');
    return;
  }

  /* JSON, since ExtendScript has none of its own */
  function q(s) {
    return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\n') + '"';
  }
  function toJSON(v, ind) {
    ind = ind || '';
    var ni = ind + '  ';
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'number') return isFinite(v) ? String(Math.round(v * 1000) / 1000) : '0';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'string') return q(v);
    if (v instanceof Array) {
      var simple = true;
      for (var i = 0; i < v.length; i++) if (typeof v[i] === 'object' && v[i] !== null) simple = false;
      var parts = [];
      for (var j = 0; j < v.length; j++) parts.push(toJSON(v[j], ni));
      return simple ? '[' + parts.join(', ') + ']' : '[\n' + ni + parts.join(',\n' + ni) + '\n' + ind + ']';
    }
    var out = [];
    for (var k in v) if (v.hasOwnProperty(k) && v[k] !== undefined) out.push(ni + q(k) + ': ' + toJSON(v[k], ni));
    return '{\n' + out.join(',\n') + '\n' + ind + '}';
  }

  function hex(c) {
    var s = '#';
    for (var i = 0; i < 3; i++) {
      var n = Math.max(0, Math.min(255, Math.round(c[i] * 255))).toString(16);
      s += n.length < 2 ? '0' + n : n;
    }
    return s;
  }
  function safeId(s) {
    return String(s).replace(/[^A-Za-z0-9_]/g, '_');
  }

  /* Markers: "in", "out" and optionally "anchor:bottom-right" */
  var tIn = null;
  var tOut = null;
  var anchor = 'bottom-left';
  function readMarkers(prop) {
    if (!prop) return;
    for (var i = 1; i <= prop.numKeys; i++) {
      var c = String(prop.keyValue(i).comment).toLowerCase().replace(/^\s+|\s+$/g, '');
      if (c === 'in') tIn = prop.keyTime(i);
      else if (c === 'out') tOut = prop.keyTime(i);
      else if (c.indexOf('anchor:') === 0) anchor = c.slice(7);
    }
  }
  try {
    readMarkers(comp.markerProperty);
  } catch (e) {}
  if (tIn === null || tOut === null) {
    // Older versions: markers on a layer named "Reccut Markers".
    for (var m = 1; m <= comp.numLayers; m++) if (comp.layer(m).name === 'Reccut Markers') readMarkers(comp.layer(m).property('Marker'));
  }
  if (tIn === null) tIn = Math.min(1, comp.duration / 3);
  if (tOut === null) tOut = Math.max(tIn, comp.duration - Math.min(1, comp.duration / 3));
  var hold = (tIn + tOut) / 2;

  var fields = {};
  var fieldOrder = [];
  var colors = {};
  var colorOrder = [];
  var layers = [];

  function comment(layer) {
    var res = {};
    var lines = String(layer.comment || '').split(/[\n;]/);
    for (var i = 0; i < lines.length; i++) {
      var p = lines[i].indexOf('=');
      if (p > 0) res[lines[i].slice(0, p).replace(/\s/g, '')] = lines[i].slice(p + 1).replace(/^\s+|\s+$/g, '');
    }
    return res;
  }

  function colorRef(c, opts, fallbackId) {
    var id = opts.color;
    if (!id) return hex(c);
    if (!colors[id]) {
      colors[id] = { id: id, label: id.charAt(0).toUpperCase() + id.slice(1), 'default': hex(c) };
      colorOrder.push(id);
    }
    return '{{' + id + '}}';
  }

  // Samples one transform property across the in or out section, relative to the value at hold.
  function sampleAnim(layer, from, to, kind) {
    var tr = layer.property('ADBE Transform Group');
    var pos = tr.property('ADBE Position');
    var scl = tr.property('ADBE Scale');
    var rot = tr.property('ADBE Rotate Z');
    var opa = tr.property('ADBE Opacity');
    var p0 = pos.valueAtTime(hold, false);
    var s0 = scl.valueAtTime(hold, false);
    var r0 = rot.valueAtTime(hold, false);
    var o0 = opa.valueAtTime(hold, false) || 100;
    var steps = 12;
    var x = [], y = [], sx = [], sy = [], r = [], o = [];
    var changed = { x: false, y: false, sx: false, sy: false, r: false, o: false };
    for (var i = 0; i <= steps; i++) {
      var t = from + ((to - from) * i) / steps;
      var u = i / steps;
      var pv = pos.valueAtTime(t, false);
      var sv = scl.valueAtTime(t, false);
      var rv = rot.valueAtTime(t, false);
      var ov = opa.valueAtTime(t, false);
      x.push([u, pv[0] - p0[0], 'linear']);
      y.push([u, pv[1] - p0[1], 'linear']);
      sx.push([u, s0[0] ? sv[0] / s0[0] : 1, 'linear']);
      sy.push([u, s0[1] ? sv[1] / s0[1] : 1, 'linear']);
      r.push([u, rv - r0, 'linear']);
      o.push([u, ov / o0, 'linear']);
      if (Math.abs(pv[0] - p0[0]) > 0.01) changed.x = true;
      if (Math.abs(pv[1] - p0[1]) > 0.01) changed.y = true;
      if (Math.abs(sv[0] - s0[0]) > 0.01) changed.sx = true;
      if (Math.abs(sv[1] - s0[1]) > 0.01) changed.sy = true;
      if (Math.abs(rv - r0) > 0.01) changed.r = true;
      if (Math.abs(ov - o0) > 0.01) changed.o = true;
    }
    var a = {};
    if (changed.x) a.x = x;
    if (changed.y) a.y = y;
    if (changed.sx) a.scaleX = sx;
    if (changed.sy) a.scaleY = sy;
    if (changed.r) a.rotation = r;
    if (changed.o) a.opacity = o;
    for (var k in a) if (a.hasOwnProperty(k)) return a;
    return undefined;
  }

  // Bottom layer first, so the drawing order is the same as in After Effects.
  for (var li = comp.numLayers; li >= 1; li--) {
    var layer = comp.layer(li);
    if (!layer.enabled || layer.guideLayer || layer.name === 'Reccut Markers') continue;
    var opts = comment(layer);
    var id = opts.id || safeId(layer.name);
    var rect;
    try {
      rect = layer.sourceRectAtTime(hold, false);
    } catch (e) {
      continue;
    }
    var tr = layer.property('ADBE Transform Group');
    var pos = tr.property('ADBE Position').valueAtTime(hold, false);
    var anc = tr.property('ADBE Anchor Point').valueAtTime(hold, false);
    var scl = tr.property('ADBE Scale').valueAtTime(hold, false);
    var kx = scl[0] / 100;
    var ky = scl[1] / 100;
    var left = pos[0] + (rect.left - anc[0]) * kx;
    var top = pos[1] + (rect.top - anc[1]) * ky;
    var w = rect.width * kx;
    var h = rect.height * ky;
    var out = { id: id, z: comp.numLayers - li };
    var opacity = tr.property('ADBE Opacity').valueAtTime(hold, false) / 100;
    if (opacity < 0.999) out.opacity = opacity;
    if (w > 0 && h > 0) out.pivot = [(pos[0] - left) / w, (pos[1] - top) / h];

    if (layer instanceof TextLayer) {
      var td = layer.property('Source Text').valueAtTime(hold, false);
      var text = String(td.text);
      var re = /\{\{\s*([\w-]+)\s*\}\}/g;
      var mm;
      while ((mm = re.exec(text))) {
        if (!fields[mm[1]]) {
          fields[mm[1]] = { id: mm[1], label: mm[1].charAt(0).toUpperCase() + mm[1].slice(1), 'default': mm[1] === 'name' ? 'Jane Doe' : mm[1] === 'title' ? 'Product Designer' : mm[1] };
          fieldOrder.push(mm[1]);
        }
      }
      var just = td.justification;
      out.type = 'text';
      out.text = text;
      out.size = td.fontSize * ky;
      out.font = td.fontFamily || td.font || 'template';
      out.weight = /bold|black|heavy/i.test(String(td.fontStyle || td.font)) ? 700 : /medium|semibold/i.test(String(td.fontStyle || td.font)) ? 600 : 400;
      out.color = colorRef(td.fillColor, opts);
      if (td.allCaps) out.uppercase = true;
      if (td.tracking) out.letterSpacing = td.tracking / 1000;
      out.align = just === ParagraphJustification.RIGHT_JUSTIFY ? 'right' : just === ParagraphJustification.CENTER_JUSTIFY ? 'center' : 'left';
      out.x = opts.x || (out.align === 'right' ? left + w : out.align === 'center' ? left + w / 2 : left);
      out.y = opts.y || top;
    } else {
      var color = [1, 1, 1];
      var radius = 0;
      var isShape = false;
      try {
        if (layer.source && layer.source.mainSource && layer.source.mainSource.color) color = layer.source.mainSource.color;
      } catch (e) {}
      var root = layer.property('ADBE Root Vectors Group');
      if (root) {
        isShape = true;
        // The first fill and the first rectangle in the shape layer.
        var stack = [root];
        while (stack.length) {
          var g = stack.pop();
          for (var gi = 1; gi <= g.numProperties; gi++) {
            var pr = g.property(gi);
            if (pr.matchName === 'ADBE Vector Graphic - Fill') color = pr.property('ADBE Vector Fill Color').valueAtTime(hold, false);
            else if (pr.matchName === 'ADBE Vector Shape - Rect') radius = pr.property('ADBE Vector Rect Roundness').valueAtTime(hold, false) * kx;
            else if (pr.numProperties) stack.push(pr);
          }
        }
      }
      if (!isShape && !(layer.source && layer.source.mainSource instanceof SolidSource)) continue;
      out.type = 'rect';
      out.x = opts.x || left;
      out.y = opts.y || top;
      out.w = opts.w || w;
      out.h = opts.h || h;
      out.color = colorRef(color, opts);
      if (radius) out.radius = radius;
    }
    if (opts.hideIfEmpty) out.hideIfEmpty = opts.hideIfEmpty;
    out['in'] = tIn > 0 ? sampleAnim(layer, 0, tIn) : undefined;
    out.out = comp.duration > tOut ? sampleAnim(layer, tOut, comp.duration) : undefined;
    layers.push(out);
  }

  if (!layers.length) {
    alert('Nothing to export. Use text layers, shape layers with a rectangle, or solids.');
    return;
  }

  var tpl = {
    format: 'reccut-title',
    version: 1,
    id: 'ae-' + safeId(comp.name).toLowerCase(),
    name: comp.name,
    category: 'Custom',
    size: [comp.width, comp.height],
    anchor: anchor,
    timing: { 'in': tIn, out: comp.duration - tOut },
    fields: [],
    colors: [],
    layers: layers
  };
  for (var fi = 0; fi < fieldOrder.length; fi++) tpl.fields.push(fields[fieldOrder[fi]]);
  for (var ci = 0; ci < colorOrder.length; ci++) tpl.colors.push(colors[colorOrder[ci]]);

  var file = File.saveDialog('Save the Reccut title template', 'Reccut title:*.reccut-title');
  if (!file) return;
  if (!/\.reccut-title$/i.test(file.name)) file = new File(file.fsName + '.reccut-title');
  file.encoding = 'UTF-8';
  file.open('w');
  file.write(toJSON(tpl));
  file.close();
  alert('Saved ' + file.name + '. Import it in Reccut under Titles > Custom > Import Template.');
})();
