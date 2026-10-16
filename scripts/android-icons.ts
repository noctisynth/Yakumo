import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

export const iconDensities = {
  mdpi: [48, 108],
  hdpi: [72, 162],
  xhdpi: [96, 216],
  xxhdpi: [144, 324],
  xxxhdpi: [192, 432],
} as const;
const names = ['ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground'];

export function applyAndroidIcons(source: string, resources: string) {
  const files: string[] = [];
  // Validate the complete input before touching generated resources.
  for (const [density, sizes] of Object.entries(iconDensities)) {
    for (const name of names) {
      const relative = `mipmap-${density}/${name}.png`;
      const bytes = readFileSync(join(source, relative));
      const size = sizes[name === 'ic_launcher_foreground' ? 1 : 0];
      if (
        bytes.length < 24 ||
        bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
        bytes.readUInt32BE(16) !== size ||
        bytes.readUInt32BE(20) !== size
      ) {
        throw new Error(`Invalid Android brand icon: ${relative}`);
      }
      files.push(relative);
    }
  }
  for (const name of ['ic_launcher', 'ic_launcher_round']) {
    const relative = `mipmap-anydpi-v26/${name}.xml`;
    const xml = readFileSync(join(source, relative), 'utf8');
    if (
      !xml.includes('<adaptive-icon') ||
      !xml.includes('@mipmap/ic_launcher_foreground') ||
      !xml.includes('@color/ic_launcher_background')
    ) {
      throw new Error(`Invalid Android adaptive brand icon: ${relative}`);
    }
    files.push(relative);
  }
  const background = 'values/ic_launcher_background.xml';
  if (
    !readFileSync(join(source, background), 'utf8').includes(
      'name="ic_launcher_background"',
    )
  ) {
    throw new Error('Android brand icon background is missing');
  }
  files.push(background);
  mkdirSync(resources, { recursive: true });
  for (const directory of readdirSync(resources, { withFileTypes: true })) {
    if (
      !directory.isDirectory() ||
      !/^(mipmap|drawable)(-|$)/.test(directory.name)
    )
      continue;
    const folder = join(resources, directory.name);
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (
        entry.isFile() &&
        /^ic_launcher(?:_round|_foreground|_background)?\.(png|webp|xml)$/.test(
          entry.name,
        )
      ) {
        rmSync(join(folder, entry.name));
      }
    }
  }
  for (const relative of files) {
    const destination = join(resources, relative);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(source, relative), destination);
  }
}
