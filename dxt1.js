/**
 * Implementation of S3TC DXT1 image compression algoritm.
 *
 * @see http://en.wikipedia.org/wiki/S3_Texture_Compression
 * @see https://www.opengl.org/wiki/S3TC
 * @see http://mrelusive.com/publications/papers/Real-Time-Dxt-Compression.pdf
 */

/**
 * Converts RGB8 color to RGB565.
 *
 * @param {Number} r Red channel of the color as a number between 0 and 255
 *      (i.e. 8-bit number).
 * @param {Number} g Green channel of the color as a number between 0 and 255
 *      (i.e. 8-bit number).
 * @param {Number} b Blue channel of the color as a number between 0 and 255
 *      (i.e. 8-bit number).
 * @returns {Number} RGB565 color as 16-bit number.
 */
function toRGB565(r, g, b) {
    return ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3);
}

/**
 * Extracts red channel from a RGB565 color. The high order bits of the channel
 *      are replicated to the low order bits the same way the GPU converts
 *      the RGB565 to RGB8.
 *
 * @param {Number} c The RGB565 color.
 * @returns {Number} Red channel as 8-bit number.
 */
function rFromRGB565(c) {
    var r = c >> 11;
    return (r << 3) | (r >> 2);
}

/**
 * Extracts green channel from a RGB565 color. The high order bits of the channel
 *      are replicated to the low order bits the same way the GPU converts
 *      the RGB565 to RGB8.
 *
 * @param {Number} c The RGB565 color.
 * @returns {Number} Green channel as 8-bit number.
 */
function gFromRGB565(c) {
    var g = (c >> 5) & 0x3f;
    return (g << 2) | (g >> 4);
}

/**
 * Extracts blue channel from a RGB565 color. The high order bits of the channel
 *      are replicated to the low order bits the same way the GPU converts
 *      the RGB565 to RGB8.
 *
 * @param {Number} c The RGB565 color.
 * @returns {Number} Blue channel as 8-bit number.
 */
function bFromRGB565(c) {
    var b = c & 0x1f;
    return (b << 3) | (b >> 2);
}

var INSET_SHIFT = 4;

var TRANSPARENT_BLOCK_SIZE = 1024; // * 4 bytes

var TRANSPARENT_BLOCK = new Uint32Array(TRANSPARENT_BLOCK_SIZE);

for (var i = 0; i < TRANSPARENT_BLOCK_SIZE; ++i) {
    TRANSPARENT_BLOCK[i] = 0xffffffff;
}

