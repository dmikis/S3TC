# S3TC
JavaScript implementation of S3TC algorithm. Only DXT1 w/o alpha implemented.
The implementation is suffiently fast to be used as an online compressor of small
images (~10-20ms for a 256 to 256 pixels).

## Usage example

Let's assume that we already have WebGL context `gl` and an CommonJS module system.
Here what we can do to create a compressed texture:

```
var s3tcExt = gl.getExtension('WEBGL_compressed_texture_s3tc') ||
    gl.getExtension('MOZ_WEBGL_compressed_texture_s3tc') ||
    gl.getExtension('WEBKIT_WEBGL_compressed_texture_s3tc');

console.assert(s3tcExt, 'Oops! No S3TC extension.');

gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
gl.compressedTexImage2D(
    gl.TEXTURE_2D,
    0,
    s3tcExt.COMPRESSED_RGBA_S3TC_DXT1_EXT,
    width,
    height,
    0,
    require('dxt1').compress(canvasWithTexture.getImageData(0, 0, width, height))
);
```
