export default `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 358.625 454.445" width="358.625" height="454.445" style="--bg:#ffffff;--fg:#042503;background:var(--bg)">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;display=swap');
  text { font-family: 'Inter', system-ui, sans-serif; }
  svg {
    --_text:          var(--fg);
    --_text-sec:      var(--muted, color-mix(in srgb, var(--fg) 60%, var(--bg)));
    --_text-muted:    var(--muted, color-mix(in srgb, var(--fg) 40%, var(--bg)));
    --_text-faint:    color-mix(in srgb, var(--fg) 25%, var(--bg));
    --_line:          var(--line, color-mix(in srgb, var(--fg) 50%, var(--bg)));
    --_arrow:         var(--accent, color-mix(in srgb, var(--fg) 85%, var(--bg)));
    --_node-fill:     var(--surface, color-mix(in srgb, var(--fg) 3%, var(--bg)));
    --_node-stroke:   var(--border, color-mix(in srgb, var(--fg) 20%, var(--bg)));
    --_group-fill:    var(--bg);
    --_group-hdr:     color-mix(in srgb, var(--fg) 5%, var(--bg));
    --_inner-stroke:  color-mix(in srgb, var(--fg) 12%, var(--bg));
    --_key-badge:     color-mix(in srgb, var(--fg) 10%, var(--bg));
  }
</style>
<defs>
  <marker id="arrowhead" markerWidth="8" markerHeight="5" refX="7" refY="2.5" orient="auto">
    <polygon points="0 0, 8 2.5, 0 5" fill="var(--_arrow)" stroke="var(--_arrow)" stroke-width="0.75" stroke-linejoin="round" />
  </marker>
  <marker id="arrowhead-start" markerWidth="8" markerHeight="5" refX="1" refY="2.5" orient="auto-start-reverse">
    <polygon points="8 0, 0 2.5, 8 5" fill="var(--_arrow)" stroke="var(--_arrow)" stroke-width="0.75" stroke-linejoin="round" />
  </marker>
</defs>
<polyline class="edge" data-from="A" data-to="B" data-style="solid" data-arrow-start="false" data-arrow-end="true" points="178.01575000000003,76.9 178.01575000000003,124.90000000000003" fill="none" stroke="var(--_line)" stroke-width="1" marker-end="url(#arrowhead)" />
<polyline class="edge" data-from="B" data-to="C" data-style="solid" data-arrow-start="false" data-arrow-end="true" data-label="pass" points="155.29158333333334,238.52083333333334 155.29158333333334,297.245 101.3595,297.245 101.3595,377.545" fill="none" stroke="var(--_line)" stroke-width="1" marker-end="url(#arrowhead)" />
<polyline class="edge" data-from="B" data-to="D" data-style="solid" data-arrow-start="false" data-arrow-end="true" data-label="fail" points="200.73991666666666,238.52083333333331 200.73991666666666,297.245 254.67200000000003,297.245 254.67199999999997,377.545" fill="none" stroke="var(--_line)" stroke-width="1" marker-end="url(#arrowhead)" />
<g class="edge-label" data-from="B" data-to="C" data-label="pass">
  <rect x="80.3595" y="304.245" width="41.41" height="30.3" rx="2" ry="2" fill="var(--bg)" stroke="var(--_inner-stroke)" stroke-width="1" />
  <text x="101.0645" y="319.395" text-anchor="middle" font-size="11" font-weight="400" fill="var(--_text-sec)" dy="3.8499999999999996">pass</text>
</g>
<g class="edge-label" data-from="B" data-to="D" data-label="fail">
  <rect x="239.17200000000003" y="304.245" width="30.717999999999996" height="30.3" rx="2" ry="2" fill="var(--bg)" stroke="var(--_inner-stroke)" stroke-width="1" />
  <text x="254.53100000000003" y="319.395" text-anchor="middle" font-size="11" font-weight="400" fill="var(--_text-sec)" dy="3.8499999999999996">fail</text>
</g>
<g class="node" data-id="A" data-label="Return request" data-shape="rectangle">
  <rect x="112.95124999999999" y="40" width="130.12900000000002" height="36.900000000000006" rx="0" ry="0" fill="var(--_node-fill)" stroke="var(--_node-stroke)" stroke-width="0.75" />
  <text x="178.01575" y="58.45" text-anchor="middle" font-size="13" font-weight="500" fill="var(--_text)" dy="4.55">Return request</text>
</g>
<g class="node" data-id="B" data-label="Policy rules" data-shape="diamond">
  <polygon points="178.01575,124.89999999999999 246.18824999999998,193.0725 178.01575,261.245 109.84325,193.0725" fill="var(--_node-fill)" stroke="var(--_node-stroke)" stroke-width="0.75" />
  <text x="178.01575" y="193.0725" text-anchor="middle" font-size="13" font-weight="500" fill="var(--_text)" dy="4.55">Policy rules</text>
</g>
<g class="node" data-id="C" data-label="Auto-approve" data-shape="rectangle">
  <rect x="40" y="377.545" width="122.719" height="36.900000000000006" rx="0" ry="0" fill="var(--_node-fill)" stroke="var(--_node-stroke)" stroke-width="0.75" />
  <text x="101.3595" y="395.995" text-anchor="middle" font-size="13" font-weight="500" fill="var(--_text)" dy="4.55">Auto-approve</text>
</g>
<g class="node" data-id="D" data-label="Manual review" data-shape="rectangle">
  <rect x="190.719" y="377.545" width="127.90599999999999" height="36.900000000000006" rx="0" ry="0" fill="var(--_node-fill)" stroke="var(--_node-stroke)" stroke-width="0.75" />
  <text x="254.672" y="395.995" text-anchor="middle" font-size="13" font-weight="500" fill="var(--_text)" dy="4.55">Manual review</text>
</g>
</svg>`
