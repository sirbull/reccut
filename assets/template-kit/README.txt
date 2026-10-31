Reccut Template Kit
===================

Make your own lower thirds and titles for Reccut, in After Effects or by hand.

Reccut title templates are .reccut-title files. A template has text fields that are typed in
Reccut (like name and title), colors the user can change, and layers with an animation in and
an animation out. In Reccut the in animation plays at the start of the clip and the out
animation at the end, and the part in between lasts as long as the clip. Change the length on
the timeline and the title still animates in and out correctly.

What is in the kit
------------------

  Reccut Lower Third Starter.jsx   Creates a ready made lower third in After Effects.
  Export to Reccut.jsx             Saves the open After Effects composition as a .reccut-title file.
  Example Lower Third.reccut-title The built in "Bar" lower third, to read or change by hand.
  FORMAT.md                        The file format, for other tools and for editing by hand.

Making a template in After Effects
----------------------------------

1. In After Effects choose File > Scripts > Run Script File and pick
   "Reccut Lower Third Starter.jsx". It makes the composition "Reccut Lower Third".
2. Change the design: fonts, sizes, colors, positions and animation. Keep these rules:
   - Write {{name}} and {{title}} where the user's text goes. You can add more fields,
     for example {{company}}.
   - Keep the composition markers "in" and "out". Animate in before "in" and out after "out".
   - Use text layers, shape layers with a rectangle, or solids. Position, scale, rotation and
     opacity can be animated. Effects, masks and track mattes are not exported.
   - Layer comments control how Reccut uses a layer (one per line):
       color=accent        the color can be changed in Reccut under this name
       w=width(name) + 64  the width follows the text (also h=, x= and y=)
       id=box              the name used in expressions (default: the layer name)
       hideIfEmpty=title   hide the layer when the title field is empty
   - Add the marker "anchor:bottom-right" (or top-left, center, and so on) if the design
     belongs in another corner. Reccut keeps it in that corner in vertical and square projects.
3. Choose File > Scripts > Run Script File and pick "Export to Reccut.jsx". Save the file.
4. In Reccut open the Titles browser, scroll to Custom and click Import Template. The template
   is saved in the project and shows up with a live preview.

Making a template by hand or with another tool
-----------------------------------------------

The format is plain JSON and described in FORMAT.md. Start from
"Example Lower Third.reccut-title".

Rendering a video instead
-------------------------

If your design uses effects that cannot be exported, render it from After Effects and import
the video in Reccut as a normal clip above the storyline.
