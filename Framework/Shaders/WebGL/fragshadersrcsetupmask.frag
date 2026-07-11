precision mediump float;
varying vec2 v_texCoord;
varying vec4 v_clipPos;
uniform sampler2D s_texture0;
uniform vec4 u_channelFlag;
uniform vec4 u_baseColor;
void main() {
    vec4 col = texture2D(s_texture0, v_texCoord) * u_baseColor;
    float inside = step(u_channelFlag.x, v_clipPos.x / v_clipPos.w)
        * step(u_channelFlag.y, v_clipPos.y / v_clipPos.w)
        * step(v_clipPos.x / v_clipPos.w, u_channelFlag.z)
        * step(v_clipPos.y / v_clipPos.w, u_channelFlag.w);
    col.a *= inside;
    gl_FragColor = col;
}
