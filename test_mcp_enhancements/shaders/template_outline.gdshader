shader_type canvas_item;

uniform vec4 outline_color : source_color = vec4(1.0, 1.0, 1.0, 1.0);
uniform float outline_width : hint_range(0.0, 10.0) = 2.0;

void fragment() {
    vec4 col = texture(TEXTURE, UV);
    vec2 ps = TEXTURE_PIXEL_SIZE * outline_width;
    float a = col.a;

    a = max(a, texture(TEXTURE, UV + vec2(0.0, -ps.y)).a);
    a = max(a, texture(TEXTURE, UV + vec2(0.0, ps.y)).a);
    a = max(a, texture(TEXTURE, UV + vec2(-ps.x, 0.0)).a);
    a = max(a, texture(TEXTURE, UV + vec2(ps.x, 0.0)).a);

    COLOR = mix(outline_color, col, col.a);
    COLOR.a = a;
}