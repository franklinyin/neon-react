export const SVG_BLOB_TYPE = 'image/svg+xml;charset=utf-8';

export function createSvgBlob(svg: string): Blob {
  return new Blob([svg], { type: SVG_BLOB_TYPE });
}

export function svgFilenameFromMeiFilename(meiFilename: string): string {
  if (/\.mei$/i.test(meiFilename)) {
    return meiFilename.replace(/\.mei$/i, '.svg');
  }
  const base = meiFilename.replace(/\.(xml)$/i, '');
  return base ? `${base}.svg` : 'score.svg';
}

export function downloadSvg(svg: string, filename: string): void {
  const blob = createSvgBlob(svg);
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 0);
}
