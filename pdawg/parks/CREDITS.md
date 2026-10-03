# National Parks Photo Credits — Pdawg Puzzles

All photos below are bundled in `parks/` as built-in puzzle images. Every image
was sourced from **Wikimedia Commons**, which only hosts freely-licensed media
(no watermarks, no rights-managed stock). License details for each file live on
its linked source page.

| File | Park | Photo | Photographer | Source | License |
|------|------|-------|--------------|--------|---------|
| park-01.jpg | Yosemite NP (CA) | Tunnel View, Yosemite Valley | Diliff | https://commons.wikimedia.org/wiki/File:Tunnel_View_5,_Yosemite_Valley,_Yosemite_NP_-_Diliff.jpg | CC BY-SA (via Wikimedia Commons) |
| park-02.jpg | Yellowstone NP (WY/MT/ID) | Aerial view, Grand Prismatic Spring | Jim Peaco / NPS Photo, July 2001 | https://commons.wikimedia.org/wiki/File:Grand_prismatic_spring.jpg | **Public domain** — U.S. National Park Service |
| park-03.jpg | Grand Canyon NP (AZ) | Hopi Point, evening light | — | https://commons.wikimedia.org/wiki/File:Grand_Canyon_Hopi_Point_Evening_Light_2013.jpg | Freely licensed (via Wikimedia Commons) |
| park-04.jpg | Zion NP (UT) | Virgin River canyon | — | https://commons.wikimedia.org/wiki/File:Virgin_River,_Zion_2009.jpg | Freely licensed (via Wikimedia Commons) |
| park-05.jpg | Arches NP (UT) | Delicate Arch | — (via Flickr) | https://commons.wikimedia.org/wiki/File:Delicate_Arch_(25816374143).jpg | CC BY-SA (via Wikimedia Commons) |
| park-06.jpg | Glacier NP (MT) | St. Mary Lake | — | https://commons.wikimedia.org/wiki/File:St_Mary_Lake.jpg | Freely licensed (via Wikimedia Commons) |
| park-07.jpg | Grand Teton NP (WY) | Snake River Overlook, Teton Range | — | https://commons.wikimedia.org/wiki/File:Snake_River_Overlook,_Tetons.jpg | Freely licensed (via Wikimedia Commons) |
| park-08.jpg | Acadia NP (ME) | Jordan Pond reflections | — (via Flickr) | https://commons.wikimedia.org/wiki/File:Jordan_Pond_Reflections_(19247942291).jpg | CC BY (via Wikimedia Commons) |
| park-09.jpg | Bryce Canyon NP (UT) | Sunrise Point amphitheater | — (via Flickr) | https://commons.wikimedia.org/wiki/File:Sunrise_Point_-_Bryce_Canyon_National_Park_(27717108635).jpg | CC BY-SA (via Wikimedia Commons) |
| park-10.jpg | Olympic NP (WA) | Hurricane Ridge panorama | — | https://commons.wikimedia.org/wiki/File:Hurricane_Ridge_Panorama.jpg | Freely licensed (via Wikimedia Commons) |

Notes:
- "Freely licensed (via Wikimedia Commons)" means the file passed Commons'
  free-license review; see the linked source page for the exact license deed.
  Where the uploader/photographer name wasn't confirmed, it's marked "—".
- Images were downscaled to 1600px on the long edge (JPEG q82) for the game
  bundle; originals remain available at the source links above.
- No image carries a watermark or text overlay.
- On GitHub Pages each photo also ships as a base64 text bundle
  (`park-NN.jpg.b64`) because the repo push tooling can't carry binary files.
  The game's photo loader tries the `.jpg` first and falls back to the `.b64`
  automatically; both decode to the identical image.
