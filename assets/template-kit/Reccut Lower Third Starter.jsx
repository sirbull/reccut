// Reccut Lower Third Starter
// Creates a ready made lower third composition in After Effects that follows the Reccut
// template rules, so you can change the design and export it with "Export to Reccut.jsx".
//
// Run it with File > Scripts > Run Script File. It creates the composition "Reccut Lower Third":
// - {{name}} and {{title}} text layers. Keep the {{ }} words, they become fields in Reccut.
// - A background box and an accent bar. Their comments (w=, h=, color=) make the box follow the
//   length of the text, and let the user change the colors in Reccut.
// - Markers "in" and "out". Animate in before "in" and out after "out". The time between them
//   is stretched to the length of the clip in Reccut.

(function () {
  app.beginUndoGroup('Reccut Lower Third Starter');
  var comp = app.project.items.addComp('Reccut Lower Third', 1920, 1080, 1, 5, 30);
  comp.bgColor = [0.29, 0.43, 0.55];
  var tIn = 0.8;
  var tOut = 4.3;

  function shapeRect(name, size, pos, color, roundness) {
    var layer = comp.layers.addShape();
    layer.name = name;
    var group = layer.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group');
    group.name = name;
    var contents = group.property('ADBE Vectors Group');
    var rect = contents.addProperty('ADBE Vector Shape - Rect');
    rect.property('ADBE Vector Rect Size').setValue(size);
    rect.property('ADBE Vector Rect Roundness').setValue(roundness || 0);
    var fill = contents.addProperty('ADBE Vector Graphic - Fill');
    fill.property('ADBE Vector Fill Color').setValue(color);
    // Anchor at the left edge, so scale and wipes grow from the left.
    layer.property('ADBE Transform Group').property('ADBE Anchor Point').setValue([-size[0] / 2, 0]);
    layer.property('ADBE Transform Group').property('ADBE Position').setValue(pos);
    return layer;
  }

  function text(name, value, size, pos, color, bold) {
    var layer = comp.layers.addText(value);
    layer.name = name;
    var prop = layer.property('ADBE Text Properties').property('ADBE Text Document');
    var td = prop.value;
    td.fontSize = size;
    td.applyFill = true;
    td.fillColor = color;
    td.justification = ParagraphJustification.LEFT_JUSTIFY;
    try {
      td.font = bold ? 'Arial-BoldMT' : 'ArialMT';
    } catch (e) {}
    prop.setValue(td);
    layer.property('ADBE Transform Group').property('ADBE Position').setValue(pos);
    return layer;
  }

  function keys(prop, list) {
    for (var i = 0; i < list.length; i++) prop.setValueAtTime(list[i][0], list[i][1]);
    for (var k = 1; k <= prop.numKeys; k++) {
      var ease = new KeyframeEase(0, 75);
      var dims = prop.value instanceof Array ? prop.value.length : 1;
      var e = [];
      for (var d = 0; d < dims; d++) e.push(ease);
      try {
        prop.setTemporalEaseAtKey(k, e, e);
      } catch (err) {}
    }
  }

  var box = shapeRect('box', [520, 128], [120, 894], [0.06, 0.07, 0.08], 4);
  box.comment = 'w=max(width(name), width(title)) + 64\nh=bottom(title) - top(name) + 43\ncolor=box';
  box.property('ADBE Transform Group').property('ADBE Opacity').setValue(78);
  var bar = shapeRect('bar', [8, 128], [104, 894], [0.04, 0.52, 1], 0);
  bar.comment = 'h=height(box)\ncolor=accent';
  var name = text('name', '{{name}}', 54, [150, 890], [1, 1, 1], true);
  name.comment = 'color=text';
  var title = text('title', '{{title}}', 32, [150, 938], [1, 1, 1], false);
  title.comment = 'color=text';

  var T = 'ADBE Transform Group';
  keys(box.property(T).property('ADBE Scale'), [[0.1, [0, 100]], [0.65, [100, 100]], [tOut + 0.2, [100, 100]], [5, [0, 100]]]);
  keys(bar.property(T).property('ADBE Opacity'), [[0, 0], [0.25, 100], [tOut + 0.4, 100], [5, 0]]);
  keys(name.property(T).property('ADBE Position'), [[0.25, [110, 890]], [0.75, [150, 890]], [tOut, [150, 890]], [tOut + 0.5, [120, 890]]]);
  keys(name.property(T).property('ADBE Opacity'), [[0.25, 0], [0.5, 100], [tOut, 100], [tOut + 0.3, 0]]);
  keys(title.property(T).property('ADBE Position'), [[0.35, [110, 938]], [0.8, [150, 938]], [tOut, [150, 938]], [tOut + 0.5, [120, 938]]]);
  keys(title.property(T).property('ADBE Opacity'), [[0.35, 0], [0.6, 100], [tOut, 100], [tOut + 0.3, 0]]);

  try {
    comp.markerProperty.setValueAtTime(tIn, new MarkerValue('in'));
    comp.markerProperty.setValueAtTime(tOut, new MarkerValue('out'));
  } catch (e) {
    // Older versions without composition markers: a null layer carries them.
    var nul = comp.layers.addNull();
    nul.name = 'Reccut Markers';
    nul.guideLayer = true;
    nul.property('Marker').setValueAtTime(tIn, new MarkerValue('in'));
    nul.property('Marker').setValueAtTime(tOut, new MarkerValue('out'));
  }
  comp.openInViewer();
  app.endUndoGroup();
  alert('Created "Reccut Lower Third". Change the design, keep the {{name}} and {{title}} words and the in and out markers, then run "Export to Reccut.jsx".');
})();
