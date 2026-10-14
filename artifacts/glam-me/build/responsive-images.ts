import path from 'node:path';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import type { Plugin } from 'vite';

// Keep original assets/URLs intact. Derivatives are build outputs, never catalog edits.
export function responsiveImages(): Plugin {
  const moduleId = 'virtual:storefront-images';
  const resolvedId = `\0${moduleId}`;
  let root = '';
  let production = false;
  let base = '/';
  let hero: { refs: Array<{ id: string; width: number }>; width: number; height: number } | undefined;
  return {
    name: 'storefront-responsive-images',
    configResolved(config) {
      root = config.root;
      production = config.command === 'build';
      base = config.base;
    },
    resolveId(id) { if (id === moduleId) return resolvedId; },
    // Rollup's SSR default is a file:// URL. These images are served by the
    // client build; use the identical public URLs for both rendering targets.
    resolveFileUrl({ fileName }) { return JSON.stringify(`${base}${fileName}`); },
    async load(id) {
      if (id !== resolvedId) return;
      if (!production) return 'export default {};';
      const fontPackages = ['@fontsource-variable/dm-sans', '@fontsource-variable/playfair-display', '@fontsource/poppins', '@fontsource/cormorant-garamond'];
      const licenses = await Promise.all(fontPackages.map(async name => `${name}\n${await readFile(path.join(root, 'node_modules', name, 'LICENSE'), 'utf8')}`));
      this.emitFile({ type: 'asset', fileName: 'font-licenses.txt', source: licenses.join('\n\n') });
      const sources = await Promise.all(['src/App.tsx', 'src/data/catalog.ts'].map(file => readFile(path.join(root, file), 'utf8')));
      const files = [...new Set(sources.flatMap(source => [...source.matchAll(/from\s+['"]@assets\/([^'"]+\.(?:webp|png|jpe?g))['"]/g)].map(match => match[1])))];
      const imports: string[] = [];
      const records: string[] = [];
      for (const [index, file] of files.entries()) {
        const sourcePath = path.resolve(root, '../../attached_assets', file);
        const input = await readFile(sourcePath);
        const metadata = await sharp(input).metadata();
        const rotated = (metadata.orientation ?? 1) > 4;
        const width = rotated ? metadata.height! : metadata.width!;
        const height = rotated ? metadata.width! : metadata.height!;
        if (!width || !height) throw new Error(`Image has no dimensions: ${file}`);
        const widths = [...new Set([200, 480, 800, 1200, 1600].map(size => Math.min(size, width)))];
        const refs: Array<{ id: string; width: number }> = [];
        for (const size of widths) {
          const bytes = await sharp(input).rotate().resize({ width: size, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
          refs.push({ id: this.emitFile({ type: 'asset', name: `${path.parse(file).name}-${size}.webp`, source: bytes }), width: size });
        }
        imports.push(`import original${index} from ${JSON.stringify(sourcePath)};`);
        const values = refs.map(ref => `import.meta.ROLLUP_FILE_URL_${ref.id}`);
        records.push(`[original${index}]:{src:${values.at(-1)},srcSet:[${refs.map((ref, i) => `${values[i]}+" ${ref.width}w"`).join(',')}].join(", "),width:${width},height:${height}}`);
        if (file.startsWith('glam-me-home-banner_')) hero = { refs, width, height };
      }
      return `${imports.join('\n')}\nexport default {${records.join(',')}};`;
    },
    generateBundle() {
      if (!hero) return;
      const refs = hero.refs.map(ref => ({ src: `${base}${this.getFileName(ref.id)}`, width: ref.width }));
      this.emitFile({ type: 'asset', fileName: 'home-hero-preload.json', source: JSON.stringify({
        href: refs.at(-1)!.src, srcSet: refs.map(ref => `${ref.src} ${ref.width}w`).join(', '), sizes: '100vw',
      }) });
    },
  };
}
