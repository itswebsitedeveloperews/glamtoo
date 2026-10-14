import { promisify } from 'node:util';
import { brotliCompress, gzip, constants } from 'node:zlib';

const brotli = promisify(brotliCompress);
const gzipAsync = promisify(gzip);
const cache = new Map();

export async function compressAsset(body, contentType, acceptEncoding = '', key = '') {
  if (!/^(text\/|application\/(?:javascript|json)|image\/svg)/.test(contentType) || body.length < 1024) {
    return { body, headers: {} };
  }
  const encodings = new Map(String(acceptEncoding).split(',').map(entry => {
    const [name, ...params] = entry.trim().toLowerCase().split(';');
    const q = params.find(param => param.trim().startsWith('q='));
    return [name, q ? Number(q.trim().slice(2)) : 1];
  }));
  const quality = name => encodings.get(name) ?? encodings.get('*') ?? 0;
  const encoding = quality('br') > 0 ? 'br' : quality('gzip') > 0 ? 'gzip' : '';
  if (!encoding) return { body, headers: { Vary: 'Accept-Encoding' } };
  const cacheKey = `${key}:${encoding}`;
  let compressed = key ? cache.get(cacheKey) : undefined;
  if (!compressed) {
    compressed = encoding === 'br'
      ? await brotli(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } })
      : await gzipAsync(body);
    if (key && compressed.length <= 128 * 1024) {
      if (cache.size >= 64) cache.delete(cache.keys().next().value);
      cache.set(cacheKey, compressed);
    }
  }
  return { body: compressed, headers: { Vary: 'Accept-Encoding', 'Content-Encoding': encoding } };
}
