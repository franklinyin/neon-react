export function assertLooksLikeMei(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('MEI file is empty');
  }
  if (!/<mei[\s>]/i.test(trimmed) && !trimmed.includes('music-encoding.org/ns/mei')) {
    throw new Error('File does not look like MEI');
  }
}

export async function readLocalMeiFile(file: File): Promise<string> {
  const text = await file.text();
  assertLooksLikeMei(text);
  return text;
}
