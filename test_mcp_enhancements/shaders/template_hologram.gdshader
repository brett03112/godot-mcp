shader_type canvas_item;

uniform float scan_speed : hint_range(0.0, 10.0) = 2.0;
uniform vec4 tint_color : source_color = vec4(0.0, 1.0, 1.0, 1.0);
uniform float scan_intensity : hint_range(0.0, 1.0) = 0.5;

void fragment() {
    float scan = sin((UV.y + TIME * scan_speed) * 20.0) * 0.5 + 0.5;
    vec4 tex = texture(TEXTURE, UV);
    COLOR = tex * tint_color;
    COLOR.a *= mix(1.0 - scan_intensity, 1.0, scan) * tex.a;
}