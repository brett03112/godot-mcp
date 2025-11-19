shader_type canvas_item;

uniform float dissolve_amount : hint_range(0.0, 1.0) = 0.0;
uniform sampler2D dissolve_texture : hint_default_white;
uniform vec4 edge_color : source_color = vec4(1.0, 0.5, 0.0, 1.0);
uniform float edge_width : hint_range(0.0, 0.5) = 0.1;

void fragment() {
    vec4 tex = texture(TEXTURE, UV);
    float noise = texture(dissolve_texture, UV).r;

    float edge = smoothstep(dissolve_amount - edge_width, dissolve_amount, noise);
    float alpha = smoothstep(dissolve_amount, dissolve_amount + 0.01, noise);

    vec4 edge_glow = edge_color * (1.0 - edge);
    COLOR = mix(tex + edge_glow, tex, edge);
    COLOR.a *= alpha * tex.a;
}