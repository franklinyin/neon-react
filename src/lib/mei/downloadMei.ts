export const MEI_BLOB_TYPE = 'application/mei+xml;charset=utf-8';

export const UTF8_REGRESSION_SAMPLE =
  '<?xml version="1.0" encoding="UTF-8"?><!-- 测试 --><mei xmlns="http://www.music-encoding.org/ns/mei"/>';

export function createMeiBlob(mei: string): Blob {
  return new Blob([mei], { type: MEI_BLOB_TYPE });
}

export function downloadMei(mei: string, filename: string): void {
  const blob = createMeiBlob(mei);
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

export async function verifyUtf8MeiBlobRoundTrip(
  sample: string = UTF8_REGRESSION_SAMPLE,
): Promise<{ ok: boolean; blobText: string; mimeType: string; byteLength: number }> {
  const blob = createMeiBlob(sample);
  const blobText = await blob.text();
  return {
    ok: blobText === sample,
    blobText,
    mimeType: blob.type,
    byteLength: new TextEncoder().encode(blobText).length,
  };
}
