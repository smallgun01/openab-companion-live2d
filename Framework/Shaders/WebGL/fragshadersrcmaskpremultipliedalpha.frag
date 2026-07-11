precision mediump float;
varying vec2 v_texCoord;
varying vec4 v_clipPos;
uniform sampler2D s_texture0;
uniform sampler2D s_texture1;
uniform vec4 u_channelFlag;
uniform vec4 u_baseColor;
void main() {
    vec4 col = texture2D(s_texture0, v_texCoord) * u_baseColor;
    vec4 clip = texture2D(s_texture1, v_clipPos.xy / v_clipPos.w);
    float inside = step(u_channelFlag.x, clip.r)
        * step(u_channelFlag.y, clip.g)
        * step(u_channelFlag.z, clip.b)
        * step(u_channelFlag.w, clip.a);
    col.a *= inside;
    gl_FragColor = col;
}