module.exports = {

    /**
     * Compresses given img ot DXT1 format.
     *
     * @param {ImageData} img Image data.
     * @param {ArrayBufferView} Compressed image.
     */
    compress: function (img) {
        var w = img.width;
        var h = img.height;

        // DXT1 requires dimensions of the image to be divisible by 4.
        if ((w & 3) | (h & 3)) {
            return null;
        }

        var pixels = img.data;
        var offset = 0;
        var compressed = new Uint32Array(w * h >> 3);
        var currWord = 0;

        var colorsR = new Array(4);
        var colorsG = new Array(4);
        var colorsB = new Array(4);

        // For every 4x4 pixel block:
        for (var i = 0; i < h; i += 4) {
            for (var j = 0; j < w; j += 4) {
                var maxR = 0;
                var maxG = 0;
                var maxB = 0;

                var minR = 0xff;
                var minG = 0xff;
                var minB = 0xff;

                // - determine RGB bbox of the block;
                for (var m = 0; m < 16; ++m) {
                    offset = 4 * ((i + (m >> 2)) * w + j + (m & 3));

                    if (maxR < pixels[offset])     { maxR = pixels[offset]; }
                    if (maxG < pixels[offset + 1]) { maxG = pixels[offset + 1]; }
                    if (maxB < pixels[offset + 2]) { maxB = pixels[offset + 2]; }

                    if (minR > pixels[offset])     { minR = pixels[offset]; }
                    if (minG > pixels[offset + 1]) { minG = pixels[offset + 1]; }
                    if (minB > pixels[offset + 2]) { minB = pixels[offset + 2]; }
                }

                // - inset bbox;
                //   @see http://mrelusive.com/publications/papers/Real-Time-Dxt-Compression.pdf#2.1
                var insetR = (maxR - minR) >> INSET_SHIFT;
                var insetG = (maxG - minG) >> INSET_SHIFT;
                var insetB = (maxB - minB) >> INSET_SHIFT;

                var maxColor565 = toRGB565(
                    (maxR >= insetR) ? (maxR - insetR) : 0,
                    (maxG >= insetG) ? (maxG - insetG) : 0,
                    (maxB >= insetB) ? (maxB - insetB) : 0
                );

                var minColor565 = toRGB565(
                    (minR + insetR < 255) ? (minR + insetR) : 255,
                    (minG + insetG < 255) ? (minG + insetG) : 255,
                    (minB + insetB < 255) ? (minB + insetB) : 255
                );

                // - if block has only one color, write it fast and continue;
                if (maxColor565 === minColor565) {
                    compressed[currWord++] = (maxColor565 << 16) | maxColor565;
                    compressed[currWord++] = 0;
                    continue;
                }

                if (maxColor565 < minColor565) {
                    var tmp = maxColor565;
                    maxColor565 = minColor565;
                    minColor565 = tmp;
                }

                // - determine palette of the block;
                var colorsR0 = colorsR[0] = rFromRGB565(maxColor565);
                var colorsG0 = colorsG[0] = gFromRGB565(maxColor565);
                var colorsB0 = colorsB[0] = bFromRGB565(maxColor565);

                var colorsR1 = colorsR[1] = rFromRGB565(minColor565);
                var colorsG1 = colorsG[1] = gFromRGB565(minColor565);
                var colorsB1 = colorsB[1] = bFromRGB565(minColor565);

                colorsR[2] = ((colorsR1 + (colorsR0 << 1)) / 3) | 0;
                colorsG[2] = ((colorsG1 + (colorsG0 << 1)) / 3) | 0;
                colorsB[2] = ((colorsB1 + (colorsB0 << 1)) / 3) | 0;

                colorsR[3] = (((colorsR1 << 1) + colorsR0) / 3) | 0;
                colorsG[3] = (((colorsG1 << 1) + colorsG0) / 3) | 0;
                colorsB[3] = (((colorsB1 << 1) + colorsB0) / 3) | 0;

                compressed[currWord++] = (minColor565 << 16) | maxColor565;

                // - find color index of every pixel in the block and write it to the buffer.
                for (var k = 0; k < 16; ++k) {
                    var minDist = 2e8;
                    var idx = 0;

                    offset = ((i + (k >> 2)) * w + j + (k & 3)) << 2;

                    for (var n = 0; n < 4; ++n) {
                        var dR = pixels[offset] - colorsR[n];
                        var dG = pixels[offset + 1] - colorsG[n];
                        var dB = pixels[offset + 2] - colorsB[n];

                        var dist = dR * dR + dG * dG + dB * dB;

                        if (minDist > dist) {
                            minDist = dist;
                            idx = n;
                        }
                    }

                    compressed[currWord] |= (idx << (k << 1));
                }

                currWord++;
            }
        }

        return compressed;
    },

    /**
     * Returns transparetn DXT1 image.
     *
     * @param {Number} width Image width, must be divisible by 4.
     * @param {Number} height Image height, must be divisible by 4.
     * @returns {ArrayBufferView} The image.
     */
    getTransparentImage: function (width, height) {
        var dataLength = width * height >> 3;
        var data = new Uint32Array(dataLength);

        // init image buffer with big chunks is faster
        // @see http://dmikis.logdown.com/posts/180879-little-hint-on-optimization-of-an-initialization-of-typed-arrays
        for (var offset = 0; offset < dataLength; offset += TRANSPARENT_BLOCK_SIZE) {
            data.set(TRANSPARENT_BLOCK, offset);
        }

        return data;
    }
};
