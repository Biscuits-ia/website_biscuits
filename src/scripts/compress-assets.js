import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { gzipSync, brotliCompressSync } from 'zlib';

const distDir = './dist';

function compressFiles(dir) {
  const files = readdirSync(dir, { withFileTypes: true });

  files.forEach((file) => {
    const fullPath = join(dir, file.name);

    if (file.isDirectory()) {
      compressFiles(fullPath);
    } else if (
      file.name.endsWith('.js') ||
      file.name.endsWith('.css') ||
      file.name.endsWith('.html') ||
      file.name.endsWith('.svg')
    ) {
      const content = readFileSync(fullPath);

      // Gzip
      const gzipped = gzipSync(content, { level: 9 });
      writeFileSync(`${fullPath}.gz`, gzipped);

      // Brotli
      const brotlied = brotliCompressSync(content, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
        },
      });
      writeFileSync(`${fullPath}.br`, brotlied);

      console.log(`✅ Compressed: ${file.name}`);
    }
  });
}
compressFiles(distDir);
console.log('🎉 Compression complete!');