shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_lambert, specular_schlick_ggx;

uniform float semantic_density : hint_range(0.0, 1.0) = 1.0;
uniform float deformation_strength : hint_range(0.0, 1.0) = 0.1;
uniform vec4 base_color : source_color = vec4(1.0);
uniform sampler2D albedo_texture : hint_albedo;

void vertex() {
	// Calculate deformation factor: higher when density is lower
	float deform_factor = 1.0 - semantic_density;

	// Apply deformation: push vertices inwards along their normal
	// This creates a crumbling/dissolving effect, visually representing memory loss.
	VERTEX -= NORMAL * deform_factor * deformation_strength;
}

void fragment() {
	// Sample albedo texture if available, otherwise texture() will return default white
	vec4 albedo_tex_color = texture(albedo_texture, UV) * base_color;

	ALBEDO = albedo_tex_color.rgb;

	// Control transparency based on semantic density
	// The object fades out as density decreases, representing forgetting.
	ALPHA = semantic_density * albedo_tex_color.a;

	// Discard fragments that are almost completely transparent
	// This prevents rendering very faint pixels and improves performance.
	if (ALPHA < 0.01) {
		discard;
	}
}