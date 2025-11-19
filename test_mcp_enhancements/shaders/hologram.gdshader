shader_type canvas_item;

uniform float scan_speed : hint_range(0.0, 10.0) = 2.0;
uniform vec4 tint_color : source_color = vec4(0.0, 1.0, 1.0, 1.0);

void fragment() {
    float scan = sin((UV.y + TIME * scan_speed) * 20.0) * 0.5 + 0.5;
    COLOR = texture(TEXTURE, UV) * tint_color;
    COLOR.a *= scan * 0.8 + 0.2;
}