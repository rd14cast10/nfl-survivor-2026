/* Liquid Glass refraction.
   Displacement maps follow the SVG filter in
   https://github.com/archisvaze/liquid-glass (MIT).

   Copyright (c) 2026 Archis Vaze

   Permission is hereby granted, free of charge, to any person obtaining a copy
   of this software and associated documentation files (the "Software"), to deal
   in the Software without restriction, including without limitation the rights
   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   copies of the Software, and to permit persons to whom the Software is
   furnished to do so, subject to the following conditions:

   The above copyright notice and this permission notice shall be included in all
   copies or substantial portions of the Software.

   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   SOFTWARE.

   Chromium paints backdrop-filter: url(#filter). Safari and Firefox keep the
   CSS blur, saturation, and specular edge declared in theme.css. */
(function () {
  function isChromium() {
    var brands = navigator.userAgentData && navigator.userAgentData.brands;
    if (brands && brands.some(function (brand) { return /Chromium|Google Chrome/.test(brand.brand); })) return true;
    return /\b(Chrome|Chromium|Edg)\//.test(navigator.userAgent) && !/\bFirefox\//.test(navigator.userAgent);
  }

  if (!isChromium()) return;

  function squircle(x) {
    return Math.pow(1 - Math.pow(1 - x, 4), 0.25);
  }

  function refractionProfile(thickness, bezel, ior) {
    var samples = 96;
    var eta = 1 / ior;
    var profile = new Float64Array(samples);
    for (var i = 0; i < samples; i += 1) {
      var x = i / samples;
      var y = squircle(x);
      var dx = x < 1 ? 0.0001 : -0.0001;
      var deriv = (squircle(Math.min(1, Math.max(0, x + dx))) - y) / dx;
      var mag = Math.sqrt(deriv * deriv + 1);
      var nx = -deriv / mag;
      var ny = -1 / mag;
      var dot = ny;
      var k = 1 - eta * eta * (1 - dot * dot);
      if (k < 0) continue;
      var sq = Math.sqrt(k);
      var ry = eta - (eta * dot + sq) * ny;
      if (!ry) continue;
      var rx = -(eta * dot + sq) * nx;
      profile[i] = rx * ((y * bezel + thickness) / ry);
    }
    return profile;
  }

  function displacementURL(w, h, radius, bezel, profile, maxDisp) {
    var canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    var img = ctx.createImageData(w, h);
    var data = img.data;
    for (var i = 0; i < data.length; i += 4) {
      data[i] = 128;
      data[i + 1] = 128;
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
    var r = radius;
    var rSq = r * r;
    var r1Sq = (r + 1) * (r + 1);
    var inner = Math.max(r - bezel, 0);
    var rBSq = inner * inner;
    var wB = w - r * 2;
    var hB = h - r * 2;
    var samples = profile.length;
    for (var y1 = 0; y1 < h; y1 += 1) {
      for (var x1 = 0; x1 < w; x1 += 1) {
        var x = x1 < r ? x1 - r : x1 >= w - r ? x1 - r - wB : 0;
        var y = y1 < r ? y1 - r : y1 >= h - r ? y1 - r - hB : 0;
        var dSq = x * x + y * y;
        if (dSq > r1Sq || dSq < rBSq || dSq === 0) continue;
        var dist = Math.sqrt(dSq);
        var fromSide = r - dist;
        var op = dSq < rSq ? 1 : 1 - (dist - Math.sqrt(rSq)) / (Math.sqrt(r1Sq) - Math.sqrt(rSq));
        if (op <= 0) continue;
        var bi = Math.min((fromSide / bezel * samples) | 0, samples - 1);
        var disp = profile[bi] || 0;
        var idx = (y1 * w + x1) * 4;
        data[idx] = (128 + (-x / dist * disp) / maxDisp * 127 * op + 0.5) | 0;
        data[idx + 1] = (128 + (-y / dist * disp) / maxDisp * 127 * op + 0.5) | 0;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL();
  }

  function specularURL(w, h, radius, bezel) {
    var canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    var img = ctx.createImageData(w, h);
    var data = img.data;
    var r = radius;
    var rSq = r * r;
    var r1Sq = (r + 1) * (r + 1);
    var inner = Math.max(r - bezel, 0);
    var rBSq = inner * inner;
    var wB = w - r * 2;
    var hB = h - r * 2;
    var sx = Math.cos(Math.PI / 3);
    var sy = Math.sin(Math.PI / 3);
    for (var y1 = 0; y1 < h; y1 += 1) {
      for (var x1 = 0; x1 < w; x1 += 1) {
        var x = x1 < r ? x1 - r : x1 >= w - r ? x1 - r - wB : 0;
        var y = y1 < r ? y1 - r : y1 >= h - r ? y1 - r - hB : 0;
        var dSq = x * x + y * y;
        if (dSq > r1Sq || dSq < rBSq || dSq === 0) continue;
        var dist = Math.sqrt(dSq);
        var fromSide = r - dist;
        var op = dSq < rSq ? 1 : 1 - (dist - Math.sqrt(rSq)) / (Math.sqrt(r1Sq) - Math.sqrt(rSq));
        if (op <= 0) continue;
        var dot = Math.abs((x / dist) * sx + (-y / dist) * sy);
        var edge = Math.sqrt(Math.max(0, 1 - (1 - fromSide) * (1 - fromSide)));
        var coeff = dot * edge;
        var col = (255 * coeff) | 0;
        var idx = (y1 * w + x1) * 4;
        data[idx] = col;
        data[idx + 1] = col;
        data[idx + 2] = col;
        data[idx + 3] = (col * coeff * op) | 0;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL();
  }

  function filterMarkup(id, w, h, radius, bezel) {
    var profile = refractionProfile(42, bezel, 1.5);
    var maxDisp = 1;
    for (var i = 0; i < profile.length; i += 1) maxDisp = Math.max(maxDisp, Math.abs(profile[i]));
    var disp = displacementURL(w, h, radius, bezel, profile, maxDisp);
    var spec = specularURL(w, h, radius, Math.min(bezel * 2.2, radius - 1));
    var scale = (maxDisp * 0.55).toFixed(2);
    return '<filter id="' + id + '" x="0%" y="0%" width="100%" height="100%" color-interpolation-filters="sRGB">' +
      '<feGaussianBlur in="SourceGraphic" stdDeviation="2.4" result="blurred_source"/>' +
      '<feImage href="' + disp + '" x="0" y="0" width="' + w + '" height="' + h + '" result="disp_map"/>' +
      '<feDisplacementMap in="blurred_source" in2="disp_map" scale="' + scale + '" xChannelSelector="R" yChannelSelector="G" result="displaced"/>' +
      '<feColorMatrix in="displaced" type="saturate" values="1.65" result="displaced_sat"/>' +
      '<feImage href="' + spec + '" x="0" y="0" width="' + w + '" height="' + h + '" result="spec_layer"/>' +
      '<feComposite in="displaced_sat" in2="spec_layer" operator="in" result="spec_masked"/>' +
      '<feComponentTransfer in="spec_layer" result="spec_faded"><feFuncA type="linear" slope="0.4"/></feComponentTransfer>' +
      '<feBlend in="spec_masked" in2="displaced" mode="normal" result="with_sat"/>' +
      '<feBlend in="spec_faded" in2="with_sat" mode="normal"/>' +
      "</filter>";
  }

  try {
    var markup = [
      filterMarkup("lg-bar", 640, 72, 20, 14),
      filterMarkup("lg-card", 280, 148, 24, 16),
      filterMarkup("lg-sheet", 480, 320, 28, 18),
      filterMarkup("lg-pill", 220, 48, 24, 12),
    ].join("");
    var parsed = new DOMParser().parseFromString(
      '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" aria-hidden="true"><defs>' + markup + "</defs></svg>",
      "image/svg+xml",
    );
    var svg = document.importNode(parsed.documentElement, true);
    svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
    document.body.prepend(svg);
    document.documentElement.classList.add("lg-svg");
  } catch (error) {
    document.documentElement.classList.remove("lg-svg");
  }
})();
